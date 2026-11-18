import { UIContext, window } from '@kit.ArkUI';

export interface WindowInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const EMPTY_INSETS: WindowInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function systemBarProperties(dark: boolean): window.SystemBarProperties {
  const foreground = dark ? '#F1F6F2' : '#172219';
  return {
    statusBarColor: '#00000000',
    navigationBarColor: '#00000000',
    statusBarContentColor: foreground,
    navigationBarContentColor: foreground
  };
}

export function readWindowInsets(mainWindow: window.Window, ui: UIContext): WindowInsets {
  const frame = mainWindow.getWindowProperties().windowRect;
  const system = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
  const navigation = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
  const cutout = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_CUTOUT);
  const insets: WindowInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  includeAvoidArea(insets, system, frame);
  includeAvoidArea(insets, navigation, frame);
  includeAvoidArea(insets, cutout, frame);
  return {
    top: ui.px2vp(insets.top),
    right: ui.px2vp(insets.right),
    bottom: ui.px2vp(insets.bottom),
    left: ui.px2vp(insets.left)
  };
}

function includeAvoidArea(insets: WindowInsets, area: window.AvoidArea, frame: window.Rect): void {
  const top = area.topRect;
  const right = area.rightRect;
  const bottom = area.bottomRect;
  const left = area.leftRect;
  // A cutout already covered by an existing avoidance band needs no extra padding.
  const extraTop = needsInset(top, insets, frame) ? top.top + top.height : 0;
  const extraRight = needsInset(right, insets, frame) ? frame.width - right.left : 0;
  const extraBottom = needsInset(bottom, insets, frame) ? frame.height - bottom.top : 0;
  const extraLeft = needsInset(left, insets, frame) ? left.left + left.width : 0;
  insets.top = Math.min(frame.height, Math.max(insets.top, extraTop));
  insets.right = Math.min(frame.width, Math.max(insets.right, extraRight));
  insets.bottom = Math.min(frame.height, Math.max(insets.bottom, extraBottom));
  insets.left = Math.min(frame.width, Math.max(insets.left, extraLeft));
}

function needsInset(rect: window.Rect, insets: WindowInsets, frame: window.Rect): boolean {
  return rect.width > 0 && rect.height > 0 &&
    rect.left + rect.width > insets.left && rect.left < frame.width - insets.right &&
    rect.top + rect.height > insets.top && rect.top < frame.height - insets.bottom;
}
