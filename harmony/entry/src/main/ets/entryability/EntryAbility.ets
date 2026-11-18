import { AbilityConstant, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { ShareInbox } from '../services/ShareInbox';
import { systemBarProperties } from '../window/WindowInsets';

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    ShareInbox.receive(want);
  }

  onNewWant(want: Want, _launchParam: AbilityConstant.LaunchParam): void {
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
