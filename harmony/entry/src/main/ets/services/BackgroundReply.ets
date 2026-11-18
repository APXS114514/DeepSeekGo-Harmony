import { common, wantAgent } from '@kit.AbilityKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { notificationManager } from '@kit.NotificationKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DeviceStatus } from './DeviceStatus';

/** 通知携带的会话参数名，点击通知回到应用后由 EntryAbility 读取。 */
export const OPEN_SESSION_PARAM = 'pocketChatSessionId';
/** AppStorage 中待打开会话的键，EntryAbility 写入，Index 页面转给网页。 */
export const OPEN_SESSION_KEY = 'pocketChatOpenSession';

const MAX_TITLE = 40;
const MAX_TEXT = 120;

export interface ReplyDone {
  sessionId: string;
  title: string;
  text: string;
}

/**
 * 由 EntryAbility 管理前后台状态，短时任务覆盖生成、保存以及通知发布；
 * 回答完成且应用仍在后台时发送通知，点击通知回到对应对话。
 */
export class BackgroundReply {
  private static instance?: BackgroundReply;
  private readonly context: common.UIAbilityContext;
  private foreground: boolean = true;
  private foregroundTransitions: number = 0;
  private generating: boolean = false;
  private publishing: number = 0;
  private delayId: number = -1;

  private constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  static forAbility(context: common.UIAbilityContext): BackgroundReply {
    return BackgroundReply.instance ??= new BackgroundReply(context);
  }

  setGenerating(generating: boolean): void {
    if (this.generating === generating) {
      return;
    }
    this.generating = generating;
    // 前台先申请，以免网页消息落在系统允许的申请窗口之外。配额只在后台计时。
    if (generating && this.foreground) {
      this.keepAlive();
    }
    this.releaseIfIdle();
  }

  onBackground(): void {
    this.foreground = false;
    if (this.generating || this.publishing > 0) {
      this.keepAlive();
    }
  }

  onForeground(): void {
    this.foreground = true;
    this.foregroundTransitions++;
    this.releaseIfIdle();
    // 回到应用后，已完成的提醒没有必要继续留在通知栏。
    notificationManager.cancelAll().catch((error: BusinessError) => {
      hilog.warn(0x0000, 'PocketChat', 'Cannot clear notifications: %{public}d', error.code);
    });
  }

  /** 网页每完成一条回答都会通知；只有应用在后台时才真正发出系统通知。 */
  async replyDone(reply: ReplyDone): Promise<void> {
    if (this.foreground) {
      return;
    }
    const foregroundTransitions = this.foregroundTransitions;
    this.publishing++;
    try {
      if (!await notificationManager.isNotificationEnabled()) {
        return;
      }
      const id = BackgroundReply.notificationId(reply.sessionId);
      const parameters: Record<string, Object> = {};
      parameters[OPEN_SESSION_PARAM] = reply.sessionId;
      const agent = await wantAgent.getWantAgent({
        wants: [{
          bundleName: this.context.abilityInfo.bundleName,
          moduleName: this.context.abilityInfo.moduleName,
          abilityName: this.context.abilityInfo.name,
          parameters: parameters
        }],
        actionType: wantAgent.OperationType.START_ABILITY,
        requestCode: id,
        actionFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
      });
      if (this.foreground || this.foregroundTransitions !== foregroundTransitions) {
        return;
      }
      await notificationManager.publish({
        // 同一会话只保留最新一条提醒。
        id: id,
        notificationSlotType: notificationManager.SlotType.SERVICE_INFORMATION,
        content: {
          notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
          normal: {
            title: reply.title.slice(0, MAX_TITLE),
            text: reply.text.slice(0, MAX_TEXT)
          }
        },
        wantAgent: agent
      });
      if (this.foreground) {
        await notificationManager.cancel(id);
      }
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Cannot publish reply notification: %{public}d', (error as BusinessError).code);
    } finally {
      this.publishing--;
      this.releaseIfIdle();
    }
  }

  /** 请求通知授权；系统已开启或用户同意时返回 OK。 */
  async requestPermission(openSettings: boolean): Promise<number> {
    try {
      if (await notificationManager.isNotificationEnabled()) {
        return DeviceStatus.OK;
      }
      if (!this.foreground) {
        return DeviceStatus.DENIED;
      }
      if (openSettings && deviceInfo.sdkApiVersion >= 26 &&
        canIUse('SystemCapability.Notification.NotificationSettings')) {
        if (deviceInfo.apiAvailable('26.0.0')) {
          await notificationManager.openNotificationSettingsWithResult(this.context);
          return await notificationManager.isNotificationEnabled() ? DeviceStatus.OK : DeviceStatus.DENIED;
        }
      }
      await notificationManager.requestEnableNotification(this.context);
      return await notificationManager.isNotificationEnabled() ? DeviceStatus.OK : DeviceStatus.DENIED;
    } catch (error) {
      const code = (error as BusinessError).code;
      hilog.warn(0x0000, 'PocketChat', 'Notification permission not granted: %{public}d', code);
      return DeviceStatus.DENIED;
    }
  }

  dispose(): void {
    this.foreground = true;
    this.foregroundTransitions++;
    this.release();
    if (BackgroundReply.instance === this) {
      BackgroundReply.instance = undefined;
    }
  }

  private releaseIfIdle(): void {
    if (!this.generating && this.publishing === 0) {
      this.release();
    }
  }

  private keepAlive(): void {
    if (this.delayId >= 0) {
      return;
    }
    try {
      let requestId = -1;
      const info = backgroundTaskManager.requestSuspendDelay('Finish generating the current reply', () => {
        // 短时任务即将到期：必须立即取消，系统随后可能挂起应用。
        if (this.delayId === requestId) {
          this.release();
        }
      });
      requestId = info.requestId;
      this.delayId = requestId;
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Cannot keep reply running: %{public}d', (error as BusinessError).code);
    }
  }

  private release(): void {
    if (this.delayId < 0) {
      return;
    }
    try {
      backgroundTaskManager.cancelSuspendDelay(this.delayId);
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Cannot cancel transient task: %{public}d', (error as BusinessError).code);
    }
    this.delayId = -1;
  }

  private static notificationId(sessionId: string): number {
    let hash = 0;
    for (let index = 0; index < sessionId.length; index++) {
      hash = (hash * 31 + sessionId.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) % 1000000;
  }
}
