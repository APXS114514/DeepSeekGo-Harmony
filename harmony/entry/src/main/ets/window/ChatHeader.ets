import { SymbolGlyphModifier, uiMaterial } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';
import { HdsNavigation, HdsNavigationMenuItemOptions, HdsNavigationTitleMode, hdsMaterial } from '@kit.UIDesignKit';

export const CHAT_HEADER_HEIGHT = 60;

enum HeaderMaterial {
  Plain,
  Hds,
  ArkUI
}

function getHeaderMaterial(): HeaderMaterial {
  try {
    if (deviceInfo.sdkApiVersion >= 26 && uiMaterial.isImmersiveMaterialSupported()) {
      return HeaderMaterial.ArkUI;
    }
    if (deviceInfo.distributionOSApiVersion >= 60100) {
      if (hdsMaterial.getSystemMaterialTypes().includes(hdsMaterial.MaterialType.IMMERSIVE)) {
        return HeaderMaterial.Hds;
      }
    }
  } catch {
    // Older devices and devices without a material implementation use the plain bar.
  }
  return HeaderMaterial.Plain;
}

@Component
export struct ChatHeader {
  @Prop title: string;
  @Prop menuLabel: string;
  @Prop newChatLabel: string;
  @Prop showNewChat: boolean;
  @Prop dark: boolean;
  @Prop immersiveLight: boolean;
  onMenu: () => void = () => {};
  onNewChat: () => void = () => {};
  @State private material: HeaderMaterial = HeaderMaterial.Plain;

  aboutToAppear(): void {
    this.material = getHeaderMaterial();
  }

  private foreground(): string {
    return this.dark ? '#F1F6F2' : '#172219';
  }

  @Builder
  actionButton(symbol: Resource, label: string, action: () => void) {
    Button({ type: ButtonType.Circle, stateEffect: true }) {
      SymbolGlyph(symbol).fontSize(22).fontColor([this.foreground()]);
    }
    .width(44)
    .height(44)
    .backgroundColor(Color.Transparent)
    .accessibilityText(label)
    .onClick(action)
  }

  @Builder
  immersiveButton(symbol: Resource, label: string, action: () => void) {
    Button({ type: ButtonType.Circle, stateEffect: true }) {
      SymbolGlyph(symbol).fontSize(22).fontColor([this.foreground()]);
    }
    .width(44)
    .height(44)
    .systemMaterial(new uiMaterial.ImmersiveMaterial({
      style: uiMaterial.ImmersiveStyle.THIN,
      lightEffect: {}
    }))
    .accessibilityText(label)
    .onClick(action)
  }

  @Builder
  headerButton(symbol: Resource, label: string, action: () => void) {
    if (this.immersiveLight && this.material === HeaderMaterial.ArkUI) {
      this.immersiveButton(symbol, label, action)
    } else {
      this.actionButton(symbol, label, action)
    }
  }

  @Builder
  titleRow() {
    Row({ space: 8 }) {
      this.headerButton($r('sys.symbol.line_3_horizontal'), this.menuLabel, this.onMenu)
      Text(this.title)
        .layoutWeight(1)
        .fontSize(15)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.foreground())
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      if (this.showNewChat) {
        this.headerButton($r('sys.symbol.square_and_pencil'), this.newChatLabel, this.onNewChat)
      }
    }
    .width('100%')
    .height(CHAT_HEADER_HEIGHT)
    .padding({ left: 10, right: 10 })
  }

  private hdsMenu(): HdsNavigationMenuItemOptions[] {
    if (!this.showNewChat) {
      return [];
    }
    return [{ content: {
      icon: new SymbolGlyphModifier($r('sys.symbol.square_and_pencil')),
      label: this.newChatLabel,
      action: this.onNewChat
    } }];
  }

  @Builder
  hdsTitle() {
    HdsNavigation() {
    }
    .mode(NavigationMode.Stack)
    .titleMode(HdsNavigationTitleMode.MINI)
    .hideToolBar(true)
    .titleBar({
      avoidLayoutSafeArea: false,
      enableComponentSafeArea: false,
      content: {
        title: { mainTitle: this.title },
        backIcon: {
          icon: new SymbolGlyphModifier($r('sys.symbol.line_3_horizontal')),
          label: this.menuLabel,
          action: this.onMenu
        },
        menu: { value: this.hdsMenu() }
      },
      style: {
        scrollEffectOpts: { enableScrollEffect: false },
        originalStyle: {
          backgroundStyle: { backgroundColor: Color.Transparent },
          contentStyle: {
            titleStyle: { mainTitleColor: this.foreground() },
            menuStyle: { iconColor: this.foreground() },
            backIconStyle: { iconColor: this.foreground() }
          }
        },
        systemMaterialEffect: {
          materialLevel: hdsMaterial.MaterialLevel.ADAPTIVE,
          materialType: hdsMaterial.MaterialType.IMMERSIVE
        }
      }
    })
  }

  build() {
    Stack({ alignContent: Alignment.Top }) {
      if (this.immersiveLight && this.material === HeaderMaterial.Hds) {
        this.hdsTitle()
      } else {
        this.titleRow()
      }
    }
    .width('100%')
    .height(CHAT_HEADER_HEIGHT)
    .clip(true)
  }
}
