import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { util } from '@kit.ArkTS';
import { asset } from '@kit.AssetStoreKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

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

export class DeviceBridge {
  private readonly alias: Uint8Array = new util.TextEncoder().encodeInto('pocket-chat-deepseek-key');
  private readonly context: common.UIAbilityContext;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  handle(message: webview.WebMessage, port: webview.WebMessagePort, onWindowUi: (value: string) => void): void {
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
        default:
          return;
      }
      port.postMessageEvent(JSON.stringify(reply));
    } catch {
      hilog.warn(0x0000, 'PocketChat', 'Unable to handle a local page message');
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
