import { BusinessError } from '@kit.BasicServicesKit';
import { textToSpeech } from '@kit.CoreSpeechKit';
import { DeviceStatus } from './DeviceStatus';

interface SpeechTask {
  token: string;
  remaining: string;
  requestId: string;
}

export class LocalSpeech {
  private readonly emit: (message: string) => void;
  private engine: textToSpeech.TextToSpeechEngine | null = null;
  private loading: Promise<textToSpeech.TextToSpeechEngine> | null = null;
  private task: SpeechTask | null = null;
  private serial: number = 0;
  private disposed: boolean = false;

  constructor(emit: (message: string) => void) {
    this.emit = emit;
  }

  static supported(): boolean {
    return canIUse('SystemCapability.AI.TextToSpeech');
  }

  async start(token: string, text: string): Promise<number> {
    if (!LocalSpeech.supported()) {
      return DeviceStatus.UNSUPPORTED;
    }
    if (!/^\d{1,16}$/.test(token) || !text.trim()) {
      return DeviceStatus.FAILED;
    }
    this.stop();
    const task: SpeechTask = { token, remaining: text.trim(), requestId: '' };
    this.task = task;
    try {
      await this.getEngine();
      if (this.task !== task) {
        return DeviceStatus.CANCELLED;
      }
      this.speakNext(task);
      return DeviceStatus.OK;
    } catch (error) {
      if (this.task !== task) {
        return DeviceStatus.CANCELLED;
      }
      this.task = null;
      return (error as BusinessError).code ?? DeviceStatus.FAILED;
    }
  }

  stop(token?: string): void {
    const task = this.task;
    if (!task || (token !== undefined && token !== task.token)) {
      return;
    }
    this.task = null;
    try {
      this.engine?.stop();
    } catch {
      // 引擎可能尚未完成初始化。
    }
    this.send(task.token, DeviceStatus.CANCELLED);
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    try {
      this.engine?.shutdown();
    } finally {
      this.engine = null;
    }
  }

  private speakNext(task: SpeechTask): void {
    if (!task.remaining) {
      this.finish(task, DeviceStatus.OK);
      return;
    }
    let count = Math.min(1800, task.remaining.length);
    if (count < task.remaining.length) {
      const part = task.remaining.slice(0, count);
      const boundary = Math.max(part.lastIndexOf('。'), part.lastIndexOf('\n'), part.lastIndexOf('. '));
      if (boundary > count / 2) {
        count = boundary + 1;
      } else {
        const final = part.charCodeAt(count - 1);
        if (final >= 0xd800 && final <= 0xdbff) {
          count--;
        }
      }
    }
    const text = task.remaining.slice(0, count).trim();
    task.remaining = task.remaining.slice(count).trimStart();
    task.requestId = 'local' + (++this.serial);
    const extraParams: Record<string, Object> = { 'languageContext': 'zh-CN', 'playType': 1 };
    this.engine?.speak(text, { requestId: task.requestId, extraParams });
  }

  private finish(task: SpeechTask, status: number): void {
    this.task = null;
    this.send(task.token, status);
  }

  private send(token: string, status: number): void {
    this.emit(JSON.stringify({ type: 'read-aloud', token, status }));
  }

  private async getEngine(): Promise<textToSpeech.TextToSpeechEngine> {
    if (this.engine) {
      return this.engine;
    }
    const loading = this.loading ?? this.createEngine();
    this.loading = loading;
    try {
      return await loading;
    } finally {
      this.loading = null;
    }
  }

  private async createEngine(): Promise<textToSpeech.TextToSpeechEngine> {
    const extraParams: Record<string, Object> = { 'locate': 'CN', 'style': 'interaction-broadcast' };
    const engine = await textToSpeech.createEngine({
      language: 'zh-CN',
      person: 0,
      online: 1,
      extraParams
    });
    if (this.disposed) {
      engine.shutdown();
      throw new Error('Speech engine disposed');
    }
    engine.setListener({
      onStart: (): void => {},
      onData: (): void => {},
      onComplete: (id: string): void => {
        const task = this.task;
        if (task && task.requestId === id) {
          try {
            this.speakNext(task);
          } catch (error) {
            this.finish(task, (error as BusinessError).code ?? DeviceStatus.FAILED);
          }
        }
      },
      onStop: (id: string): void => {
        const task = this.task;
        if (task && task.requestId === id) {
          this.finish(task, DeviceStatus.CANCELLED);
        }
      },
      onError: (id: string, code: number): void => {
        const task = this.task;
        if (task && task.requestId === id) {
          this.finish(task, code || DeviceStatus.FAILED);
        }
      }
    });
    this.engine = engine;
    return engine;
  }
}
