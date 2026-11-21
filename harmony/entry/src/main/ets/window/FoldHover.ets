import { FoldSplitContainer, HoverModeStatus, window } from '@kit.ArkUI';

export interface FoldBounds {
  upper: number;
  lower: number;
}

@Component
export struct FoldHover {
  onChange: (bounds: FoldBounds | null) => void = () => {};
  private hovering: boolean = false;
  private originY: number = 0;
  private upperEnd: number = 0;
  private lowerStart: number = 0;

  private update(): void {
    const upper = this.upperEnd - this.originY;
    const lower = this.lowerStart - this.originY;
    this.onChange(this.hovering && lower >= upper && upper > 0 ? { upper, lower } : null);
  }

  @Builder
  region(upper: boolean) {
    Column()
      .width('100%')
      .height('100%')
      .onAreaChange((_previous: Area, area: Area) => {
        const top = Number(area.globalPosition.y);
        if (upper) {
          this.upperEnd = top + Number(area.height);
        } else {
          this.lowerStart = top;
        }
        this.update();
      })
  }

  build() {
    // Read the actual hinge from the system layout while keeping a single full-window ArkWeb.
    Stack() {
      FoldSplitContainer({
        primary: () => { this.region(true); },
        secondary: () => { this.region(false); },
        animationOptions: null,
        onHoverStatusChange: (status: HoverModeStatus) => {
          this.hovering = status.isHoverMode && status.windowStatusType === window.WindowStatusType.FULL_SCREEN;
          this.update();
        }
      })
    }
    .width('100%')
    .height('100%')
    .onAreaChange((_previous: Area, area: Area) => {
      this.originY = Number(area.globalPosition.y);
      this.update();
    })
    .hitTestBehavior(HitTestMode.None)
    .accessibilityLevel('no-hide-descendants')
  }
}
