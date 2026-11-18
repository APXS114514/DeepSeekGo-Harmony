import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { fileIo, picker } from '@kit.CoreFileKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DeviceStatus } from './DeviceStatus';

const SAFE_NAME = /^[^\\/:*?"<>|\u0000-\u001f]{1,120}$/;

/** 用系统文件管理器让用户选择保存位置，再写入网页生成的文件。 */
export class FileSaver {
  private readonly context: common.UIAbilityContext;
  private busy: boolean = false;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  async save(name: string, data: ArrayBuffer): Promise<number> {
    if (this.busy || !SAFE_NAME.test(name)) {
      return DeviceStatus.FAILED;
    }
    this.busy = true;
    try {
      const options = new picker.DocumentSaveOptions();
      options.newFileNames = [name];
      const uris = await new picker.DocumentViewPicker(this.context).save(options);
      const uri = uris[0];
      if (!uri) {
        return DeviceStatus.CANCELLED;
      }
      const file = fileIo.openSync(uri, fileIo.OpenMode.WRITE_ONLY | fileIo.OpenMode.TRUNC);
      try {
        let offset = 0;
        while (offset < data.byteLength) {
          const written = fileIo.writeSync(file.fd, data.slice(offset));
          if (written <= 0) {
            throw new Error('Short write');
          }
          offset += written;
        }
      } finally {
        fileIo.closeSync(file);
      }
      return DeviceStatus.OK;
    } catch (error) {
      const code = (error as BusinessError).code;
      hilog.warn(0x0000, 'PocketChat', 'Cannot save file: %{public}d', code ?? -1);
      return code || DeviceStatus.FAILED;
    } finally {
      this.busy = false;
    }
  }
}
