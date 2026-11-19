export const CHAT_HEADER_HEIGHT = 60;

@Component
export struct ChatHeader {
  @Prop title: string;
  @Prop menuLabel: string;
  @Prop newChatLabel: string;
  @Prop showNewChat: boolean;
  @Prop dark: boolean;
  onMenu: () => void = () => {};
  onNewChat: () => void = () => {};

  private foreground(): string {
    return this.dark ? '#F2F2F2' : '#1A1A1A';
  }

  @Builder
  actionButton(symbol: Resource, label: string, action: () => void) {
    Button({ type: ButtonType.Circle, buttonStyle: ButtonStyleMode.TEXTUAL, stateEffect: true }) {
      // 图标固定 22vp，与网页顶栏一致；标题用 fp 跟随系统字体。
      SymbolGlyph(symbol).fontSize('22vp').fontColor([this.foreground()]).accessibilityLevel('no');
    }
    .width(44)
    .height(44)
    .backgroundColor(Color.Transparent)
    .accessibilityText(label)
    .onClick(action)
  }

  build() {
    Row({ space: 8 }) {
      this.actionButton($r('sys.symbol.line_3_horizontal'), this.menuLabel, this.onMenu)
      Text(this.title)
        .accessibilityGroup(true)
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
}
