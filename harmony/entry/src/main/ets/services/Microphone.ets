import { abilityAccessCtrl, common, Permissions } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const MICROPHONE: Permissions = 'ohos.permission.MICROPHONE';

export async function requestMicrophone(context: common.UIAbilityContext): Promise<boolean> {
  const manager = abilityAccessCtrl.createAtManager();
  try {
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
