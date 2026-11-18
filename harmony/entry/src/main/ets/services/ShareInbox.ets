import { Want } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { fileIo } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { systemShare } from '@kit.ShareKit';
import { util } from '@kit.ArkTS';

const SEND_DATA = 'ohos.want.action.sendData';
const MAX_ITEMS = 9;
const MAX_TEXT = 100000;
/** 单个文件和整批文件的上限，超出部分只计数并提示，不读入内存。 */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

export interface SharedItem {
  kind: string;
  text: string;
  name: string;
  data: string;
}

export interface SharePayload {
  type: string;
  items: SharedItem[];
  skipped: number;
}

/**
 * 接收其他应用通过系统分享发来的文字、链接、图片和文档。
 * 冷启动时页面尚未连接，内容先排队，连上后由页面取走。
 */
export class ShareInbox {
  private static pending: SharePayload[] = [];
  private static listener: (() => void) | null = null;

  static receive(want: Want): void {
    if (want.action !== SEND_DATA) {
      return;
    }
    systemShare.getSharedData(want).then((data) => {
      const payload = ShareInbox.read(data.getRecords());
      if (payload.items.length > 0 || payload.skipped > 0) {
        ShareInbox.pending.push(payload);
        ShareInbox.listener?.();
      }
    }).catch((error: BusinessError) => {
      hilog.warn(0x0000, 'PocketChat', 'Cannot read shared data: %{public}d', error.code);
    });
  }

  static subscribe(listener: () => void): void {
    ShareInbox.listener = listener;
    if (ShareInbox.pending.length > 0) {
      listener();
    }
  }

  static unsubscribe(listener: () => void): void {
    if (ShareInbox.listener === listener) {
      ShareInbox.listener = null;
    }
  }

  static take(): SharePayload[] {
    const payloads = ShareInbox.pending;
    ShareInbox.pending = [];
    return payloads;
  }

  private static read(records: systemShare.SharedRecord[]): SharePayload {
    const payload: SharePayload = { type: 'share', items: [], skipped: 0 };
    let total = 0;
    for (const record of records) {
      if (payload.items.length >= MAX_ITEMS) {
        payload.skipped++;
        continue;
      }
      const text = ShareInbox.describe(record);
      if (text) {
        payload.items.push({ kind: 'text', text: text.slice(0, MAX_TEXT), name: '', data: '' });
        continue;
      }
      const uri = record.uri ?? '';
      if (!uri) {
        payload.skipped++;
        continue;
      }
      try {
        const file = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY);
        try {
          const size = fileIo.statSync(file.fd).size;
          if (size <= 0 || size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) {
            payload.skipped++;
            continue;
          }
          const buffer = new ArrayBuffer(size);
          let offset = 0;
          while (offset < size) {
            const read = fileIo.readSync(file.fd, buffer, { offset: offset, length: size - offset });
            if (read <= 0) {
              break;
            }
            offset += read;
          }
          if (offset !== size) {
            payload.skipped++;
            continue;
          }
          total += size;
          payload.items.push({
            kind: 'file',
            text: '',
            name: ShareInbox.fileName(uri, record.title),
            data: new util.Base64Helper().encodeToStringSync(new Uint8Array(buffer))
          });
        } finally {
          fileIo.closeSync(file);
        }
      } catch (error) {
        hilog.warn(0x0000, 'PocketChat', 'Cannot read shared file: %{public}d', (error as BusinessError).code);
        payload.skipped++;
      }
    }
    return payload;
  }

  /** 文字和链接直接取内容；链接带上标题，方便模型理解来源。 */
  private static describe(record: systemShare.SharedRecord): string {
    const content = (record.content ?? '').trim();
    if (!content || record.uri) {
      return '';
    }
    const title = (record.title ?? '').trim();
    return title && title !== content && /^https?:\/\//i.test(content) ? title + '\n' + content : content;
  }

  private static fileName(uri: string, title?: string): string {
    let name = '';
    try {
      name = decodeURIComponent(uri.substring(uri.lastIndexOf('/') + 1).split('?')[0]);
    } catch {
      name = '';
    }
    if (!name.includes('.') && title && title.includes('.')) {
      name = title;
    }
    return (name || 'shared-file').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(-120);
  }
}
