import { promptAction, uiMaterial, UIContext } from '@kit.ArkUI';
import { Available, BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

/** Only loaded after the bridge checks the API version. */
@Available({ minApiVersion: '26.0.0' })
export function supportsImmersiveScanMenu(): boolean {
  return canIUse('SystemCapability.ArkUI.ArkUI.Full') && uiMaterial.isImmersiveMaterialSupported() &&
    uiMaterial.getMaterialInfo().state !== uiMaterial.MaterialState.DISABLE;
}

@Available({ minApiVersion: '26.0.0' })
export async function chooseScanSource(ui: UIContext, title: string, camera: string, album: string): Promise<string | null> {
  let appeared = false;
  const color = $r('sys.color.ohos_id_color_text_primary');
  const options: promptAction.ActionMenuOptions = {
    title: title,
    buttons: [{ text: camera, color: color }, { text: album, color: color }],
    onWillAppear: () => { appeared = true; },
    systemMaterial: new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.ULTRA_THICK })
  };
  try {
    const result = await ui.getPromptAction().showActionMenu(options);
    if (result.index === 0) {
      return 'camera';
    }
    if (result.index === 1) {
      return 'album';
    }
  } catch (error) {
    // Dismissal can reject the promise. Only presentation failures open the web fallback.
    if (!appeared) {
      hilog.warn(0x0000, 'PocketChat', 'Cannot present scan source menu: %{public}d', (error as BusinessError).code);
      return null;
    }
  }
  return '';
}
