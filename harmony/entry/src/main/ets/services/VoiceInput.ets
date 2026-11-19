import { common } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { speechRecognizer } from '@kit.CoreSpeechKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { DeviceStatus } from './DeviceStatus';

import { requestMicrophone } from './Microphone';

interface VoiceEvent {
  type: string;
  event: string;
  text: string;
  final: boolean;
  last: boolean;
  code: number;
}

/** 系统离线语音识别。引擎自己采集麦克风，识别结果逐段发给网页。 */
export class VoiceInput {
  private readonly context: common.UIAbilityContext;
  private readonly emit: (message: string) => void;
  private engine: speechRecognizer.SpeechRecognitionEngine | null = null;
  private engineTask: Promise<speechRecognizer.SpeechRecognitionEngine> | null = null;
  private disposed: boolean = false;
  private session: string = '';
  private ready: boolean = false;
  private finishQueued: boolean = false;
  private serial: number = 0;

  constructor(context: common.UIAbilityContext, emit: (message: string) => void) {
    this.context = context;
    this.emit = emit;
  }

  static supported(): boolean {
    return canIUse('SystemCapability.AI.SpeechRecognizer');
  }

  async start(): Promise<number> {
    if (!VoiceInput.supported()) {
      return DeviceStatus.UNSUPPORTED;
    }
    this.cancel();
    const sessionId = 'voice-' + (++this.serial);
    this.session = sessionId;
    const granted = await requestMicrophone(this.context);
    if (this.session !== sessionId) {
      return DeviceStatus.CANCELLED;
    }
    if (!granted) {
      this.session = '';
      return DeviceStatus.DENIED;
    }
    try {
      const engine = await this.getEngine();
      // 授权弹窗或创建引擎期间网页可能已取消。
      if (this.session !== sessionId) {
        return DeviceStatus.CANCELLED;
      }
      const extraParams: Record<string, Object> = {
        'recognitionMode': 0,
        'vadBegin': 8000,
        'vadEnd': 3000,
        'maxAudioDuration': 60000
      };
      engine.startListening({
        sessionId: sessionId,
        audioInfo: { audioType: 'pcm', sampleRate: 16000, soundChannel: 1, sampleBit: 16 },
        extraParams: extraParams
      });
      return DeviceStatus.OK;
    } catch (error) {
      if (this.session !== sessionId) {
        return DeviceStatus.CANCELLED;
      }
      this.session = '';
      const code = (error as BusinessError).code;
      hilog.warn(0x0000, 'PocketChat', 'Cannot start speech recognition: %{public}d', code);
      return code || DeviceStatus.FAILED;
    }
  }

  /** 停止收音，等待引擎返回最后结果。 */
  stop(): void {
    if (this.session && !this.ready) {
      this.finishQueued = true;
      return;
    }
    if (this.session && this.engine) {
      try {
        this.engine.finish(this.session);
      } catch (error) {
        hilog.warn(0x0000, 'PocketChat', 'Cannot finish speech: %{public}d', (error as BusinessError).code);
        this.fail(this.session, (error as BusinessError).code);
      }
    }
  }

  cancel(): void {
    const session = this.session;
    this.session = '';
    this.ready = false;
    this.finishQueued = false;
    if (session && this.engine) {
      try {
        this.engine.cancel(session);
      } catch (error) {
        hilog.warn(0x0000, 'PocketChat', 'Cannot cancel speech: %{public}d', (error as BusinessError).code);
      }
    }
  }

  /** 应用切到后台时停止收音，并让网页回到空闲状态。 */
  interrupt(): void {
    if (this.session) {
      this.cancel();
      this.send('cancel', '', false, false, 0);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
    try {
      this.engine?.shutdown();
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Cannot release speech engine: %{public}d', (error as BusinessError).code);
    }
    this.engine = null;
  }

  private async getEngine(): Promise<speechRecognizer.SpeechRecognitionEngine> {
    if (this.engine) {
      return this.engine;
    }
    if (this.engineTask) {
      return this.engineTask;
    }
    const task = this.createEngine();
    this.engineTask = task;
    try {
      return await task;
    } finally {
      this.engineTask = null;
    }
  }

  private async createEngine(): Promise<speechRecognizer.SpeechRecognitionEngine> {
    const extraParams: Record<string, Object> = { 'locate': 'CN', 'recognizerMode': 'short' };
    const engine = await speechRecognizer.createEngine({ language: 'zh-CN', online: 1, extraParams: extraParams });
    if (this.disposed) {
      engine.shutdown();
      throw new Error('Speech input has been disposed');
    }
    engine.setListener({
      onStart: (sessionId: string): void => {
        if (sessionId === this.session) {
          this.ready = true;
          if (this.finishQueued) {
            this.finishQueued = false;
            this.stop();
          }
        }
      },
      onEvent: (): void => {},
      onResult: (sessionId: string, result: speechRecognizer.SpeechRecognitionResult): void => {
        if (sessionId === this.session) {
          this.send('result', result.result ?? '', result.isFinal === true, result.isLast === true, 0);
        }
      },
      onComplete: (sessionId: string): void => {
        if (sessionId === this.session) {
          this.session = '';
          this.send('end', '', false, false, 0);
        }
      },
      onError: (sessionId: string, errorCode: number): void => {
        hilog.warn(0x0000, 'PocketChat', 'Speech recognition error: %{public}d', errorCode);
        this.fail(sessionId, errorCode);
      }
    });
    this.engine = engine;
    return engine;
  }

  private fail(sessionId: string, code: number): void {
    if (sessionId === this.session) {
      this.session = '';
      this.send('error', '', false, false, code || DeviceStatus.FAILED);
    }
  }

  private send(event: string, text: string, final: boolean, last: boolean, code: number): void {
    const message: VoiceEvent = { type: 'voice', event: event, text: text, final: final, last: last, code: code };
    this.emit(JSON.stringify(message));
  }

}
