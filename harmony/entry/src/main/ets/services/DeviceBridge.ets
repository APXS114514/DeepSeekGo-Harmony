import { common } from '@kit.AbilityKit';
import { UIContext } from '@kit.ArkUI';
import { webview } from '@kit.ArkWeb';
import { util } from '@kit.ArkTS';
import { asset } from '@kit.AssetStoreKit';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BackgroundReply, ReplyDone } from './BackgroundReply';
import { DeviceStatus } from './DeviceStatus';
import { FileSaver } from './FileSaver';
import { TextScanner } from './TextScanner';
import { VoiceInput } from './VoiceInput';

interface DeviceRequest {
  id: number;
  operation: string;
  value?: string;
}

interface DeviceReply {
  id: number;
  status: number;
  value: string;
}

interface DeviceFeatures {
  type: string;
  voice: boolean;
  scan: boolean;
  immersiveScanMenu: boolean;
  save: boolean;
  deviceType: string;
}

interface ScanSourceLabels {
  title: string;
  camera: string;
  album: string;
}

type ScanSourcePicker = (title: string, camera: string, album: string) => Promise<string | null>;

/** 二进制消息：4 字节小端头长度 + JSON 头 + 文件内容。 */
const MAX_FRAME_HEADER = 4096;
const MAX_SAVE_BYTES = 512 * 1024 * 1024;

export class DeviceBridge {
  private readonly alias: Uint8Array = new util.TextEncoder().encodeInto('pocket-chat-deepseek-key');
  private readonly context: common.UIAbilityContext;
  private readonly voice: VoiceInput;
  private readonly scanner: TextScanner;
  private readonly saver: FileSaver;
  private readonly background: BackgroundReply;
  private readonly ui: UIContext;
  private scanMenuOpen: boolean = false;

  constructor(context: common.UIAbilityContext, ui: UIContext, emit: (message: string) => void) {
    this.context = context;
    this.ui = ui;
    this.voice = new VoiceInput(context, emit);
    this.scanner = new TextScanner(context);
    this.saver = new FileSaver(context);
    this.background = BackgroundReply.forAbility(context);
  }

  async features(): Promise<string> {
    const scan = TextScanner.supported();
    const features: DeviceFeatures = {
      type: 'device-features',
      voice: VoiceInput.supported(),
      scan: scan,
      immersiveScanMenu: scan && (await this.loadScanSourcePicker()) !== null,
      save: true,
      deviceType: deviceInfo.deviceType
    };
    return JSON.stringify(features);
  }

  private async loadScanSourcePicker(): Promise<ScanSourcePicker | null> {
    // Older runtimes never load the API 26 material module.
    try {
      if (deviceInfo.sdkApiVersion >= 26) {
        if (deviceInfo.apiAvailable('26.0.0')) {
          return await import('./ScanSourceMenu').then((menu): ScanSourcePicker | null => {
            if (menu.supportsImmersiveScanMenu()) {
              return (title: string, camera: string, album: string): Promise<string | null> =>
                menu.chooseScanSource(this.ui, title, camera, album);
            }
            return null;
          });
        }
      }
    } catch {
      hilog.warn(0x0000, 'PocketChat', 'Cannot query immersive scan menu support');
    }
    return null;
  }

  /** 页面隐藏或端口重连时中断进行中的收音。 */
  interrupt(): void {
    this.voice.interrupt();
  }

  setGenerating(generating: boolean): void {
    this.background.setGenerating(generating);
  }

  dispose(): void {
    this.voice.dispose();
    this.background.setGenerating(false);
  }

  handle(message: webview.WebMessage, port: webview.WebMessagePort, onWindowUi: (value: string) => void): void {
    if (message instanceof ArrayBuffer) {
      this.handleFrame(message, port);
      return;
    }
    if (typeof message !== 'string' || message.length > 8192) {
      return;
    }
    try {
      const request = JSON.parse(message) as DeviceRequest;
      if (!Number.isSafeInteger(request?.id)) {
        return;
      }
      let reply: DeviceReply;
      switch (request.operation) {
        case 'read':
          reply = this.readApiKey(request.id);
          break;
        case 'save':
          reply = { id: request.id, status: this.saveApiKey(request.value), value: '' };
          break;
        case 'open':
          this.openExternal(request.value);
          return;
        case 'window-ui':
          if (typeof request.value === 'string') {
            onWindowUi(request.value);
          }
          return;
        case 'voice':
          this.handleVoice(request, port);
          return;
        case 'reply-done':
          this.handleReplyDone(request.value);
          return;
        case 'notify-permission':
          this.background.requestPermission(request.value === 'settings').then((status) => {
            this.reply(port, { id: request.id, status: status, value: '' });
          });
          return;
        case 'scan':
          this.scanner.scan(request.value ?? '').then((result) => {
            this.reply(port, { id: request.id, status: result.status, value: result.text });
          });
          return;
        case 'scan-source':
          this.chooseScanSource(request).then((result) => this.reply(port, result));
          return;
        default:
          return;
      }
      this.reply(port, reply);
    } catch {
      hilog.warn(0x0000, 'PocketChat', 'Unable to handle a local page message');
    }
  }

  private async chooseScanSource(request: DeviceRequest): Promise<DeviceReply> {
    const reply: DeviceReply = { id: request.id, status: DeviceStatus.FAILED, value: '' };
    if (this.scanMenuOpen) {
      reply.status = DeviceStatus.CANCELLED;
      return reply;
    }
    if (!TextScanner.supported()) {
      reply.status = DeviceStatus.UNSUPPORTED;
      return reply;
    }
    this.scanMenuOpen = true;
    return this.loadScanSourcePicker().then((pickSource) => {
      if (!pickSource) {
        reply.status = DeviceStatus.UNSUPPORTED;
        return reply;
      }
      const labels = JSON.parse(request.value ?? 'null') as ScanSourceLabels;
      if (typeof labels?.title !== 'string' || typeof labels.camera !== 'string' ||
        typeof labels.album !== 'string' || labels.title.length > 120 ||
        labels.camera.length > 120 || labels.album.length > 120) {
        return reply;
      }
      return pickSource(labels.title, labels.camera, labels.album).then((source) => {
        if (source !== null) {
          reply.status = source ? DeviceStatus.OK : DeviceStatus.CANCELLED;
          reply.value = source;
        }
        return reply;
      });
    }).catch((error: BusinessError) => {
      hilog.warn(0x0000, 'PocketChat', 'Cannot open immersive scan menu: %{public}d', error.code);
      return reply;
    }).finally(() => {
      this.scanMenuOpen = false;
    });
  }

  private handleReplyDone(value?: string): void {
    if (typeof value !== 'string') {
      return;
    }
    const reply = JSON.parse(value) as ReplyDone;
    if (typeof reply?.sessionId === 'string' && reply.sessionId.length <= 64 &&
      typeof reply.title === 'string' && typeof reply.text === 'string') {
      this.background.replyDone(reply);
    }
  }

  private handleVoice(request: DeviceRequest, port: webview.WebMessagePort): void {
    if (request.value === 'start') {
      this.voice.start().then((status) => this.reply(port, { id: request.id, status: status, value: '' }));
    } else if (request.value === 'stop') {
      this.voice.stop();
    } else if (request.value === 'cancel') {
      this.voice.cancel();
    }
  }

  private handleFrame(frame: ArrayBuffer, port: webview.WebMessagePort): void {
    if (frame.byteLength < 4 || frame.byteLength > MAX_SAVE_BYTES + MAX_FRAME_HEADER) {
      return;
    }
    const headerLength = new DataView(frame).getUint32(0, true);
    if (headerLength === 0 || headerLength > MAX_FRAME_HEADER || 4 + headerLength > frame.byteLength) {
      return;
    }
    let request: DeviceRequest;
    try {
      const header = util.TextDecoder.create('utf-8').decodeToString(new Uint8Array(frame, 4, headerLength));
      request = JSON.parse(header) as DeviceRequest;
    } catch {
      return;
    }
    if (!Number.isSafeInteger(request?.id) || request.operation !== 'save-file' ||
      typeof request.value !== 'string') {
      return;
    }
    const data = frame.slice(4 + headerLength);
    if (data.byteLength > MAX_SAVE_BYTES) {
      this.reply(port, { id: request.id, status: DeviceStatus.TOO_LARGE, value: '' });
      return;
    }
    this.saver.save(request.value, data).then((status) => {
      this.reply(port, { id: request.id, status: status, value: '' });
    });
  }

  private reply(port: webview.WebMessagePort, reply: DeviceReply): void {
    try {
      port.postMessageEvent(JSON.stringify(reply));
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Unable to reply to local page: %{public}d', (error as BusinessError).code);
    }
  }

  private readApiKey(id: number): DeviceReply {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, this.alias);
    query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const result = asset.querySync(query)[0];
      const secret = result?.get(asset.Tag.SECRET);
      if (secret instanceof Uint8Array) {
        return { id, status: 0, value: util.TextDecoder.create('utf-8').decodeToString(secret) };
      }
    } catch (error) {
      const code = (error as BusinessError).code;
      if (code !== asset.ErrorCode.NOT_FOUND) {
        hilog.warn(0x0000, 'PocketChat', 'Cannot read API key: %{public}d', code);
        return { id, status: code || -1, value: '' };
      }
    }
    return { id, status: 0, value: '' };
  }

  private saveApiKey(value?: string): number {
    if (typeof value !== 'string') {
      return asset.ErrorCode.INVALID_ARGUMENT;
    }
    const secret = new util.TextEncoder().encodeInto(value);
    if (secret.length >= 1024) {
      return asset.ErrorCode.INVALID_ARGUMENT;
    }
    const attributes: asset.AssetMap = new Map();
    attributes.set(asset.Tag.ALIAS, this.alias);
    try {
      if (value === '') {
        asset.removeSync(attributes);
      } else {
        attributes.set(asset.Tag.SECRET, secret);
        attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
        attributes.set(asset.Tag.CONFLICT_RESOLUTION, asset.ConflictResolution.OVERWRITE);
        asset.addSync(attributes);
      }
      return 0;
    } catch (error) {
      const code = (error as BusinessError).code;
      if (value === '' && code === asset.ErrorCode.NOT_FOUND) {
        return 0;
      }
      hilog.warn(0x0000, 'PocketChat', 'Cannot modify API key: %{public}d', code);
      return code || -1;
    }
  }

  private openExternal(address?: string): void {
    if (typeof address !== 'string' || !/^https?:\/\//i.test(address)) {
      return;
    }
    this.context.startAbility({
      action: 'ohos.want.action.viewData',
      entities: ['entity.system.browsable'],
      uri: address
    }).catch((error: BusinessError) => {
      hilog.warn(0x0000, 'PocketChat', 'Cannot open browser link: %{public}d', error.code);
    });
  }
}
