import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { preferences } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DeviceStatus } from '../services/DeviceStatus';

const PRIVACY_KEY = 'screen_capture_blocked';

export class WindowPrivacy {
  static readonly instance: WindowPrivacy = new WindowPrivacy();

  private settings?: preferences.Preferences;
  private mainWindow?: window.Window;
  private enabled = false;
  private updating = false;

  get current(): boolean | null {
    return this.mainWindow && this.settings ? this.enabled : null;
  }

  async attach(context: common.UIAbilityContext, mainWindow: window.Window): Promise<void> {
    if (!canIUse('SystemCapability.WindowManager.WindowManager.Core')) {
      return;
    }
    try {
      this.settings = preferences.getPreferencesSync(context, { name: 'window_privacy' });
      this.mainWindow = mainWindow;
      if (this.settings.getSync(PRIVACY_KEY, false) === true) {
        await mainWindow.setWindowPrivacyMode(true);
        this.enabled = true;
      }
    } catch {
      hilog.warn(0x0000, 'PocketChat', 'Cannot restore window privacy');
    }
  }

  async set(enabled: boolean): Promise<number> {
    const mainWindow = this.mainWindow;
    const settings = this.settings;
    if (!mainWindow || !settings) {
      return DeviceStatus.UNSUPPORTED;
    }
    if (this.updating) {
      return DeviceStatus.FAILED;
    }
    this.updating = true;
    const previous = this.enabled;
    try {
      await mainWindow.setWindowPrivacyMode(enabled);
      this.enabled = enabled;
      settings.putSync(PRIVACY_KEY, enabled);
      await settings.flush();
      return DeviceStatus.OK;
    } catch {
      if (this.enabled !== previous) {
        try {
          settings.putSync(PRIVACY_KEY, previous);
          await mainWindow.setWindowPrivacyMode(previous);
          this.enabled = previous;
          await settings.flush();
        } catch {
          hilog.warn(0x0000, 'PocketChat', 'Cannot restore the previous window privacy setting');
        }
      }
      return DeviceStatus.FAILED;
    } finally {
      this.updating = false;
    }
  }
}
