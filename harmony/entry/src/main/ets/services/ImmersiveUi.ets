import type { ScanSourceLabels } from './ScanSourceMenu';

export interface NativeMenuOption {
  key: string;
  label: string;
  icon?: string;
  danger?: boolean;
}

export interface NativeMenuPayload {
  title?: string;
  options: NativeMenuOption[];
  cancel: string;
}

export interface NativeConfirmPayload {
  title: string;
  message?: string;
  confirm: string;
  cancel: string;
  danger?: boolean;
}

export interface NativeSheetItem {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  active?: boolean;
}

export interface NativeSheetSection {
  title: string;
  items: NativeSheetItem[];
}

export interface NativeSheetPayload {
  title: string;
  sections: NativeSheetSection[];
  cancel: string;
}

export interface NativeUiPresenter {
  scanSource: (labels: ScanSourceLabels) => Promise<string | null>;
  menu: (payload: NativeMenuPayload) => Promise<string | null>;
  confirm: (payload: NativeConfirmPayload) => Promise<boolean | null>;
  sheet: (payload: NativeSheetPayload) => Promise<string | null>;
}

function resolveSymbol(name?: string): Resource | null {
  switch (name) {
    case 'rename':
    case 'edit':
      return $r('sys.symbol.square_and_pencil');
    case 'share':
      return $r('sys.symbol.share');
    case 'delete':
      return $r('sys.symbol.trash');
    case 'camera':
      return $r('sys.symbol.camera');
    case 'album':
      return $r('sys.symbol.picture');
    case 'file':
      return $r('sys.symbol.paperclip');
    case 'think':
      return $r('sys.symbol.lightbulb');
    case 'search':
      return $r('sys.symbol.magnifyingglass');
    case 'link':
      return $r('sys.symbol.link');
    case 'undo':
      return $r('sys.symbol.undo');
    default:
      return null;
  }
}

@Builder
function menuActionRow(option: NativeMenuOption, action: () => void) {
  Button({ type: ButtonType.Normal, buttonStyle: ButtonStyleMode.TEXTUAL }) {
    Row({ space: 10 }) {
      if (resolveSymbol(option.icon) !== null) {
        SymbolGlyph(resolveSymbol(option.icon) as Resource)
          .fontSize('20vp')
          .fontColor([
            option.danger
              ? $r('sys.color.ohos_id_color_warning')
              : $r('sys.color.ohos_id_color_text_primary')
          ])
          .accessibilityLevel('no')
      }
      Text(option.label)
        .fontSize(16)
        .fontColor(
          option.danger
            ? $r('sys.color.ohos_id_color_warning')
            : $r('sys.color.ohos_id_color_text_primary')
        )
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
    }
    .justifyContent(FlexAlign.Center)
    .padding({ left: 12, right: 12, top: 10, bottom: 10 })
  }
  .width('100%')
  .constraintSize({ minHeight: 48 })
  .backgroundColor(Color.Transparent)
  .accessibilityText(option.label)
  .onClick(action)
}

/**
 * 原生操作菜单弹窗（用于替代网页长按/右键/更多菜单）。
 * 使用标准系统背板（customStyle: false），在开启沉浸光感时自动获得 ULTRA_THICK 系统材质。
 */
@CustomDialog
export struct NativeMenuDialog {
  controller?: CustomDialogController;
  payload: NativeMenuPayload = { options: [], cancel: '' };
  onSelect: (key: string) => void = () => {};

  private choose(key: string): void {
    this.onSelect(key);
    this.controller?.close();
  }

  build() {
    Column({ space: 4 }) {
      if (this.payload.title) {
        Text(this.payload.title)
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor($r('sys.color.ohos_id_color_text_primary'))
          .textAlign(TextAlign.Center)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .padding({ left: 12, right: 12, top: 8, bottom: 10 })
      }
      ForEach(this.payload.options, (option: NativeMenuOption) => {
        menuActionRow(option, () => this.choose(option.key))
      }, (option: NativeMenuOption) => option.key)
      Button(this.payload.cancel, { type: ButtonType.Normal, buttonStyle: ButtonStyleMode.TEXTUAL })
        .width('100%')
        .constraintSize({ minHeight: 48 })
        .backgroundColor(Color.Transparent)
        .fontColor($r('sys.color.ohos_id_color_text_secondary'))
        .onClick(() => this.choose(''))
    }
    .width('100%')
    .padding(12)
  }
}

/**
 * 原生确认弹窗（用于删除会话、清空历史、清空记忆和删除人设卡）。
 * 使用标准系统背板，在开启沉浸光感时自动获得系统材质。
 */
@CustomDialog
export struct NativeConfirmDialog {
  controller?: CustomDialogController;
  payload: NativeConfirmPayload = { title: '', confirm: '', cancel: '' };
  onResult: (confirmed: boolean) => void = () => {};

  private finish(confirmed: boolean): void {
    this.onResult(confirmed);
    this.controller?.close();
  }

  build() {
    Column({ space: 12 }) {
      Text(this.payload.title)
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('sys.color.ohos_id_color_text_primary'))
        .textAlign(TextAlign.Center)
        .padding({ left: 8, right: 8, top: 6 })
      if (this.payload.message) {
        Text(this.payload.message)
          .fontSize(15)
          .fontColor($r('sys.color.ohos_id_color_text_secondary'))
          .textAlign(TextAlign.Center)
          .padding({ left: 8, right: 8 })
      }
      Row({ space: 10 }) {
        Button(this.payload.cancel, { type: ButtonType.Capsule, buttonStyle: ButtonStyleMode.NORMAL })
          .layoutWeight(1)
          .constraintSize({ minHeight: 44 })
          .onClick(() => this.finish(false))
        Button(this.payload.confirm, { type: ButtonType.Capsule, buttonStyle: ButtonStyleMode.TEXTUAL })
          .layoutWeight(1)
          .constraintSize({ minHeight: 44 })
          .fontColor(
            this.payload.danger
              ? $r('sys.color.ohos_id_color_warning')
              : $r('sys.color.ohos_id_color_emphasize')
          )
          .onClick(() => this.finish(true))
      }
      .width('100%')
      .padding({ top: 6 })
    }
    .width('100%')
    .padding(16)
  }
}

@Builder
function toolsSheetRow(item: NativeSheetItem, onSelect: (key: string) => void) {
  Button({ type: ButtonType.Normal, buttonStyle: ButtonStyleMode.TEXTUAL }) {
    Row({ space: 12 }) {
      if (resolveSymbol(item.icon) !== null) {
        SymbolGlyph(resolveSymbol(item.icon) as Resource)
          .fontSize('20vp')
          .fontColor([
            item.active
              ? $r('sys.color.ohos_id_color_emphasize')
              : $r('sys.color.ohos_id_color_text_primary')
          ])
          .accessibilityLevel('no')
      }
      Column({ space: 2 }) {
        Text(item.label)
          .fontSize(16)
          .fontWeight(item.active ? FontWeight.Medium : FontWeight.Regular)
          .fontColor(
            item.active
              ? $r('sys.color.ohos_id_color_emphasize')
              : $r('sys.color.ohos_id_color_text_primary')
          )
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        if (item.description) {
          Text(item.description)
            .fontSize(12)
            .fontColor($r('sys.color.ohos_id_color_text_secondary'))
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      if (item.active) {
        SymbolGlyph($r('sys.symbol.checkmark'))
          .fontSize('18vp')
          .fontColor([$r('sys.color.ohos_id_color_emphasize')])
          .accessibilityLevel('no')
      }
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 10, bottom: 10 })
  }
  .width('100%')
  .constraintSize({ minHeight: 48 })
  .borderRadius(12)
  .backgroundColor(Color.Transparent)
  .accessibilityText(item.label)
  .onClick(() => onSelect(item.key))
}

/**
 * 原生附件与工具入口半模态内容，挂载于 Index.ets 的 bindSheet 中自动获得系统沉浸光感材质。
 */
@Builder
export function nativeToolsSheetBuilder(payload: NativeSheetPayload, onSelect: (key: string) => void) {
  Column({ space: 12 }) {
    if (payload.title) {
      Text(payload.title)
        .fontSize(18)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('sys.color.ohos_id_color_text_primary'))
        .width('100%')
        .padding({ left: 12, right: 12, top: 4 })
    }
    ForEach(payload.sections, (section: NativeSheetSection) => {
      Column({ space: 4 }) {
        if (section.title) {
          Text(section.title)
            .fontSize(12)
            .fontWeight(FontWeight.Medium)
            .fontColor($r('sys.color.ohos_id_color_text_secondary'))
            .width('100%')
            .padding({ left: 12, right: 12, top: 4, bottom: 2 })
        }
        ForEach(section.items, (item: NativeSheetItem) => {
          toolsSheetRow(item, onSelect)
        }, (item: NativeSheetItem) => item.key)
      }
      .width('100%')
    }, (section: NativeSheetSection) => section.title)
  }
  .width('100%')
  .padding({ left: 12, right: 12, top: 8, bottom: 24 })
}
