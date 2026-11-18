import { common } from '@kit.AbilityKit';
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
  save: boolean;
  deviceType: string;
}

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

  constructor(context: common.UIAbilityContext, emit: (message: string) => void) {
    this.context = context;
    this.voice = new VoiceInput(context, emit);
    this.scanner = new TextScanner(context);
    this.saver = new FileSaver(context);
    this.background = new BackgroundReply(context);
  }

  features(): string {
    const features: DeviceFeatures = {
      type: 'device-features',
      voice: VoiceInput.supported(),
      scan: TextScanner.supported(),
      save: true,
      deviceType: deviceInfo.deviceType
    };
    return JSON.stringify(features);
  }

  /** 页面隐藏或端口重连时中断进行中的收音。 */
  interrupt(): void {
    this.voice.interrupt();
  }

  /** 应用切到后台：停止收音；仍在生成回答时申请短时任务。 */
  onHide(): void {
    this.voice.interrupt();
    this.background.onHide();
  }

  onShow(): void {
    this.background.onShow();
  }

  setGenerating(generating: boolean): void {
    this.background.setGenerating(generating);
  }

  dispose(): void {
    this.voice.dispose();
    this.background.dispose();
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
          this.background.requestPermission().then((status) => {
            this.reply(port, { id: request.id, status: status, value: '' });
          });
          return;
        case 'scan':
          this.scanner.scan(request.value ?? '').then((result) => {
            this.reply(port, { id: request.id, status: result.status, value: result.text });
          });
          return;
        default:
          return;
      }
      this.reply(port, reply);
    } catch {
      hilog.warn(0x0000, 'PocketChat', 'Unable to handle a local page message');
    }
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
