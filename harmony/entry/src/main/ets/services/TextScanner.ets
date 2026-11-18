import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { camera, cameraPicker } from '@kit.CameraKit';
import { fileIo } from '@kit.CoreFileKit';
import { textRecognition } from '@kit.CoreVisionKit';
import { image } from '@kit.ImageKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DeviceStatus } from './DeviceStatus';

/** 识别前把长边缩到这个尺寸以内，兼顾速度和小字清晰度。 */
const MAX_EDGE = 4096;

export interface ScanResult {
  status: number;
  text: string;
}

/** 用系统相机或图库取一张图，在本机识别其中的文字。系统 Picker 不需要相机和相册权限。 */
export class TextScanner {
  private readonly context: common.UIAbilityContext;
  private busy: boolean = false;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  static supported(): boolean {
    return canIUse('SystemCapability.AI.OCR.TextRecognition');
  }

  async scan(source: string): Promise<ScanResult> {
    if (!TextScanner.supported()) {
      return { status: DeviceStatus.UNSUPPORTED, text: '' };
    }
    if (this.busy || (source !== 'camera' && source !== 'album')) {
      return { status: DeviceStatus.FAILED, text: '' };
    }
    this.busy = true;
    try {
      const uri = source === 'camera' ? await this.takePhoto() : await this.pickPhoto();
      if (!uri) {
        return { status: DeviceStatus.CANCELLED, text: '' };
      }
      return { status: DeviceStatus.OK, text: await this.recognize(uri) };
    } catch (error) {
      const code = (error as BusinessError).code;
      hilog.warn(0x0000, 'PocketChat', 'Cannot scan text: %{public}d', code);
      return { status: code || DeviceStatus.FAILED, text: '' };
    } finally {
      this.busy = false;
    }
  }

  private async takePhoto(): Promise<string> {
    const profile: cameraPicker.PickerProfile = { cameraPosition: camera.CameraPosition.CAMERA_POSITION_BACK };
    const result = await cameraPicker.pick(this.context, [cameraPicker.PickerMediaType.PHOTO], profile);
    return result.resultCode === 0 ? result.resultUri ?? '' : '';
  }

  private async pickPhoto(): Promise<string> {
    const options = new photoAccessHelper.PhotoSelectOptions();
    options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
    options.maxSelectNumber = 1;
    const result = await new photoAccessHelper.PhotoViewPicker().select(options);
    return result.photoUris[0] ?? '';
  }

  private async recognize(uri: string): Promise<string> {
    const file = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY);
    let source: image.ImageSource | null = null;
    let pixelMap: image.PixelMap | null = null;
    try {
      source = image.createImageSource(file.fd);
      const info = await source.getImageInfo();
      const scale = Math.min(1, MAX_EDGE / Math.max(info.size.width, info.size.height, 1));
      const options: image.DecodingOptions = {
        desiredSize: { width: Math.round(info.size.width * scale), height: Math.round(info.size.height * scale) },
        desiredPixelFormat: image.PixelMapFormat.RGBA_8888
      };
      pixelMap = await source.createPixelMap(options);
      const result = await textRecognition.recognizeText({ pixelMap: pixelMap }, { isDirectionDetectionSupported: true });
      return result.value ?? '';
    } finally {
      pixelMap?.release();
      source?.release();
      try {
        fileIo.closeSync(file);
      } catch {
        hilog.warn(0x0000, 'PocketChat', 'Cannot close scanned image');
      }
    }
  }
}
