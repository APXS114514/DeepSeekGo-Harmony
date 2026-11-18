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
    if (deviceInfo.sdkApiVersion >= 26) {
      return uiMaterial.isImmersiveMaterialSupported() ? HeaderMaterial.ArkUI : HeaderMaterial.Plain;
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
  onMenu: () => void = () => {};
  onNewChat: () => void = () => {};
  @State private material: HeaderMaterial = HeaderMaterial.Plain;

  aboutToAppear(): void {
    this.material = getHeaderMaterial();
  }

  private foreground(): string {
    return this.dark ? '#F1F6F2' : '#172219';
  }

  private surface(): string {
    return this.dark ? '#161C19' : '#F8F9F5';
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
  titleRow() {
    Row({ space: 8 }) {
      this.actionButton($r('sys.symbol.line_3_horizontal'), this.menuLabel, this.onMenu)
      Text(this.title)
        .layoutWeight(1)
        .fontSize(15)
        .fontWeight(FontWeight.Medium)
        .fontColor(this.foreground())
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      if (this.showNewChat) {
        this.actionButton($r('sys.symbol.square_and_pencil'), this.newChatLabel, this.onNewChat)
      }
    }
    .width('100%')
    .height(CHAT_HEADER_HEIGHT)
    .padding({ left: 10, right: 10 })
  }

  @Builder
  arkTitle() {
    Navigation() {
    }
    .mode(NavigationMode.Stack)
    .titleMode(NavigationTitleMode.Mini)
    .hideBackButton(true)
    .hideToolBar(true)
    .title({ builder: (): void => this.titleRow(), height: CHAT_HEADER_HEIGHT }, {
      barStyle: BarStyle.STACK,
      systemMaterial: new uiMaterial.ImmersiveMaterial({
        style: uiMaterial.ImmersiveStyle.THIN,
        lightEffect: {}
      })
    })
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
      if (this.material === HeaderMaterial.ArkUI) {
        this.arkTitle()
      } else if (this.material === HeaderMaterial.Hds) {
        this.hdsTitle()
      } else {
        this.titleRow()
      }
    }
    .width('100%')
    .height(CHAT_HEADER_HEIGHT)
    .clip(true)
    .backgroundColor(this.material === HeaderMaterial.Plain ? this.surface() : Color.Transparent)
  }
}
