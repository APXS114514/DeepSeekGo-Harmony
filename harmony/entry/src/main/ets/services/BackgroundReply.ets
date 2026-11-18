import { common, wantAgent } from '@kit.AbilityKit';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { BusinessError } from '@kit.BasicServicesKit';
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
 * 切到后台时，若网页仍在生成回答，申请短时任务让进程继续运行；
 * 回答完成且应用仍在后台时发送通知，点击通知回到对应对话。
 */
export class BackgroundReply {
  private readonly context: common.UIAbilityContext;
  private foreground: boolean = true;
  private generating: boolean = false;
  private delayId: number = -1;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  setGenerating(generating: boolean): void {
    this.generating = generating;
    if (generating && !this.foreground) {
      this.keepAlive();
    } else if (!generating) {
      this.release();
    }
  }

  onHide(): void {
    this.foreground = false;
    if (this.generating) {
      this.keepAlive();
    }
  }

  onShow(): void {
    this.foreground = true;
    this.release();
    // 回到应用后，已完成的提醒没有必要继续留在通知栏。
    notificationManager.cancelAll().catch((error: BusinessError) => {
      hilog.warn(0x0000, 'PocketChat', 'Cannot clear notifications: %{public}d', error.code);
    });
  }

  /** 网页每完成一条回答都会通知；只有应用在后台时才真正发出系统通知。 */
  replyDone(reply: ReplyDone): void {
    if (this.foreground) {
      return;
    }
    this.publish(reply).catch((error: BusinessError) => {
      hilog.warn(0x0000, 'PocketChat', 'Cannot publish reply notification: %{public}d', error.code);
    });
  }

  /** 请求通知授权；系统已开启或用户同意时返回 OK。 */
  async requestPermission(): Promise<number> {
    try {
      if (await notificationManager.isNotificationEnabled()) {
        return DeviceStatus.OK;
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
    this.release();
  }

  private keepAlive(): void {
    if (this.delayId >= 0) {
      return;
    }
    try {
      const info = backgroundTaskManager.requestSuspendDelay('Finish generating the current reply', () => {
        // 短时任务即将到期：必须立即取消，系统随后可能挂起应用。
        this.release();
      });
      this.delayId = info.requestId;
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

  private async publish(reply: ReplyDone): Promise<void> {
    const parameters: Record<string, Object> = {};
    parameters[OPEN_SESSION_PARAM] = reply.sessionId;
    const agent = await wantAgent.getWantAgent({
      wants: [{
        bundleName: this.context.abilityInfo.bundleName,
        abilityName: this.context.abilityInfo.name,
        parameters: parameters
      }],
      actionType: wantAgent.OperationType.START_ABILITY,
      requestCode: 0,
      actionFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
    });
    await notificationManager.publish({
      // 同一会话只保留最新一条提醒。
      id: BackgroundReply.notificationId(reply.sessionId),
      content: {
        notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
        normal: {
          title: reply.title.slice(0, MAX_TITLE),
          text: reply.text.slice(0, MAX_TEXT)
        }
      },
      wantAgent: agent
    });
  }

  private static notificationId(sessionId: string): number {
    let hash = 0;
    for (let index = 0; index < sessionId.length; index++) {
      hash = (hash * 31 + sessionId.charCodeAt(index)) | 0;
    }
    return Math.abs(hash) % 1000000;
  }
}
