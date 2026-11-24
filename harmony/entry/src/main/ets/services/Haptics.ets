import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { vibrator } from '@kit.SensorServiceKit';

interface HapticSpec {
  effects: string[];
  intensity: number;
  immediate?: boolean;
}

const MIN_INTERVAL_MS = 35;

/**
 * 系统预置触感反馈（API 12+）。
 * 统一使用 usage: 'touch'，自动遵循系统「触感反馈」设置，不在后台触发。
 */
export class Haptics {
  private readonly supportCache: Map<string, boolean> = new Map();
  private foreground: boolean = true;
  private lastTriggeredAt: number = 0;

  static supported(): boolean {
    try {
      return canIUse('SystemCapability.Sensors.MiscDevice');
    } catch {
      return false;
    }
  }

  setForeground(active: boolean): void {
    this.foreground = active;
  }

  trigger(kind: string): void {
    if (!this.foreground || !Haptics.supported()) {
      return;
    }
    const spec = Haptics.specFor(kind);
    if (!spec) {
      return;
    }
    const now = Date.now();
    if (!spec.immediate && now - this.lastTriggeredAt < MIN_INTERVAL_MS) {
      return;
    }
    const effectId = this.resolveEffect(spec.effects);
    if (!effectId) {
      return;
    }
    this.lastTriggeredAt = now;
    try {
      vibrator.startVibration(
        {
          type: 'preset',
          effectId: effectId,
          count: 1,
          intensity: spec.intensity
        },
        {
          usage: 'touch'
        }
      ).catch((error: BusinessError) => {
        hilog.warn(0x0000, 'PocketChat', 'Haptic feedback skipped: %{public}d', error.code);
      });
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Cannot start haptic feedback: %{public}d',
        (error as BusinessError).code);
    }
  }

  private resolveEffect(candidates: string[]): string | null {
    for (const effectId of candidates) {
      if (this.isEffectSupported(effectId)) {
        return effectId;
      }
    }
    return null;
  }

  private isEffectSupported(effectId: string): boolean {
    const cached = this.supportCache.get(effectId);
    if (cached !== undefined) {
      return cached;
    }
    let supported = false;
    try {
      supported = vibrator.isSupportEffectSync(effectId);
    } catch {
      supported = false;
    }
    this.supportCache.set(effectId, supported);
    return supported;
  }

  private static specFor(kind: string): HapticSpec | null {
    switch (kind) {
      case 'voice-start':
        return {
          effects: [
            vibrator.HapticFeedback.EFFECT_HARD,
            vibrator.HapticFeedback.EFFECT_SOFT,
            vibrator.EffectId.EFFECT_CLOCK_TIMER
          ],
          intensity: 85,
          immediate: true
        };
      case 'voice-cancel':
        return {
          effects: [
            vibrator.HapticFeedback.EFFECT_SHARP,
            vibrator.HapticFeedback.EFFECT_HARD,
            vibrator.HapticFeedback.EFFECT_SOFT
          ],
          intensity: 95,
          immediate: true
        };
      case 'reply-first-token':
        return {
          effects: [
            vibrator.HapticFeedback.EFFECT_SOFT,
            vibrator.EffectId.EFFECT_CLOCK_TIMER
          ],
          intensity: 60
        };
      case 'thinking-done':
        return {
          effects: [
            vibrator.HapticFeedback.EFFECT_SOFT,
            vibrator.EffectId.EFFECT_CLOCK_TIMER
          ],
          intensity: 70
        };
      case 'copy':
        return {
          effects: deviceInfo.sdkApiVersion >= 18
            ? [
                'haptic.notice.success',
                vibrator.HapticFeedback.EFFECT_SOFT,
                vibrator.EffectId.EFFECT_CLOCK_TIMER
              ]
            : [
                vibrator.HapticFeedback.EFFECT_SOFT,
                vibrator.EffectId.EFFECT_CLOCK_TIMER
              ],
          intensity: 75
        };
      case 'menu':
        return {
          effects: [
            vibrator.HapticFeedback.EFFECT_SOFT,
            vibrator.EffectId.EFFECT_CLOCK_TIMER
          ],
          intensity: 65
        };
      default:
        return null;
    }
  }
}
