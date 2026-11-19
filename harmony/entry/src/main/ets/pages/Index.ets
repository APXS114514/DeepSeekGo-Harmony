import { common, ConfigurationConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { webview } from '@kit.ArkWeb';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { DeviceBridge } from '../services/DeviceBridge';
import { OPEN_SESSION_KEY } from '../services/BackgroundReply';
import { ShareInbox } from '../services/ShareInbox';
import { clampFontScale, FONT_SCALE_KEY } from '../window/FontScale';
import { ChatHeader } from '../window/ChatHeader';
import { EMPTY_INSETS, readWindowInsets, systemBarProperties, WindowInsets } from '../window/WindowInsets';

const APP_HOST = 'deepseek.local.invalid';
const APP_ORIGIN = 'https://' + APP_HOST;
const APP_PAGE = APP_ORIGIN + '/index.html';
const PORT_MESSAGE = 'pocket-chat-device-port';
const PAGE_POLICY = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; " +
  "connect-src https://api.deepseek.com; frame-src 'none'; base-uri 'none'; form-action 'none'";
const PACKAGED_PATH = /^\/static\/(?:js|css|media)\/(?:async\/)?[a-zA-Z0-9._-]+\.(?:js|css|woff2?|ttf|png)$/;
const MEDIA_TYPES: Map<string, string> = new Map([
  ['html', 'text/html'],
  ['js', 'text/javascript'],
  ['css', 'text/css'],
  ['woff', 'font/woff'],
  ['woff2', 'font/woff2'],
  ['ttf', 'font/ttf'],
  ['png', 'image/png']
]);

interface WebWindowUi {
  mobile: boolean;
  covered: boolean;
  dark: boolean;
  themePreference?: string;
  title: string;
  menuLabel: string;
  newChatLabel: string;
  showNewChat: boolean;
  canGoBack: boolean;
  generating: boolean;
}

@Entry
@Component
struct Index {
  private readonly controller: webview.WebviewController = new webview.WebviewController();
  private devicePort: webview.WebMessagePort | null = null;
  private bridge: DeviceBridge | null = null;
  private mainWindow: window.Window | null = null;
  private disposed: boolean = false;
  private hasWindowUi: boolean = false;
  private nativeColorMode?: ConfigurationConstant.ColorMode;
  @State private insets: WindowInsets = EMPTY_INSETS;
  @State private pageZoomed: boolean = false;
  @StorageProp(FONT_SCALE_KEY) @Watch('sendFontScale') private fontScale: number = 1;
  @StorageLink(OPEN_SESSION_KEY) @Watch('openPendingSession') private pendingSession: string = '';
  @State private windowUi: WebWindowUi = {
    mobile: false, covered: false, dark: false,
    title: '', menuLabel: '', newChatLabel: '', showNewChat: false, canGoBack: false,
    generating: false
  };

  aboutToAppear(): void {
    this.disposed = false;
    const ui = this.getUIContext();
    const context = ui.getHostContext() as common.UIAbilityContext;
    const dark = context.config.colorMode === ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
    this.windowUi.dark = dark;
    this.bridge = new DeviceBridge(context, ui, (message) => this.sendWebMessage(message));
    ShareInbox.subscribe(this.flushShares);
    window.getLastWindow(context).then((mainWindow) => {
      if (this.disposed) {
        return;
      }
      this.mainWindow = mainWindow;
      mainWindow.on('avoidAreaChange', this.updateInsets);
      mainWindow.on('windowSizeChange', this.updateInsets);
      mainWindow.on('windowStatusChange', this.onWindowStatusChange);
      this.updateInsets();
      this.updateSystemBars();
    }).catch((error: BusinessError) => {
      hilog.warn(0x0000, 'PocketChat', 'Unable to observe window: %{public}d', error.code);
    });
  }

  private updateInsets = (): void => {
    const mainWindow = this.mainWindow;
    if (!mainWindow) {
      return;
    }
    try {
      let immersive = mainWindow.getImmersiveModeEnabledState();
      if (deviceInfo.sdkApiVersion >= 20 && canIUse('SystemCapability.Window.SessionManager')) {
        immersive = mainWindow.isImmersiveLayout();
      }
      this.insets = immersive ? readWindowInsets(mainWindow, this.getUIContext()) : EMPTY_INSETS;
      this.sendWindowLayout();
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Unable to read window insets: %{public}d', (error as BusinessError).code);
    }
  };

  /** 把系统分享收到的内容交给网页；页面未连接时留在队列里。 */
  private flushShares = (): void => {
    if (!this.devicePort) {
      return;
    }
    for (const payload of ShareInbox.take()) {
      this.sendWebMessage(JSON.stringify(payload));
    }
  };

  /** 网页有打开的菜单、弹窗、面板、抽屉或编辑时，返回手势只关闭最上面一层；否则交给系统。 */
  onBackPress(): boolean {
    if (this.windowUi.canGoBack && this.devicePort) {
      this.sendWebMessage('{"type":"window-action","action":"back"}');
      return true;
    }
    return false;
  }

  onPageHide(): void {
    this.bridge?.interrupt();
    this.updateWebActivity(false);
  }

  onPageShow(): void {
    this.updateWebActivity(true);
  }

  private updateWebActivity(active: boolean): void {
    if (!this.devicePort) {
      return;
    }
    try {
      if (active) {
        this.controller.onActive();
      } else {
        this.controller.onInactive();
      }
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Cannot change web activity: %{public}d', (error as BusinessError).code);
    }
  }

  /** 点击回答完成通知回到应用后，打开对应对话。 */
  private openPendingSession(): void {
    const sessionId = this.pendingSession;
    if (!sessionId || !this.devicePort) {
      return;
    }
    this.pendingSession = '';
    this.sendWebMessage(JSON.stringify({ type: 'window-action', action: 'open-session', value: sessionId }));
  }

  private onWindowStatusChange = (): void => {
    this.updateInsets();
    this.updateSystemBars();
  };

  private updateSystemBars(): void {
    const mainWindow = this.mainWindow;
    if (!mainWindow) {
      return;
    }
    const dark = this.windowUi.dark;
    mainWindow.setWindowSystemBarProperties(systemBarProperties(dark))
      .catch((error: BusinessError) => {
        hilog.warn(0x0000, 'PocketChat', 'Unable to update system bars: %{public}d', error.code);
      });
    if (deviceInfo.deviceType === '2in1' && deviceInfo.sdkApiVersion >= 14 &&
      canIUse('SystemCapability.Window.SessionManager')) {
      try {
        mainWindow.setDecorButtonStyle({
          colorMode: dark
            ? ConfigurationConstant.ColorMode.COLOR_MODE_DARK : ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT
        });
      } catch (error) {
        hilog.warn(0x0000, 'PocketChat', 'Unable to update window controls: %{public}d', (error as BusinessError).code);
      }
    }
  }

  private applyWindowUi(value: string): void {
    const next = JSON.parse(value) as WebWindowUi;
    if (typeof next?.mobile !== 'boolean' || typeof next.covered !== 'boolean' ||
      typeof next.dark !== 'boolean' || typeof next.title !== 'string' ||
      typeof next.menuLabel !== 'string' || typeof next.newChatLabel !== 'string' ||
      typeof next.showNewChat !== 'boolean' || typeof next.canGoBack !== 'boolean' ||
      typeof next.generating !== 'boolean') {
      return;
    }
    const themeChanged = !this.hasWindowUi || next.dark !== this.windowUi.dark;
    const headerChanged = next.mobile !== this.windowUi.mobile || next.covered !== this.windowUi.covered;
    this.windowUi = next;
    this.hasWindowUi = true;
    this.bridge?.setGenerating(next.generating);
    this.updateNativeTheme(next.themePreference);
    if (themeChanged) {
      this.updateSystemBars();
    }
    if (headerChanged) {
      this.sendWindowLayout();
    }
  }

  private updateNativeTheme(preference?: string): void {
    let mode: ConfigurationConstant.ColorMode;
    switch (preference) {
      case 'light':
        mode = ConfigurationConstant.ColorMode.COLOR_MODE_LIGHT;
        break;
      case 'dark':
        mode = ConfigurationConstant.ColorMode.COLOR_MODE_DARK;
        break;
      case 'system':
        mode = ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET;
        break;
      default:
        return;
    }
    // API 26 是原生光感菜单的最低版本。主题偏好用于当前 UIAbility。
    if (this.nativeColorMode === mode || deviceInfo.sdkApiVersion < 26) {
      return;
    }
    try {
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      context.setColorMode(mode);
      this.nativeColorMode = mode;
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Unable to update native theme: %{public}d', (error as BusinessError).code);
    }
  }

  private sendWindowLayout(): void {
    this.sendWebMessage(JSON.stringify({
      type: 'window-layout',
      insets: this.insets,
      nativeHeader: this.windowUi.mobile && !this.windowUi.covered && !this.pageZoomed
    }));
  }

  /** 网页正文、输入框和顶栏标题按系统字体缩放，上限与原生 fontSizeMaxScale 一致。 */
  private sendFontScale(): void {
    this.sendWebMessage(JSON.stringify({ type: 'font-scale', scale: clampFontScale(this.fontScale) }));
  }

  private sendWebMessage(message: string): void {
    try {
      this.devicePort?.postMessageEvent(message);
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Unable to update local page: %{public}d', (error as BusinessError).code);
    }
  }

  private connectDevicePort(address: string): void {
    if (address !== APP_PAGE) {
      return;
    }
    this.closeDevicePort();
    const bridge = this.bridge;
    if (!bridge) {
      return;
    }
    try {
      const ports = this.controller.createWebMessagePorts();
      const port = ports[0];
      this.devicePort = port;
      port.onMessageEvent((message) => bridge.handle(message, port, (value) => this.applyWindowUi(value)));
      this.controller.postMessage(PORT_MESSAGE, [ports[1]], APP_ORIGIN);
      this.sendWindowLayout();
      bridge.features().then((features) => {
        if (this.devicePort === port) {
          this.sendWebMessage(features);
        }
      });
      this.sendFontScale();
      this.flushShares();
      this.openPendingSession();
    } catch (error) {
      this.closeDevicePort();
      hilog.error(0x0000, 'PocketChat', 'Cannot connect local page: %{public}d',
        (error as BusinessError).code);
    }
  }

  private closeDevicePort(): void {
    this.bridge?.interrupt();
    if (this.devicePort) {
      try {
        this.devicePort.close();
      } catch (error) {
        hilog.warn(0x0000, 'PocketChat', 'Cannot close local page port: %{public}d',
          (error as BusinessError).code);
      }
      this.devicePort = null;
    }
  }

  aboutToDisappear(): void {
    this.disposed = true;
    this.closeDevicePort();
    ShareInbox.unsubscribe(this.flushShares);
    this.bridge?.dispose();
    this.bridge = null;
    try {
      this.mainWindow?.off('avoidAreaChange', this.updateInsets);
      this.mainWindow?.off('windowSizeChange', this.updateInsets);
      this.mainWindow?.off('windowStatusChange', this.onWindowStatusChange);
    } catch (error) {
      hilog.warn(0x0000, 'PocketChat', 'Unable to stop observing window: %{public}d', (error as BusinessError).code);
    }
    this.mainWindow = null;
  }

  private getLocalResponse(address: string): WebResourceResponse | null {
    if (!address.startsWith(APP_ORIGIN + '/')) {
      return null;
    }
    const path = address.substring(APP_ORIGIN.length);
    const response = new WebResourceResponse();
    response.setResponseHeader([
      { headerKey: 'Content-Security-Policy', headerValue: PAGE_POLICY },
      { headerKey: 'Referrer-Policy', headerValue: 'no-referrer' },
      { headerKey: 'X-Content-Type-Options', headerValue: 'nosniff' },
      { headerKey: 'Cache-Control', headerValue: 'no-store' }
    ]);
    response.setResponseEncoding('utf-8');
    try {
      if (path !== '/index.html' && !PACKAGED_PATH.test(path)) {
        throw new Error('Unknown asset path');
      }
      const context = this.getUIContext().getHostContext() as common.UIAbilityContext;
      const bytes = context.resourceManager.getRawFileContentSync('chat' + path);
      response.setResponseData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      response.setResponseMimeType(MEDIA_TYPES.get(path.substring(path.lastIndexOf('.') + 1)) ?? 'text/plain');
      response.setResponseCode(200);
      response.setReasonMessage('OK');
    } catch {
      response.setResponseData('页面资源加载失败，请重新构建前端界面。');
      response.setResponseMimeType('text/plain');
      response.setResponseCode(404);
      response.setReasonMessage('Not Found');
    }
    response.setResponseIsReady(true);
    return response;
  }

  build() {
    Stack({ alignContent: Alignment.Top }) {
      Web({ src: APP_PAGE, controller: this.controller })
        .width('100%')
        .height('100%')
        .keyboardAvoidMode(WebKeyboardAvoidMode.RESIZE_VISUAL)
        // 让网页的 prefers-color-scheme 跟随系统深浅色；配色由网页自己的深色主题负责，不做强制反色。
        .darkMode(WebDarkMode.Auto)
        .forceDarkAccess(false)
        .backgroundColor(this.windowUi.dark ? '#151515' : '#FAFAFA')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .geolocationAccess(false)
        .multiWindowAccess(false)
        .onScaleChange((event) => {
          const zoomed = event.newScale > 1.01;
          if (this.pageZoomed !== zoomed) {
            this.pageZoomed = zoomed;
            this.sendWindowLayout();
          }
        })
        .onPageEnd((event) => this.connectDevicePort(event.url))
        .onLoadIntercept((event) => event.data.getRequestUrl() !== APP_PAGE)
        // ArkWeb accepts null to continue loading, although the SDK callback type omits it.
        .onInterceptRequest((event) => this.getLocalResponse(event.request.getRequestUrl()) as WebResourceResponse)
      if (this.windowUi.mobile && !this.windowUi.covered && !this.pageZoomed && this.devicePort) {
        Column() {
          ChatHeader({
            title: this.windowUi.title,
            menuLabel: this.windowUi.menuLabel,
            newChatLabel: this.windowUi.newChatLabel,
            showNewChat: this.windowUi.showNewChat,
            dark: this.windowUi.dark,
            onMenu: () => this.sendWebMessage('{"type":"window-action","action":"sidebar"}'),
            onNewChat: () => this.sendWebMessage('{"type":"window-action","action":"new-chat"}')
          })
        }
        .width('100%')
        .padding({ left: this.insets.left, right: this.insets.right })
        .margin({ top: this.insets.top })
      }
    }
      .width('100%')
      .height('100%')
  }
}
