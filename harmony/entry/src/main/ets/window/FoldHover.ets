import { display, UIContext, window } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';

export interface FoldBounds {
  upper: number;
  lower: number;
}

/** 读取横向折痕的窗口坐标，不改变窗口的旋转策略。 */
export function readFoldBounds(mainWindow: window.Window, ui: UIContext): FoldBounds | null {
  try {
    if (display.getFoldStatus() !== display.FoldStatus.FOLD_STATUS_HALF_FOLDED ||
      mainWindow.getWindowStatus() !== window.WindowStatusType.FULL_SCREEN) {
      return null;
    }
    const properties = mainWindow.getWindowProperties();
    const frame = properties.windowRect;
    const screen = properties.displayId === undefined
      ? display.getDefaultDisplaySync()
      : display.getDisplayByIdSync(properties.displayId);
    if (frame.width !== screen.width || frame.height !== screen.height) {
      return null;
    }
    const crease = horizontalCrease(screen);
    if (!crease || crease.top <= 0 || crease.top + crease.height >= frame.height) {
      return null;
    }
    return { upper: ui.px2vp(crease.top), lower: ui.px2vp(crease.top + crease.height) };
  } catch {
    // 折叠切屏期间屏幕和折痕可能尚未就绪，下一次窗口或显示变化时再读取。
    return null;
  }
}

function horizontalCrease(screen: display.Display): display.Rect | undefined {
  if (deviceInfo.sdkApiVersion >= 20 && canIUse('SystemCapability.Window.SessionManager')) {
    try {
      return screen.getLiveCreaseRegion()?.creaseRects.find(isHorizontal);
    } catch {
      // 设备缺少实时折痕接口时读取自然方向下的折痕。
    }
  }
  const region = display.getCurrentFoldCreaseRegion();
  if (region?.displayId !== screen.id) {
    return undefined;
  }
  return region.creaseRects.map((rect) => rotateCrease(rect, screen)).find(isHorizontal);
}

function isHorizontal(rect: display.Rect): boolean {
  return rect.width > rect.height && rect.height > 0;
}

/** 旧版接口返回自然方向的坐标，换算到当前显示方向。 */
function rotateCrease(rect: display.Rect, screen: display.Display): display.Rect {
  switch (screen.rotation) {
    case 1:
      return { left: screen.width - rect.top - rect.height, top: rect.left, width: rect.height, height: rect.width };
    case 2:
      return { left: screen.width - rect.left - rect.width, top: screen.height - rect.top - rect.height,
        width: rect.width, height: rect.height };
    case 3:
      return { left: rect.top, top: screen.height - rect.left - rect.width, width: rect.height, height: rect.width };
    default:
      return rect;
  }
}
