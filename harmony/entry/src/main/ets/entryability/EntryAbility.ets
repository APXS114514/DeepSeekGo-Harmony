import { AbilityConstant, Configuration, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { OPEN_SESSION_KEY, OPEN_SESSION_PARAM } from '../services/BackgroundReply';
import { ShareInbox } from '../services/ShareInbox';
import { FONT_SCALE_KEY } from '../window/FontScale';
import { systemBarProperties } from '../window/WindowInsets';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    AppStorage.setOrCreate(FONT_SCALE_KEY, this.context.config.fontSizeScale ?? 1);
    this.receive(want);
  }

  /** 系统字体大小变化时通知页面，由页面同步给网页。 */
  onConfigurationUpdate(config: Configuration): void {
    AppStorage.setOrCreate(FONT_SCALE_KEY, config.fontSizeScale ?? 1);
  }

  onNewWant(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    this.receive(want);
  }

  /** 系统分享交给 ShareInbox；点击回答完成通知时记下要打开的对话。 */
  private receive(want: Want): void {
    const sessionId = want.parameters?.[OPEN_SESSION_PARAM];
    if (typeof sessionId === 'string' && sessionId) {
      AppStorage.setOrCreate(OPEN_SESSION_KEY, sessionId);
      return;
    }
    ShareInbox.receive(want);
  }

  async onWindowStageCreate(windowStage: window.WindowStage): Promise<void> {
    try {
      const mainWindow = windowStage.getMainWindowSync();
      if (deviceInfo.deviceType === 'phone' || deviceInfo.deviceType === 'tablet') {
        mainWindow.setPreferredOrientation(window.Orientation.AUTO_ROTATION_RESTRICTED)
          .catch((error: BusinessError) => {
            hilog.warn(0x0000, 'PocketChat', 'Unable to set orientation: %{public}d', error.code);
          });
      }
      if (deviceInfo.deviceType !== '2in1') {
        await mainWindow.setWindowLayoutFullScreen(true);
      }
      const dark = this.context.config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
      await mainWindow.setWindowSystemBarProperties(systemBarProperties(dark));
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Unable to configure main window: %{public}d', (error as BusinessError).code);
    }
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code) {
        hilog.error(0x0000, 'PocketChat', 'Unable to load main page: %{public}d', error.code);
      }
    });
  }
}
