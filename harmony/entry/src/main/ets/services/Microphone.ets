import { abilityAccessCtrl, bundleManager, common, Permissions } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const MICROPHONE: Permissions = 'ohos.permission.MICROPHONE';
const CONSENT_STORE = 'web_microphone';

function hasMicrophonePermission(manager: abilityAccessCtrl.AtManager): boolean {
  try {
    const info = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
    return manager.checkAccessTokenSync(info.appInfo.accessTokenId, MICROPHONE) ===
      abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
  } catch (error) {
    hilog.warn(0x0000, 'PocketChat', 'Cannot check microphone permission: %{public}d', (error as BusinessError).code);
    return false;
  }
}

export async function requestMicrophone(context: common.UIAbilityContext): Promise<boolean> {
  try {
    const manager = abilityAccessCtrl.createAtManager();
    if (hasMicrophonePermission(manager)) {
      return true;
    }
    const result = await manager.requestPermissionsFromUser(context, [MICROPHONE]);
    if (result.authResults[0] === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED) {
      return true;
    }
    // 用户此前拒绝过时，系统不再弹窗，改用二次授权弹窗引导开启。
    if (result.dialogShownResults?.[0] === false) {
      const statuses = await manager.requestPermissionOnSetting(context, [MICROPHONE]);
      return statuses[0] === abilityAccessCtrl.GrantStatus.PERMISSION_GRANTED;
    }
  } catch (error) {
    hilog.warn(0x0000, 'PocketChat', 'Cannot request microphone: %{public}d', (error as BusinessError).code);
  }
  return false;
}

/** 只记住内置页面的明确同意，每次录音仍以系统的麦克风权限为准。 */
export class WebMicrophonePermission {
  private readonly context: common.UIAbilityContext;
  private readonly origin: string;
  private readonly confirm: () => Promise<boolean>;
  private remembered: boolean = false;
  private pending: boolean = false;

  constructor(context: common.UIAbilityContext, origin: string, confirm: () => Promise<boolean>) {
    this.context = context;
    this.origin = origin;
    this.confirm = confirm;
  }

  async authorize(request: PermissionRequest, isCurrent: () => boolean): Promise<void> {
    const origin = request.getOrigin();
    const resources = request.getAccessibleResource();
    const audio = ProtectedResourceType.AUDIO_CAPTURE;
    if (!isCurrent() || this.pending || (origin !== this.origin && origin !== this.origin + '/') ||
      resources.length !== 1 || resources[0] !== audio ||
      !canIUse('SystemCapability.Multimedia.Audio.Capturer')) {
      request.deny();
      return;
    }
    this.pending = true;
    try {
      const remembered = this.hasConsent();
      if ((remembered || await this.confirm()) && isCurrent() &&
        await requestMicrophone(this.context) && isCurrent()) {
        request.grant([audio]);
        if (!remembered) {
          this.rememberConsent();
        }
      } else {
        request.deny();
      }
    } finally {
      this.pending = false;
    }
  }

  private store(): preferences.Preferences {
    return preferences.getPreferencesSync(this.context, { name: CONSENT_STORE });
  }

  private hasConsent(): boolean {
    if (!this.remembered) {
      try {
        this.remembered = this.store().getSync(this.origin, false) === true;
      } catch (error) {
        hilog.warn(0x0000, 'PocketChat', 'Cannot read web microphone consent: %{public}d',
          (error as BusinessError).code);
      }
    }
    return this.remembered;
  }

  private rememberConsent(): void {
    this.remembered = true;
    try {
      const store = this.store();
      store.putSync(this.origin, true);
      store.flush().catch((error: BusinessError) => {
        hilog.warn(0x0000, 'PocketChat', 'Cannot persist web microphone consent: %{public}d', error.code);
      });
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Cannot save web microphone consent: %{public}d',
        (error as BusinessError).code);
    }
  }
}
