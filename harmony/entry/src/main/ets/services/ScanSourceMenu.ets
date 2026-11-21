export interface ScanSourceLabels {
  title: string;
  camera: string;
  album: string;
  cancel: string;
}

export type ScanSourcePicker = (labels: ScanSourceLabels) => Promise<string | null>;

@Builder
function scanSourceRow(icon: Resource, label: string, action: () => void) {
  Button({ type: ButtonType.Normal, buttonStyle: ButtonStyleMode.TEXTUAL }) {
    Row({ space: 10 }) {
      SymbolGlyph(icon)
        .fontSize('20vp')
        .fontColor([$r('sys.color.ohos_id_color_text_primary')])
        .accessibilityLevel('no')
      Text(label)
        .fontSize(16)
        .fontColor($r('sys.color.ohos_id_color_text_primary'))
    }
    .justifyContent(FlexAlign.Center)
    .padding({ left: 12, right: 12, top: 10, bottom: 10 })
  }
  .width('100%')
  .constraintSize({ minHeight: 48 })
  .backgroundColor(Color.Transparent)
  .accessibilityText(label)
  .onClick(action)
}

@CustomDialog
export struct ScanSourceDialog {
  controller?: CustomDialogController;
  labels: ScanSourceLabels = { title: '', camera: '', album: '', cancel: '' };
  onSelect: (source: string) => void = () => {};

  private select(source: string): void {
    this.onSelect(source);
    this.controller?.close();
  }

  build() {
    Column({ space: 4 }) {
      Text(this.labels.title)
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
        .fontColor($r('sys.color.ohos_id_color_text_primary'))
        .textAlign(TextAlign.Center)
        .padding({ left: 12, right: 12, top: 8, bottom: 12 })
      scanSourceRow($r('sys.symbol.camera'), this.labels.camera, () => this.select('camera'))
      scanSourceRow($r('sys.symbol.picture'), this.labels.album, () => this.select('album'))
      Button(this.labels.cancel, { type: ButtonType.Normal, buttonStyle: ButtonStyleMode.TEXTUAL })
        .width('100%')
        .constraintSize({ minHeight: 48 })
        .backgroundColor(Color.Transparent)
        .onClick(() => this.select(''))
    }
    .width('100%')
    .padding(12)
  }
}
