import { display, UIContext, window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

export interface WindowInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** 左右避让区完全落在顶部或底部这个比例以内时，视为角落里的挖孔或状态栏片段。 */
const CORNER_RATIO = 0.25;

export const EMPTY_INSETS: WindowInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function systemBarProperties(dark: boolean): window.SystemBarProperties {
  const foreground = dark ? '#F2F2F2' : '#1A1A1A';
  return {
    statusBarColor: '#00000000',
    navigationBarColor: '#00000000',
    statusBarContentColor: foreground,
    navigationBarContentColor: foreground
  };
}

export async function readWindowInsets(mainWindow: window.Window, ui: UIContext): Promise<WindowInsets> {
  const properties = mainWindow.getWindowProperties();
  const frame = properties.windowRect;
  const system = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM);
  const navigation = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_NAVIGATION_INDICATOR);
  const cutout = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_CUTOUT);
  const insets: WindowInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  let holes: window.Rect[] = [];
  if (hasArea(cutout.leftRect) || hasArea(cutout.rightRect)) {
    holes = await readFullScreenCutouts(properties);
  }
  const physicalCutout: window.AvoidArea = {
    visible: cutout.visible,
    topRect: cutout.topRect,
    bottomRect: cutout.bottomRect,
    leftRect: narrowCornerCutout(cutout.leftRect, holes, frame),
    rightRect: narrowCornerCutout(cutout.rightRect, holes, frame)
  };
  const systemBars: window.AvoidArea = {
    visible: system.visible,
    topRect: system.topRect,
    bottomRect: system.bottomRect,
    leftRect: collapseDuplicateBand(system.leftRect, cutout.leftRect, physicalCutout.leftRect),
    rightRect: collapseDuplicateBand(system.rightRect, cutout.rightRect, physicalCutout.rightRect)
  };
  includeAvoidArea(insets, systemBars, frame);
  includeAvoidArea(insets, navigation, frame);
  includeAvoidArea(insets, physicalCutout, frame);
  hilog.info(0x0000, 'PocketChat', 'Window %{public}dx%{public}d avoid system=%{public}s nav=%{public}s ' +
    'cutout=%{public}s -> %{public}s', frame.width, frame.height, describeArea(system),
    describeArea(navigation), describeArea(cutout), JSON.stringify(insets));
  return {
    top: ui.px2vp(insets.top),
    right: ui.px2vp(insets.right),
    bottom: ui.px2vp(insets.bottom),
    left: ui.px2vp(insets.left)
  };
}

/** 全屏时显示器的挖孔坐标可直接用于窗口；浮窗和分屏使用系统上报的窗口避让矩形。 */
async function readFullScreenCutouts(properties: window.WindowProperties): Promise<window.Rect[]> {
  if (!canIUse('SystemCapability.WindowManager.WindowManager.Core')) {
    return [];
  }
  try {
    const screen = properties.displayId === undefined
      ? display.getDefaultDisplaySync()
      : display.getDisplayByIdSync(properties.displayId);
    if (screen.width === properties.windowRect.width && screen.height === properties.windowRect.height) {
      const info = await screen.getCutoutInfo();
      return info.boundingRects;
    }
  } catch {
    // 设备切换屏幕时坐标可能短暂不可用。
  }
  return [];
}

function hasArea(rect: window.Rect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/** 某些设备把角落挖孔报告成侧边带；用实际挖孔的高度确认它确实只在一个角。 */
function narrowCornerCutout(side: window.Rect, holes: window.Rect[], frame: window.Rect): window.Rect {
  if (!hasArea(side) || cornerBand(side, frame) !== '') {
    return side;
  }
  const matching = holes.filter((hole) => hasArea(hole) &&
    hole.left < side.left + side.width && hole.left + hole.width > side.left &&
    hole.top < side.top + side.height && hole.top + hole.height > side.top);
  const band = matching.length ? cornerBand(matching[0], frame) : '';
  if (band === '' || !matching.every((hole) => cornerBand(hole, frame) === band)) {
    return side;
  }
  const top = Math.min(...matching.map((hole) => hole.top));
  const bottom = Math.max(...matching.map((hole) => hole.top + hole.height));
  return { left: side.left, top, width: side.width, height: bottom - top };
}

/** 系统栏有时重复同一侧边带，只去掉能由已确认的角落挖孔解释的部分。 */
function collapseDuplicateBand(system: window.Rect, raw: window.Rect, refined: window.Rect): window.Rect {
  if (raw !== refined && system.left === raw.left && system.width === raw.width &&
    system.top >= raw.top && system.top + system.height <= raw.top + raw.height) {
    return refined;
  }
  return system;
}

function describeArea(area: window.AvoidArea): string {
  const rect = (value: window.Rect): string =>
    value.width > 0 && value.height > 0 ? `${value.left},${value.top},${value.width},${value.height}` : '-';
  return `[t ${rect(area.topRect)} r ${rect(area.rightRect)} b ${rect(area.bottomRect)} l ${rect(area.leftRect)}]`;
}

/**
 * 只占顶部或底部一角的左右避让区（例如横屏时位于右上角的摄像头挖孔）改为上下避让，
 * 避免整列内容为一个角落让出整条左右边距而偏离屏幕中心。
 */
function cornerBand(rect: window.Rect, frame: window.Rect): string {
  if (!hasArea(rect)) {
    return '';
  }
  if (rect.top + rect.height <= frame.height * CORNER_RATIO) {
    return 'top';
  }
  return rect.top >= frame.height * (1 - CORNER_RATIO) ? 'bottom' : '';
}

function includeAvoidArea(insets: WindowInsets, area: window.AvoidArea, frame: window.Rect): void {
  const top = area.topRect;
  const right = area.rightRect;
  const bottom = area.bottomRect;
  const left = area.leftRect;
  // A cutout already covered by an existing avoidance band needs no extra padding.
  let extraTop = needsInset(top, insets, frame) ? top.top + top.height : 0;
  let extraBottom = needsInset(bottom, insets, frame) ? frame.height - bottom.top : 0;
  let extraRight = 0;
  let extraLeft = 0;
  for (const side of [right, left]) {
    if (!needsInset(side, insets, frame)) {
      continue;
    }
    const band = cornerBand(side, frame);
    if (band === 'top') {
      extraTop = Math.max(extraTop, side.top + side.height);
    } else if (band === 'bottom') {
      extraBottom = Math.max(extraBottom, frame.height - side.top);
    } else if (side === right) {
      extraRight = frame.width - right.left;
    } else {
      extraLeft = left.left + left.width;
    }
  }
  insets.top = Math.min(frame.height, Math.max(insets.top, extraTop));
  insets.right = Math.min(frame.width, Math.max(insets.right, extraRight));
  insets.bottom = Math.min(frame.height, Math.max(insets.bottom, extraBottom));
  insets.left = Math.min(frame.width, Math.max(insets.left, extraLeft));
}

function needsInset(rect: window.Rect, insets: WindowInsets, frame: window.Rect): boolean {
  return hasArea(rect) &&
    rect.left + rect.width > insets.left && rect.left < frame.width - insets.right &&
    rect.top + rect.height > insets.top && rect.top < frame.height - insets.bottom;
}
