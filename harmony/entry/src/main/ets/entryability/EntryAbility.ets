import { AbilityConstant, Configuration, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { display, window } from '@kit.ArkUI';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BackgroundReply, OPEN_SESSION_KEY, OPEN_SESSION_PARAM } from '../services/BackgroundReply';
import { recordShortcut } from '../services/QuickShortcut';
import { ShareInbox } from '../services/ShareInbox';
import { FONT_SCALE_KEY } from '../window/FontScale';
import { WindowPrivacy } from '../window/WindowPrivacy';
import { systemBarProperties } from '../window/WindowInsets';

export default class EntryAbility extends UIAbility {
  private backgroundReply?: BackgroundReply;

  onCreate(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    this.backgroundReply = BackgroundReply.forAbility(this.context);
    AppStorage.setOrCreate(FONT_SCALE_KEY, this.context.config.fontSizeScale ?? 1);
    this.receive(want);
  }

  onBackground(): void {
    this.backgroundReply?.onBackground();
  }

  onForeground(): void {
    this.backgroundReply?.onForeground();
  }

  onDestroy(): void {
    this.backgroundReply?.dispose();
    this.backgroundReply = undefined;
  }

  /** 系统字体大小变化时通知页面，由页面同步给网页。 */
  onConfigurationUpdate(config: Configuration): void {
    AppStorage.setOrCreate(FONT_SCALE_KEY, config.fontSizeScale ?? 1);
  }

  onNewWant(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    this.receive(want);
  }

  /** 通知点击、桌面快捷方式与系统分享按优先级分发给页面。 */
  private receive(want: Want): void {
    const sessionId = want.parameters?.[OPEN_SESSION_PARAM];
    if (typeof sessionId === 'string' && sessionId) {
      AppStorage.setOrCreate(OPEN_SESSION_KEY, sessionId);
      return;
    }
    if (recordShortcut(want)) {
      return;
    }
    ShareInbox.receive(want);
  }

  async onWindowStageCreate(windowStage: window.WindowStage): Promise<void> {
    try {
      const mainWindow = windowStage.getMainWindowSync();
      await WindowPrivacy.instance.attach(this.context, mainWindow);
      if (deviceInfo.deviceType === 'phone' || deviceInfo.deviceType === 'tablet') {
        try {
          // 折叠屏的内外屏沿用模块声明中的桌面旋转策略。
          if (!display.isFoldable()) {
            await mainWindow.setPreferredOrientation(window.Orientation.AUTO_ROTATION_RESTRICTED);
          }
        } catch (error) {
          hilog.warn(0x0000, 'PocketChat', 'Unable to configure orientation: %{public}d', (error as BusinessError).code);
        }
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
