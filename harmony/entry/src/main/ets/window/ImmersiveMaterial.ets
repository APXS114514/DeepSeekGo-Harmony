import { CommonModifier, uiMaterial } from '@kit.ArkUI';
import { Available } from '@kit.BasicServicesKit';

@Available({ minApiVersion: '26.0.0' })
export function supportsImmersiveMaterial(): boolean {
  return canIUse('SystemCapability.ArkUI.ArkUI.Full') && uiMaterial.isImmersiveMaterialSupported() &&
    uiMaterial.getMaterialInfo().state !== uiMaterial.MaterialState.DISABLE;
}

@Available({ minApiVersion: '26.0.0' })
class HeaderButtonMaterial extends CommonModifier {
  private readonly material: uiMaterial.Material = new uiMaterial.ImmersiveMaterial({
    style: uiMaterial.ImmersiveStyle.THIN,
    interactive: false
  });

  applyNormalAttribute(instance: CommonAttribute): void {
    instance.systemMaterial(this.material);
  }
}

@Available({ minApiVersion: '26.0.0' })
export function createHeaderMaterial(): CommonModifier | undefined {
  return supportsImmersiveMaterial() ? new HeaderButtonMaterial() : undefined;
}

@Available({ minApiVersion: '26.0.0' })
export function transparentTitleBar(): NavigationTitleOptions {
  return {
    barStyle: BarStyle.STACK,
    backgroundColor: Color.Transparent,
    backgroundBlurStyle: BlurStyle.NONE,
    systemMaterial: uiMaterial.Material.empty
  };
}
