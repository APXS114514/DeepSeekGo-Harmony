import { ComponentContent, promptAction, uiMaterial, UIContext } from '@kit.ArkUI';
import { Available } from '@kit.BasicServicesKit';
import { supportsImmersiveMaterial } from '../window/ImmersiveMaterial';

export interface ScanSourceLabels {
  title: string;
  camera: string;
  album: string;
  cancel: string;
}

export type ScanSourcePicker = (labels: ScanSourceLabels) => Promise<string | null>;

class ScanSourceDialogParams {
  labels: ScanSourceLabels;
  select: (source: string) => void;

  constructor(labels: ScanSourceLabels, select: (source: string) => void) {
    this.labels = labels;
    this.select = select;
  }
}

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

@Builder
function scanSourceDialog(params: ScanSourceDialogParams) {
  Column({ space: 4 }) {
    Text(params.labels.title)
      .fontSize(20)
      .fontWeight(FontWeight.Bold)
      .fontColor($r('sys.color.ohos_id_color_text_primary'))
      .textAlign(TextAlign.Center)
      .padding({ left: 12, right: 12, top: 8, bottom: 12 })
    scanSourceRow($r('sys.symbol.camera'), params.labels.camera, () => params.select('camera'))
    scanSourceRow($r('sys.symbol.picture'), params.labels.album, () => params.select('album'))
    Button(params.labels.cancel, { type: ButtonType.Normal, buttonStyle: ButtonStyleMode.TEXTUAL })
      .width('100%')
      .constraintSize({ minHeight: 48 })
      .backgroundColor(Color.Transparent)
      .onClick(() => params.select(''))
  }
  .width('100%')
  .padding(12)
}

/** Only loaded after the bridge checks the API version. */
@Available({ minApiVersion: '26.0.0' })
function chooseScanSource(ui: UIContext, labels: ScanSourceLabels): Promise<string | null> {
  const prompt = ui.getPromptAction();
  return new Promise<string | null>((resolve) => {
    let selected: string = '';
    let closing = false;
    let appeared = false;
    let finished = false;
    const select = (source: string): void => {
      if (closing) {
        return;
      }
      closing = true;
      selected = source;
      prompt.closeCustomDialog(content).catch(() => {
        closing = false;
        selected = '';
      });
    };
    const content = new ComponentContent(ui, wrapBuilder(scanSourceDialog), new ScanSourceDialogParams(labels, select));
    const finish = (result: string | null): void => {
      if (!finished) {
        finished = true;
        content.dispose();
        resolve(result);
      }
    };
    const options: promptAction.BaseDialogOptions = {
      alignment: DialogAlignment.Center,
      autoCancel: true,
      systemMaterial: new uiMaterial.ImmersiveMaterial({ style: uiMaterial.ImmersiveStyle.ULTRA_THICK }),
      onWillAppear: () => { appeared = true; },
      onDidDisappear: () => finish(selected)
    };
    prompt.openCustomDialog(content, options).catch(() => finish(appeared ? '' : null));
  });
}

@Available({ minApiVersion: '26.0.0' })
export function createScanSourcePicker(ui: UIContext): ScanSourcePicker | null {
  if (!supportsImmersiveMaterial()) {
    return null;
  }
  return (labels: ScanSourceLabels): Promise<string | null> => chooseScanSource(ui, labels);
}
