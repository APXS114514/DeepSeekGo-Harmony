import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { util } from '@kit.ArkTS';
import { asset } from '@kit.AssetStoreKit';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BackgroundReply, ReplyDone } from './BackgroundReply';
import { DeviceStatus } from './DeviceStatus';
import { FileSaver } from './FileSaver';
import { LocalSpeech } from './LocalSpeech';
import { LocationService } from './LocationService';
import { ShareOut } from './ShareOut';
import { TextScanner } from './TextScanner';
import type { ScanSourceLabels, ScanSourcePicker } from './ScanSourceMenu';
import { WindowPrivacy } from '../window/WindowPrivacy';
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
  apiVoice: boolean;
  readAloud: boolean;
  share: boolean;
  scan: boolean;
  immersiveScanMenu: boolean;
  save: boolean;
  location: boolean;
  windowPrivacy: boolean | null;
  deviceType: string;
}

interface LocationRequestPayload {
  locale?: string;
  openSettings?: boolean;
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
  private readonly speech: LocalSpeech;
  private readonly location: LocationService;
  private readonly shareOut: ShareOut;
  private readonly background: BackgroundReply;
  private readonly presentScanSource: ScanSourcePicker;
  private readonly privacy: WindowPrivacy;
  private scanMenuOpen: boolean = false;

  constructor(context: common.UIAbilityContext, privacy: WindowPrivacy, presentScanSource: ScanSourcePicker,
    emit: (message: string) => void) {
    this.privacy = privacy;
    this.context = context;
    this.presentScanSource = presentScanSource;
    this.voice = new VoiceInput(context, emit);
    this.scanner = new TextScanner(context);
    this.saver = new FileSaver(context);
    this.speech = new LocalSpeech(emit);
    this.location = new LocationService(context);
    this.shareOut = new ShareOut(context);
    this.background = BackgroundReply.forAbility(context);
  }

  features(): Promise<string> {
    const scan = TextScanner.supported();
    const picker = scan ? this.loadScanSourcePicker() : Promise.resolve(null);
    return picker.then((pick) => {
      const features: DeviceFeatures = {
        type: 'device-features',
        voice: VoiceInput.supported(),
        apiVoice: canIUse('SystemCapability.Multimedia.Audio.Capturer'),
        readAloud: LocalSpeech.supported(),
        share: ShareOut.supported(),
        scan: scan,
        immersiveScanMenu: pick !== null,
        save: true,
        location: LocationService.supported(),
        windowPrivacy: this.privacy.current,
        deviceType: deviceInfo.deviceType
      };
      return JSON.stringify(features);
    });
  }

  private loadScanSourcePicker(): Promise<ScanSourcePicker | null> {
    // Older runtimes never load the API 26 material module.
    if (deviceInfo.sdkApiVersion >= 26) {
      if (deviceInfo.apiAvailable('26.0.0')) {
        return import('../window/ImmersiveMaterial').then((material): ScanSourcePicker | null => {
          return material.supportsImmersiveMaterial() ? this.presentScanSource : null;
        }).catch(() => {
          hilog.warn(0x0000, 'PocketChat', 'Cannot load immersive scan menu');
          return null;
        });
      }
    }
    return Promise.resolve(null);
  }

  /** 页面隐藏或端口重连时中断进行中的收音。 */
  interrupt(): void {
    this.voice.interrupt();
    this.speech.stop();
  }

  setForeground(active: boolean): void {
    this.location.setForeground(active);
  }

  setGenerating(generating: boolean): void {
    this.background.setGenerating(generating);
  }

  dispose(): void {
    this.voice.dispose();
    this.speech.dispose();
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
        case 'speak-stop':
          if (typeof request.value === 'string') {
            this.speech.stop(request.value);
          }
          return;
        case 'reply-done':
          this.handleReplyDone(request.value);
          return;
        case 'notify-permission':
          this.background.requestPermission(request.value === 'settings').then((status) => {
            this.reply(port, { id: request.id, status: status, value: '' });
          });
          return;
        case 'window-privacy':
          if (request.value === 'true' || request.value === 'false') {
            this.privacy.set(request.value === 'true').then((status) => {
              this.reply(port, { id: request.id, status: status, value: String(this.privacy.current) });
            });
          }
          return;
        case 'scan':
          this.scanner.scan(request.value ?? '').then((result) => {
            this.reply(port, { id: request.id, status: result.status, value: result.text });
          });
          return;
        case 'scan-source':
          this.chooseScanSource(request).then((result) => this.reply(port, result));
          return;
        case 'location':
          this.handleLocation(request, port);
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
        typeof labels.album !== 'string' || typeof labels.cancel !== 'string' || labels.title.length > 120 ||
        labels.camera.length > 120 || labels.album.length > 120 || labels.cancel.length > 120) {
        return reply;
      }
      return pickSource(labels).then((source) => {
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

  private handleLocation(request: DeviceRequest, port: webview.WebMessagePort): void {
    let locale = 'zh-CN';
    let openSettings = false;
    if (typeof request.value === 'string' && request.value) {
      try {
        const parsed = JSON.parse(request.value) as LocationRequestPayload;
        if (typeof parsed?.locale === 'string' && parsed.locale.length <= 16) {
          locale = parsed.locale;
        }
        openSettings = parsed?.openSettings === true;
      } catch {
        // 使用默认参数。
      }
    }
    this.location.locate(locale, openSettings).then((result) => {
      this.reply(port, { id: request.id, status: result.status, value: result.value });
    });
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
    if (!Number.isSafeInteger(request?.id) || typeof request.value !== 'string') {
      return;
    }
    const length = frame.byteLength - 4 - headerLength;
    const send = (status: number): void => this.reply(port, { id: request.id, status, value: '' });
    const value = request.value;
    switch (request.operation) {
      case 'save-file':
        if (length > MAX_SAVE_BYTES) {
          send(DeviceStatus.TOO_LARGE);
        } else {
          this.saver.save(value, frame.slice(4 + headerLength)).then(send);
        }
        return;
      case 'share-content':
        if (length > 12 * 1024 * 1024) {
          send(DeviceStatus.TOO_LARGE);
        } else {
          this.shareOut.share(value, frame.slice(4 + headerLength)).then(send);
        }
        return;
      case 'speak-text':
        if (length > 256 * 1024) {
          send(DeviceStatus.TOO_LARGE);
        } else {
          const text = util.TextDecoder.create('utf-8').decodeToString(new Uint8Array(frame, 4 + headerLength));
          this.speech.start(value, text).then(send);
        }
        return;
      default:
        return;
    }
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
