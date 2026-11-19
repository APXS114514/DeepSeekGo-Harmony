import { common } from '@kit.AbilityKit';
import { fileIo, fileUri } from '@kit.CoreFileKit';
import { util } from '@kit.ArkTS';
import { systemShare } from '@kit.ShareKit';
import { DeviceStatus } from './DeviceStatus';

const CACHE_AGE = 24 * 60 * 60 * 1000;
const MAX_TEXT_BYTES = 96 * 1024;

export class ShareOut {
  private readonly context: common.UIAbilityContext;
  private readonly directory: string;
  private controller: systemShare.ShareController | null = null;
  private serial: number = 0;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
    this.directory = context.cacheDir + '/shared-chats';
  }

  static supported(): boolean {
    return canIUse('SystemCapability.Collaboration.SystemShare');
  }

  async share(format: string, bytes: ArrayBuffer): Promise<number> {
    if (!ShareOut.supported()) {
      return DeviceStatus.UNSUPPORTED;
    }
    if (this.controller || bytes.byteLength === 0) {
      return DeviceStatus.CANCELLED;
    }
    if (format === 'text' && bytes.byteLength > MAX_TEXT_BYTES) {
      return DeviceStatus.TOO_LARGE;
    }
    let path = '';
    try {
      if (format !== 'text') {
        if (format !== 'markdown' && format !== 'image') {
          return DeviceStatus.FAILED;
        }
        this.prepareDirectory();
        const extension = format === 'markdown' ? 'md' : 'png';
        path = this.directory + '/Deepseek-GO-' + Date.now() + '-' + (++this.serial) + '.' + extension;
      }
      const record = this.makeRecord(format, bytes, path);
      const controller = new systemShare.ShareController(new systemShare.SharedData(record));
      this.controller = controller;
      const onDismiss = (): void => {
        controller.off('dismiss', onDismiss);
        if (this.controller === controller) {
          this.controller = null;
        }
      };
      controller.on('dismiss', onDismiss);
      await controller.show(this.context, {});
      return DeviceStatus.OK;
    } catch {
      this.controller = null;
      if (path) {
        try {
          fileIo.unlinkSync(path);
        } catch {}
      }
      return DeviceStatus.FAILED;
    }
  }

  private makeRecord(format: string, bytes: ArrayBuffer, path: string): systemShare.SharedRecord {
    if (format === 'text') {
      const content = util.TextDecoder.create('utf-8').decodeToString(new Uint8Array(bytes));
      return { utd: 'general.plain-text', content };
    }
    const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
    try {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = fileIo.writeSync(file.fd, bytes.slice(offset));
        if (written <= 0) {
          throw new Error('Short write');
        }
        offset += written;
      }
    } finally {
      fileIo.closeSync(file);
    }
    return { utd: format === 'markdown' ? 'general.markdown' : 'general.png', uri: fileUri.getUriFromPath(path) };
  }

  private prepareDirectory(): void {
    if (!fileIo.accessSync(this.directory)) {
      fileIo.mkdirSync(this.directory);
    }
    // 分享结束后接收方仍可能读取 URI，下一次分享时再清理过期文件。
    const cutoff = Date.now() - CACHE_AGE;
    for (const name of fileIo.listFileSync(this.directory)) {
      const match = /^Deepseek-GO-(\d+)-\d+\.(md|png)$/.exec(name);
      if (match && Number(match[1]) < cutoff) {
        try {
          fileIo.unlinkSync(this.directory + '/' + name);
        } catch {}
      }
    }
  }
}
