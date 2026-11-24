# Deepseek GO 交接

## 工作区

- 当前源码为 1.6.0，版本代码为 `1000023`。接手时用 `git status --short` 和 `git log -1 --oneline` 查看源码状态。
- 1.6.0 未签名 Release 包为 `HAPS/Deepseek-GO-1.6.0-unsigned.hap`，对应标签 `v1.6.0`。构建自 `5e3e32f`，标签提交另含本次发布记录。SHA-256 为 `9981364c6a49e644196bb03979e13bdf2d1d7513823bdb7b36338f609ba8413a`。
- 1.6.0 识字弹窗修订测试包归档为 `HAPS/Deepseek-GO-1.6.0-88b1f52-unsigned.hap`，SHA-256 为 `04acd485966b29f107ea36b9bb5503c2c9c71ad98f618fb8f206772b9ef7a92b`。原测试包归档为 `HAPS/Deepseek-GO-1.6.0-04a6164-unsigned.hap`，SHA-256 为 `ea38ccfc4dc7c6ac2bf278555db8c0f08deddc7d7b2fde22fa058e14a0c80ab3`。
- 1.5.4 未签名 Release 包为 `HAPS/Deepseek-GO-1.5.4-unsigned.hap`，对应标签 `v1.5.4`。SHA-256 为 `495c1e434b21783d739e7a113e726eabeab184cf6b20aca81ac6986c0b54439b`。
- 1.5.3 未签名 Release 包为 `HAPS/Deepseek-GO-1.5.3-unsigned.hap`，对应标签 `v1.5.3`（指向 `1990016`，与构建源码只差交接文档）。SHA-256 为 `057defced981edb56680589ba5465db163da2021e5c295b4f36bb77efbe01631`。维护者签名安装后已在 HOP-AL10 真机复测通过。GitHub Releases 的 `v1.5.3` 附件与本地包逐字节一致。
- 1.5.2 未签名 Release 包为 `HAPS/Deepseek-GO-1.5.2-unsigned.hap`，对应标签 `v1.5.2`。SHA-256 为 `235375f025fab29424731279fdd1a53ef8428f356fb9d7e32f5c9262b092dcd6`。
- 已发布的 1.5.1 未签名 Release 包 `HAPS/Deepseek-GO-1.5.1-unsigned.hap` 构建自 `94bda5f`，SHA-256 为 `e58277edddb7c8170aff7e5cf0868dc4098a7d569499a139d10ba5bf86544695`。上一份 1.5.1 测试包构建自 `1f3d305`，归档为 `HAPS/Deepseek-GO-1.5.1-1f3d305-unsigned.hap`，SHA-256 为 `eeb609199e827a02c558f5b6d8dcd3247c1e578fec2c474f48854eec2f65d501`。
- 1.5.0 未签名 Release 包为 `HAPS/Deepseek-GO-1.5.0-unsigned.hap`，构建自提交 `902b474`，版本代码 `1000018`。维护者确认本轮测试通过，9 项鸿蒙回归与 HarmonyOS 26.0.0 SDK Release 构建通过。包内确认最低 API 12、155 个网页资源、欢迎页 Logo、启动器图标和图像授权声明。SHA-256 为 `cad85a0ab5374258c81124d645e982946cd62aa6859e10a53e53ac23a62796f5`。上一包归档为 `HAPS/Deepseek-GO-1.5.0-6f7b82e-unsigned.hap`，SHA-256 为 `9bd35be013fc782621fc5155d383fdc4e4c30ace2c249495bdc999de4ab2a5d0`。
- 1.4.2 本地测试包是 `HAPS/Deepseek-GO-1.4.2-unsigned.hap`，版本代码为 `1000017`，对应提交 `cb3286d`。SHA-256 为 `1f1f80763a6ff192d75f1011301b408aeb391534eb0316ca7cd2496f365cf844`。上一轮测试包归档在 `HAPS/Deepseek-GO-1.4.2-ed689a4-unsigned.hap`，SHA-256 为 `6360fbf238728e2e9d5b4b4bd4b67e9c60f026f94cc24a55f91aa51c489ac774`。
- GitHub Releases 的 `v1.5.1` 标签指向 `94bda5f`，远端 HAP 与上列 1.5.1 Release 包逐字节一致。只有用户明确要求时才打包当前源码版本。
- 上游仓库是 GitHub 上的 `APXS114514/DeepSeekGo-Harmony`，默认分支为 `main`。贡献方式见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。仓库只收源码、配置、文档和图片资源。根目录只留 README、AGENTS、许可证和图像授权声明，其他文档在 `docs/`。忽略规则覆盖本机元数据（如 `.DS_Store`）、依赖、构建产物、`HAPS/`、签名材料，以及上游遗留的 `chat-demo-main/.github/` 和过期的 `*.module.css.d.ts`。README 截图在 `assets/images/screenshots/`，使用鸿蒙版网页构建产物、模拟接口和设备消息通道生成。维护者的截图生成命令见本机 `AGENTS.local.md`。
- 保持覆盖安装所需的包名 `com.pocketchat.deepseek`。用户在手机上填写 Key，由 ArkWeb 消息通道交给系统 Asset Store。测试使用模拟 Key 和回复。

版本、提交和发布规则见 [`AGENTS.md`](../AGENTS.md#版本与提交)，每版的用户可见变化见 [`CHANGELOG.md`](CHANGELOG.md)。

## SDK 与编译工具

| 项目 | 当前配置与用途 |
| --- | --- |
| 编译 SDK | HarmonyOS 26.0.0。1.0.5 HAP 的 `compileSdkVersion` 实测为 `26.0.0.105`。使用带对应 SDK 的 DevEco Studio 或命令行工具，由 Hvigor 调用 ArkTS 编译器，再打包 HAP。 |
| 目标与最低版本 | [`harmony/build-profile.json5`](../harmony/build-profile.json5) 配置 `targetSdkVersion: "26.0.0"`、`compatibleSdkVersion: "5.0.0(12)"` 和 `runtimeOS: "HarmonyOS"`。目标版本声明应用所适配的 API 版本，也满足应用级光感的启用条件。最低版本是 HarmonyOS 5.0（API 12）。调用高版本 API 时按系统版本及设备能力检查，并保留普通界面。 |
| ArkTS 与 ArkUI | `harmony/entry/src/main/ets/` 是原生代码。ArkUI 承载窗口、系统栏和窄屏原生顶栏。 |
| ArkWeb 与前端 | 聊天页、侧栏、设置和输入框由 ArkWeb 渲染。Node.js 下的 pnpm/Rspack 构建 `chat-demo-main/`，`pnpm build:harmony` 将网页资源输出到 `harmony/entry/src/main/resources/rawfile/chat/`，供 HAP 内置。 |

后续鸿蒙构建会将原创角色图像的 CC BY-NC-ND 4.0 授权声明 [`ARTWORK-NOTICE.txt`](../ARTWORK-NOTICE.txt) 复制到 `chat/ARTWORK-NOTICE.txt`，随欢迎页图像和启动器图标一起进入 HAP。上游 MIT 许可证以 `chat/LICENSE` 随包分发。

## 沉浸光感开关

- **原生应用级配置**位于 [`harmony/entry/src/main/module.json5`](../harmony/entry/src/main/module.json5) 的 `module.metadata`，键为 `ohos.arkui.UIMaterial.state`，当前值为 `enable`。已在 1.0.5 HAP 内的 `module.json` 中核实。这是 Entry 模块的静态配置，要求目标 SDK 至少为 26.0.0，作用范围是支持系统材质的原生 ArkUI 组件和场景。ArkWeb 中的 HTML 元素由网页样式控制。 [华为官方指南](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-enable)

  | 值 | 效果 |
  | --- | --- |
  | `default` 或省略 | 沿用 SDK 的默认策略，按组件及场景应用材质。 |
  | `enable` | 为适配的原生组件和场景批量开启系统材质。 |
  | `disable` | 在应用级禁用系统材质，组件级开启也不生效。 |

- **原生组件级配置**可通过 `systemMaterial` 等属性调整支持的组件。应用级未禁用时，组件配置优先，个别组件可通过 `uiMaterial.Material.empty` 关闭。排查时，在支持的系统上用 `uiMaterial.getMaterialInfo()` 读取应用级配置状态，用 `uiMaterial.isImmersiveMaterialSupported()` 检查设备能力，再用真机验证呈现。 [组件适配指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-immersive-light-sense-component-adaptation/)
- **通用设置 → 外观 → 沉浸光感**默认开启，保存在本地的 `chat-demo:immersive-light`。[`App.tsx`](../chat-demo-main/src/app/App.tsx) 据此更新 `data-immersive-light`，由 [`ChatInput.module.css`](../chat-demo-main/src/components/chatInput/ChatInput.module.css) 控制半透明底、背景模糊和高光。支持原生材质的设备还会给窄屏原生顶栏的操作按钮应用薄材质，并在「识别图片文字」中打开带系统图标的 ArkUI 弹窗。

## 1.6.0 鸿蒙交互

- **折叠屏旋转锁定**。Pura X Max（HOP-AL10，HarmonyOS 7.0.0.111）安装声明 `follow_desktop` 的第一份修订后，用户在内屏控制中心点亮旋转锁定，回到全屏对话后转动设备。显示服务记录了三次旋转，前台应用窗口的旋转策略为 `5`（`AUTO_ROTATION`）。`FoldSplitContainer` 在挂载和折叠状态变化时调用 `setPreferredOrientation`，展开时覆盖为不受系统锁定控制的 `AUTO_ROTATION`。 [ArkUI 组件源码](https://github.com/openharmony/arkui_ace_engine/blob/master/advanced_ui_component/foldsplitcontainer/interfaces/foldsplitcontainer.js) · [华为 Pura X Max 适配指南](https://developer.huawei.com/consumer/cn/doc/best-practices/bpta-purax-guide/)
- **悬停折痕读取**。移除用于测量折痕的 `FoldSplitContainer`，保持 `module.json5` 的 `follow_desktop`。在半折叠且窗口全屏时从显示服务读取横向折痕，从窗口尺寸和屏幕状态事件刷新折痕，并继续把折痕上下边界传给同一个 ArkWeb。API 20 及以上优先用实时折痕接口，旧版使用折痕坐标和屏幕旋转角度换算。窗口和折痕数据暂未就绪时恢复普通布局。 [鸿蒙显示接口](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-references/js-apis-display/)
- **旋转修订验证**。11 项鸿蒙回归、前端类型检查、Lint 和 HarmonyOS 26.0.0 SDK Debug 编译通过。回归覆盖旋转策略、实时和旧版折痕坐标、非全屏回退、悬停切换与草稿保留。包内确认最低 API 12、`follow_desktop`，运行代码已移除 `FoldSplitContainer`。CodeLinter 通过 `FoldHover.ets`，`Index.ets` 的动态导入诊断在修改前也出现。安装修订版后，维护者确认 HOP-AL10 内屏旋转锁定问题已解决，悬停布局待单独实测。
- **软键盘换行**。旧版在 Pura X Max 内屏点实际「换行」键时，空白输入框没有插入换行。从聊天入口用有内容的草稿和模拟 API 复现了普通 Enter 提交草稿。鸿蒙输入框声明换行键提示，手机和平板的普通 Enter 由输入法处理。2in1 在软键盘收起时保留实体键盘 Enter 发送，`Shift+Enter` 换行，`Ctrl+Enter` 和 `⌘+Enter` 可明确提交。输入法组合和确认阶段继续由输入法处理。 [ArkWeb 软键盘适配](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V13/web-docking-softkeyboard-V13/)
- **换行验证**。模拟 API 验证手机和宽窗平板在光标位置插入换行、点发送传入多行内容，以及实体键盘和输入法组合。前端类型、Lint、两种网页构建和 HarmonyOS 26.0.0 SDK Debug 构建通过。全量回归首轮有悬停布局和草稿光标的时序失败，调整断言等待条件后对应脚本通过，其余脚本均通过。维护者已在 HOP-AL10 签名安装并确认默认软键盘换行通过。
- **展开态软键盘动效**。维护者在 Pura X Max 展开时点聊天输入框，发现软键盘弹出过程中输入框抖动。用 942 × 680 模拟内屏从已有会话复现，视口上缘立即偏移而高度还在过渡，导致框架下缘和输入栏两次向下回跳。聊天框架与弹窗改为同步过渡视口上下边界，输入栏的底部安全区按过渡中的下边界计算。逐帧上报直接跟随键盘，页面缩放继续按缩放比例换算安全区。回归检查视口两次上报期间输入栏连续上移且草稿保留。维护者安装修订后确认回跳消失，并反馈上移动效仍有卡顿。
- **展开态键盘验证**。11 项鸿蒙浏览器回归、前端类型、Lint、格式、两种网页构建和 HarmonyOS 26.0.0 SDK Debug 构建通过。核对未签名调试包的 155 个网页资源、版本 1.6.0 和最低 API 12。按内核版本，HarmonyOS 5 的 ArkWeb M114 已支持下边界过渡所用的 CSS `@property`。 [华为 ArkWeb 版本表](https://developer.huawei.com/consumer/cn/doc/harmonyOS-guides/web-component-overview/) · [Chromium 85 发行说明](https://developer.chrome.com/blog/new-in-chrome-85/)
- **界面动效优化**。ArkWeb 视口大小和位置事件每帧合并一次，只使用该帧最终值。一次性大幅变化使用最长 180 ms 的过渡，后续修正共用原定结束时间。宽屏来源面板在开合时保持固定宽度，以平移滑动，聊天区在面板插入或移除时分别重新布局。输入栏在键盘或移动侧栏过渡期间暂时关闭背景模糊，弹窗以半透明遮罩覆盖背景，流式状态提示通过透明度表现。侧栏、弹窗和输入栏采用一致的缓出曲线，遵循减少动态效果设置。
- **动效优化验证**。新增同帧多次视口更新、后续修正沿用结束时间、宽屏来源面板动画途中宽度稳定，以及抽屉关闭后恢复输入栏模糊的回归。Chrome 在 1100 × 700 窗口开启四倍 CPU 降速，用同一模拟会话开关来源面板各三次，单次操作的 `LayoutCount` 由 13–17 次降至 2 次。11 项鸿蒙回归、类型、Lint、格式、两种网页构建和 HarmonyOS 26.0.0 SDK Debug 构建通过。未签名包核对 1.6.0 / `1000023`、最低 API 12 和 155 个网页资源。Pura X Max 的动画观感待覆盖安装优化版后验证。
- **键盘掉帧排查**。维护者反馈 120 Hz 下点「请输入消息」后输入栏上移和切换设置有顿挫。在 HOP-AL10（HarmonyOS 7.0.0.111，外屏 1264 × 1848、密度 2.75）已装的动效优化版上，用 `hitrace` 录 `graphic ace app nweb animation sched freq` 分类，从欢迎页点输入框和按返回收起键盘。ArkWeb 每次只上报一次视口跳变（`NWebDelegate::ResizeVisibleViewport`），键盘面板动画约 550 ms。弹出时 rAF 回调占 52 ms，收起时占 74 ms，其中各有两次整页强制样式重算。随后 180 ms 补间期间每帧重算 10–28 ms，渲染线程在 1.0–1.58 GHz 的核心上满载，布局只需约 0.5 ms。原因有三：过渡变量和时长写在 body 上，子元素全部继承；`--frame-safe-bottom` 依赖参与过渡的下缘，侧栏、欢迎页、消息编辑和搜索面板逐帧重算；`update()` 写入后又读 `innerHeight`。收起的窄屏抽屉只设 `visibility: hidden`，历史条目仍参与每次整页重算。该包未开启 ArkWeb 远程调试，`web.debug.devtools` 参数在用户版系统上设置失败（1001）。
- **键盘掉帧修复**。`viewport.ts` 先读完视口和窗口尺寸再写样式，body 上的视口变量只在数值变化时写入。键盘过渡改为框架和弹窗遮罩自身的 `top`、`bottom`、`padding-bottom` 过渡，时长写在带 `data-viewport-motion` 的元素上，后续修正仍沿用原结束时间。子元素继承的底部安全区直接取键盘最终位置，过渡期间不变。窄屏抽屉和收起的常驻侧栏在动画结束后加 `data-idle`，以 `content-visibility: hidden` 跳过样式和布局，展开时在同一帧恢复。布局档位改为在 resize、视口宽度或缩放、原生边距变化时计算一次并缓存，`useSyncExternalStore` 读快照时不再强制同步布局。原生 `window-layout` 的边距不变时不再重写。
- **掉帧修复验证**。Chrome 以 460 × 672、6 倍 CPU 降速、30 个会话模拟外屏，键盘弹出期间样式重算的元素由 5774 个降至 110 个，耗时由 73.8 ms 降至 7.3 ms；收起由 5097 个、57.4 ms 降至 107 个、4.7 ms。单次整页重算的元素由 340 个降至 75 个。设置页切换的主线程总耗时与改动前持平，主要是首次挂载和排版；保留已访问页签的尝试收益在噪声范围内，已撤回。`motion-smoke` 新增过渡中途继承变量不变、body 无过渡时长、抽屉收起后停止渲染及展开前恢复的断言，旧实现上该断言失败。11 项鸿蒙回归、类型、Lint、网页版和鸿蒙网页构建、HarmonyOS 26.0.0 SDK Debug 构建通过。未签名调试包核对 1.6.0 / `1000023`、最低 API 12 和 155 个网页资源。真机复测待签名安装后用同样的 `hitrace` 场景对比。
- **展开态欢迎页回跳**。维护者提供的 Pura X Max 内屏录屏为 1920 × 1360，约 57 帧每秒。约 5.17 秒，输入栏上缘从 467 px 跳至 231 px，最远到约 193 px，随后回到 496 px。键盘上缘在同一段仍持续上移。浏览器从 942 × 680 的欢迎页模拟视口上缘偏移从 0 到 130 再到 36 CSS px，原实现的页面上缘在屏幕坐标中依次到 −130 和约 +75 CSS px。固定框架和弹窗遮罩实时补偿 `offsetTop`，键盘过渡只插值实际高度及框架底部留白。宽屏欢迎页的底部留白和输入栏最小高度跟随欢迎区的当前尺寸。专项回归用屏幕坐标检查欢迎页和已有对话的上缘保持对齐、输入栏连续上移及草稿保留。 [CSSOM View 视口坐标](https://drafts.csswg.org/cssom-view/#dom-visualviewport-offsettop) · [Chromium 105 容器尺寸查询](https://developer.chrome.com/blog/new-in-chrome-105/)
- **欢迎页回跳验证**。11 项鸿蒙回归、类型、Lint、格式、两种网页构建及 HarmonyOS 26.0.0 SDK Debug 构建通过。核对未签名调试包的 1.6.0 / `1000023`、最低 API 12 和 155 个网页资源。录屏记录的是修订前的效果，Pura X Max 待签名覆盖安装后按同一路径复测。
- **反复点按回跳（未解决）**。维护者在 Pura X Max 内屏收起侧栏后发现，第一次点按输入框正常，收起键盘再点按时整页上冲后回落，次数越多越明显，展开侧栏时不出现。5 轮 `hitrace` 中原生侧每轮一致（键盘上沿 1011，`ResizeVisibleViewport` 一次，窗口不动），从第二轮起渲染进程在键盘弹出后约 190 ms 内平滑滚动 492–558 物理像素，收起后归零；第二次点按时 `Selection().IsAvailable()=true`，输入框仍保留焦点。Chrome 模拟中输入框祖先和文档根都没有可滚动溢出，未能复现。未提交的两种尝试都无效：`visualViewport` 平移时 `window.scrollTo(0, 0)`，以及软键盘收起时让输入框失焦。滚动节点尚未确认，诊断包的 ArkWeb 远程调试也没有开启成功。详见 [issue #1](https://github.com/APXS114514/DeepSeekGo-Harmony/issues/1)。
- **原生光感**。API 26.0.0 并支持系统材质时，窄屏顶栏在透明的 `Navigation.title` 中为两侧操作按钮应用 `THIN` 材质。识字弹窗使用 `CustomDialogController` 的系统背板和默认 `ULTRA_THICK` 材质，通过 `SymbolGlyph` 绘制相机和图库图标。关闭光感或设备不支持时走普通顶栏及网页菜单，原生弹窗显示失败时也可从网页选择来源。
- **识字弹窗背板修复**。在 HOP-AL10（HarmonyOS 7.0.0.111）已安装的 1.6.0 / `1000023` 上打开「识别图片文字」，深色主题下截图可见相机和图库图标，但弹窗背景透明，文字叠在欢迎页上。原用的 `openCustomDialog(ComponentContent)` 自定义背板不支持系统沉浸材质。改为 `CustomDialogController` 的系统背板，弹窗未显示时回退网页菜单。 [华为光感常见问题](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-faq/)
- **修订包验证**。HarmonyOS 26.0.0 SDK Debug、Release 和 CodeLinter 通过，验签工具确认修订包无签名块。版本代码、权限和 155 个网页资源与原包一致。浏览器覆盖拍照、取消、显示失败后的菜单回退与再次打开选择图库。全套首轮 9 项通过，`adaptation` 的草稿选区断言单独复跑通过。
- **HOP-AL10 设置复测**。原 1.6.0 包上对四个页签、三个二级页及连续点按做了 49 次导航操作，首份控件树均为预期页面。第一组快速截图 16 次中 7 次仍可见旧页签高亮，第二组 12 次截图的页面内容和高亮均已切换。受工具耗时影响，当时无法区分触摸转发与动画。防截屏开启时系统截图遮蔽窗口，复测后恢复原设置。识字弹窗可取消、重新打开并用系统返回关闭，图库和相机均可打开系统选择器。
- **设置页签高亮修复**。在 Chrome 加载原 1.6.0 包的鸿蒙网页资源，复现了 `aria-selected` 与内容面板已经切换、旧页签底色仍在 200 ms 过渡中淡出的情况，切换约 70 ms 后仍能采到旧底色。移除页签底色过渡，选中态使用现有的按下态配色变量，悬停样式限于主指针支持悬停的设备。通用设置二级页继续按「减少动态效果」偏好播放进出动效。`window-sizes` 回归在 360px、768px 和 942px 模拟窗口覆盖深浅主题、从二级页切出、连续点按四个页签、方向键焦点及减少动态效果，并在选中状态提交时检查面板、选中底色和旧底色清除。HOP-AL10 的 ArkWeb 真机复测待签名安装修订版后进行。
- **设置修复验证**。新增首帧断言在修复前捕捉到旧页签底色残留，修复后通过。`pnpm type`、`pnpm lint` 和 `pnpm build:harmony` 通过。`pnpm test:harmony` 首轮通过 9/10 项，`adaptation` 的草稿选区断言失败，单独复跑通过。
- **Release 包验证**。从干净的源码副本通过类型检查、Lint、鸿蒙网页构建和 HarmonyOS 26.0.0 SDK Release 构建，`device-features` 和 `window-sizes` 复跑通过。验签工具确认包内无签名块，核对 1.6.0 / `1000023`、最低 API 12、目标 API 26、权限、分享技能和光感配置。155 个网页资源与构建输出逐字节一致，含设置页签修复、欢迎页 Logo、上游许可证和图像授权声明。启动器两图层为 1024 × 1024，与源码一致。
- **拖拽**。ArkWeb 里的文字和链接填入草稿，图片与文件沿用附件入口。回答工具栏的复制按钮可拖出纯文字，普通点击仍复制原文。原生拖拽读不到文件时的处理需以目标设备上的 ArkWeb 实测为依据。
- **截屏保护**。设置页经受限消息通道调用 `Window.setWindowPrivacyMode`，以原生确认状态更新开关。原生 Preferences 保存设置，创建窗口后在加载网页前恢复。失败会提示重试。
- **折叠屏悬停**。网页让消息和输入分居折痕两侧。键盘或缩放使下方空间不足时恢复普通布局，会话和草稿继续复用。
- 类型、Lint、鸿蒙网页构建、10 项浏览器回归和 HarmonyOS 26.0.0 SDK Debug 编译通过。浏览器覆盖原生识字消息的成功、取消与回退，防截屏的失败重试和重载状态，文本及文件拖入、纯文本拖出，以及悬停切换时的布局和草稿保留。CodeLinter 无错误，有两条建议用 Builder 的组件警告。Debug 包内核对 1.6.0 / `1000023`、最低 API 12、目标 API 26、隐私权限、光感配置及 155 个网页资源。
- 真机待验证：原生菜单显示、返回、光感分层、截屏/录屏/投屏、平板分屏与 2in1 的跨应用拖拽，以及折叠屏全屏悬停和键盘。也需在 API 12 设备上复测普通顶栏和网页识字菜单。

## 前缀缓存实测（2026-11-19）

- 方法：用维护者的 Key 直连 `/anthropic/v1/messages`（非流式，`max_tokens` 32），每组先发 A 预热，等 10 秒再发 B，记录 B 的 `cache_read_input_tokens`。系统提示词约 2,000 Token，首轮提问约 500 Token，每组系统提示词开头加独立编号，组间不互相命中。脚本未入库。
- 对照：A 共 2,677 Token。原样重发命中 2,432，正常第二轮（追加回答和新提问）命中 2,560。命中以 64 Token 为单位，上一次请求末尾约 100–250 Token 不会命中。
- 不影响命中：`tools` 加入或去掉 `deepseek_web_search`、`deepseek_read_url`，首轮带 `title: { enabled: true }`，以及 `latest_reminder`。reminder 不变时与对照相同；跨日在最新提问前追加新的一条时，前面的历史仍命中 2,560，与不带 reminder 的第三轮对照一致，说明服务端保留各条 reminder 的原位置。
- 整段不命中：同一前缀从 Flash 换成 `deepseek-v4-pro`，命中 0；第二轮从关闭深度思考改为开启，命中 0。缓存按模型和思考模式分开。未测：思考强度变化、开启到关闭的反向切换和两种模式各自持续时的命中。
- 对客户端的影响：会话中切换深度思考，或本轮因附件、链接、搜索自动从 Pro 换到 Flash，当轮全部历史按未命中计费；切回后只能命中原模式最后一次请求的前缀。目前没有为此改动行为。

## 1.5.3 长附件修复

- 通过 HarmonyOS 26.0.0 SDK Release 构建，构建日志确认跳过签名。包内 `module.json` 为 `com.pocketchat.deepseek`、`1.5.3` / `1000021`、最低 API 12、目标 API 26、SDK `26.0.0.105`、Release 非调试，权限、分享技能和材质配置与 1.5.2 相同。155 个网页资源与构建产物逐字节一致，含本次修复的提示文案，欢迎页 Logo、图像授权声明一致，启动器图标与 1.5.2 包相同。构建前类型、Lint、鸿蒙网页构建和 10 项回归通过。
- **长附件被以 32,768 Token 拒绝**：服务端对开启了 `title`、`deepseek_read_url` 或 `deepseek_web_search` 的请求，限制最新一条用户消息（文字和附件合计）不超过 32,768 Token，超过时返回 400 `invalid_request_error`，原文为 `user input too long, N tokens exceeds max 32768 tokens (request_id: …)`，早先为 `User input too long. N Tokens, Exceeded max 32768 tokens`。官方文档没有写这条限制。三者都不开启时，同一份 464 KB EPUB（服务端解析为 762,454 字节 Markdown，175,873 输入 Token）可以正常回答。更早轮次的附件不计入这项检查，`system`、`latest_reminder`、`tools: []` 和深度思考都不触发。新会话首条消息会请求标题，阅读链接默认开启且带附件时总会附上该工具，所以长附件在新对话里必然失败。
- 修复：[`store.ts`](../chat-demo-main/src/services/chat/store.ts) 在收到这类 400 且尚未收到内容时，去掉标题，提问不含链接时同时关闭本次的阅读链接（工具和历史网页块一起按关闭处理），重发一次，不占用附件补传的重试次数。会话保持无标题，下一条较短的提问再请求标题。智能搜索开启或提问含链接时仍被拒，回复显示 `replyInputTooLongForTools` 的中文说明，不再显示英文原文。判断函数为 [`errors.ts`](../chat-demo-main/src/services/api/errors.ts) 的 `isUserInputTooLong`。
- 复现与验证：在 HOP-AL10（HarmonyOS 7.0.0.111，已安装 1.5.2 / `1000020`）的新无痕对话上传该 EPUB，开关深度思考、智能搜索和阅读链接都失败，服务端计 175,869 Token；合成 TXT 约 75K Token 失败、约 30K 成功。用测试 Key 直连 Messages API 逐项比对：只加 `title`、只加阅读链接工具或只加搜索工具都返回 400，多文档按合计计算，行内长文字同样受限。修复后在 Chrome 加载鸿蒙网页、接真实 API 复测：首个请求 400，自动重发 200，接着发「谢谢」时生成标题。新增 `input-limit` 回归，类型、Lint、鸿蒙网页构建和 10 项回归通过。同一轮核对真实服务端的 file_id 不存在、file_id 非法、文件无法解析的报错和 `/user/balance` 结构，仍与客户端识别规则一致。
- 真机复测：维护者签名安装 1.5.3 / `1000021` 后，在 HOP-AL10（HarmonyOS 7.0.0.111）的普通新对话中保持阅读链接开启、深度思考开启、智能搜索关闭，上传同一份 464 KB EPUB 并发送，正常回答，未出现英文报错，顶栏仍为「新对话」。接着发「谢谢」后生成标题，但标题来自这句短回复（「不客气」），不反映附件内容。开启智能搜索后发送同一份附件，回复显示 3.2 万 Token 的中文说明；关闭智能搜索后点重新生成，得到正常回答。已有标题且历史含该附件的会话再次附上 EPUB 提问，也正常回答。用户最初报错所在的会话没有找到，未复测。
- 上下文超限实测：约 1.23M Token 的合成 TXT（5.6 MB，`user_data`）不带标题和工具时返回 400，原文为 `This model's maximum context length is 1048576 tokens. However, you requested N tokens (N in the messages, 0 in the completion)…`，能被 `isContextOverflow` 识别。带标题时先触发 32K 检查。真实 API 下的鸿蒙网页先按 32K 回退，重发后显示「本轮请求超出上下文上限」，草稿和附件还原，暂停重复发送。42 页英文 PDF 用 `rich_layout_recognition` 解析为约 52K Token，用 `text_recognition` 约 51K，两者开启标题或阅读链接时都同样受 32K 限制，不开启时正常回答。

## 1.5.4 发布验证

- 类型、Lint 和鸿蒙网页构建通过。浏览器回归首轮通过 9 项，`adaptation` 的草稿选区断言失败后单独复跑通过。
- HarmonyOS 26.0.0 SDK Release 构建通过，验签工具确认 HAP 无签名块。包内确认版本为 1.5.4 / `1000022`、最低 API 12、目标 API 26，并核对权限、分享技能和沉浸光感配置。155 个网页资源与构建产物逐字节一致，含欢迎页 Logo、上游许可证和图像授权声明。启动器两个 1024 × 1024 图层与源资源逐字节一致，冷启动 PNG 保留。真机发送长图、历史补传、启动器裁切和华为上架自检待复测。

## 1.5.4 启动器图标修复

- 华为上架自检在 Mate 60 Pro 和 Mate X6 报告图标缺少分层。解包复现旧版只有一张 512 × 512 的启动器图标。应用和 EntryAbility 改用同一个分层描述文件，前景保留原图的角色和字标，背景为不透明的全画布纯蓝。冷启动继续使用原 PNG。
- HarmonyOS 26.0.0 的资源工具会在传入纹理压缩配置时将图标降到 512 × 512，即使配置关闭了纹理压缩。Entry 的 Hvigor 任务在资源编译前移除这份未启用的配置。两次 Release 构建均通过，包内两个图层都是 1024 × 1024，与源资源逐字节一致。
- 前端类型检查、Lint 和鸿蒙网页构建通过。浏览器回归首轮通过 9 项，`adaptation` 用例的草稿选区断言失败后单独复跑通过。包内核对了应用包名、1.5.3 / `1000021`、最低 API 12、权限及 155 个网页资源，网页资源只有图像授权声明有变化。
- 已签名邀测包为 `harmony/build/outputs/default/Deepseek-GO-1.5.3-layered-icon-signed.app`，HarmonyOS SDK 验签通过，SHA-256 为 `a3cc3d2d7e0aeed041b8824ec90685e38f3b16998989910ee802675b5bb5469a`。同目录的 `Deepseek-GO-1.5.3-appgallery-icon.png` 由两层合成，用于应用市场图标素材。当前无已连接真机，实际启动器裁切和华为上架自检结果待复测。

## 1.5.4 大图附件修复

- 移植 [DeepSeek Chat Demo 0.1.3 的大图修复](https://github.com/deepseek-ai/chat-demo/commit/b53b77f09f4d9d743a3bb6593e61e4716e17c356)。[上传队列](../chat-demo-main/src/services/attachments.ts)在调用 Files API 前将图片长边等比缩至 4096 px 以内，预览和历史仍用原件。超限动图的上传副本只保留一帧。4096 px 是上游为多图请求采用的统一上限。[官方图片尺寸限制](https://api-docs.deepseek.com/zh-cn/guides/vision/#限制)
- [发送前的附件处理](../chat-demo-main/src/services/chat/store.ts)只扫描本次请求会引用的未检查旧图。超限时清掉旧 ID，通过现有流程补传并记下新 ID；读不到原件时沿用旧 ID。历史补传失败时本轮跳过该附件，下轮继续尝试。上下文超限后把旧消息恢复为新对话草稿时会携带检查状态。
- 修复前用鸿蒙网页和模拟 API 复现了 `320 × 9000` PNG 按原尺寸上传、引用时被拒，以及刷新后纯文字追问仍使用旧 ID。修复后 `input-limit` 覆盖纵横缩放、4096 px 边界、保留原件的字节、历史补传失败后重试、缺失原件、刷新后复用新 ID 和带旧图开启新对话。真实 DeepSeek API 和 ArkWeb 真机待验证。

## 1.5.2 页面优化

- 通过 HarmonyOS 26.0.0 SDK Release 构建，确认包未签名，版本为 `1.5.2` / `1000020`，最低 API 12、目标 API 26。核对包内 155 个网页资源、欢迎页 Logo、启动器图标和随包授权声明。
- 「外观」「对话」「语音」进入和返回时以 200ms 淡入页面，标题和入口箭头分别向相反方向轻移。通过类型检查、Lint、鸿蒙网页构建及 9 项回归。在模拟的 360px、768px 和 942px 窗口验证动效期间控件位置稳定、返回栏与列表分开、返回后恢复入口焦点，开启 `prefers-reduced-motion: reduce` 后立即切换。真机观感待签名安装后验证。
- 在 HOP-AL10（HarmonyOS 7.0.0.111）外屏 `1264×1848` 上，从已安装的 1.5.1 的「设置 → 通用设置 → 对话」复现。向下阅读后，返回按钮仍在 `y=662–784`，推理强度标签移到 `y=715–777`，左右也有交集。二级页改为返回栏独占一行，只有下方控件列表可以滚动。模拟 360px、768px 和 942px 窗口验证返回栏不覆盖列表，可以正常切换开关和返回。类型、Lint、鸿蒙网页构建和 9 项回归通过，修订版待签名安装后真机复测。

## 1.5.1 客户端体验优化

- 无痕说明移入消息列表开头，随内容滚动，顶栏仍显示「无痕对话」。在 HOP-AL10（HarmonyOS 7.0.0.111，已安装 1.5.1 / `1000019`）用无痕测试会话复现旧提示固定占位。模拟的 390px 和 942px 窗口验证两种对话的消息视口顶边和高度一致，回到消息列表开头可见说明，向下阅读时说明随消息滚出。修订版尚待签名安装后真机复测。
- 聊天请求省略 `safety_check`，收到 `refusal` 时继续用提示替换本轮正文。后台记忆提炼和整理独立请求 `high`。阅读链接默认开启，可独立于智能搜索关闭。关闭阅读链接时不回传历史网页的签名块，纯文本历史仍随请求发送。 [DeepSeek 模型内容安全](https://api-docs.deepseek.com/zh-cn/guides/safety/)
- 「通用设置 → 对话」保存首选模型、阅读链接、推理强度和输出 Token 上限，回答保存本轮生成选项供续写和附件重试使用。当前请求含附件、启用智能搜索，或需要读新链接或保留历史网页结果时使用 Flash。Pro 首选下的其他纯文本请求使用 Pro。 [Messages API](https://api-docs.deepseek.com/zh-cn/api/create-message/) · [联网工具](https://api-docs.deepseek.com/zh-cn/guides/web_tools/)
- 通用设置首页保留语言和位置信息，其他选项按外观、对话和语音放入二级页。Esc 和系统返回先退出菜单，再返回通用设置，焦点恢复到进入二级页的按钮。
- 对话页的「猜你想问」默认关闭，保存在 `chat-demo:suggested-questions`。开启后在前台当前对话的新回答正常结束时，另用 Flash 读取本轮提问和正文节选，生成最多三个问题。切换会话、分支、发送新消息或关闭开关时取消正在生成的建议。建议只供本地展示，无痕对话中的建议随会话丢弃。点按问题保留已有草稿与附件，将建议填入输入框，用户可编辑后发送。
- 设置二级页和建议问题通过类型检查、Lint、网页构建和 9 项鸿蒙回归。模拟 API 验证开关缺省关闭、开启后重载、重复和异常结果、关闭时取消待处理请求，以及键盘选择建议后只填草稿、手动编辑发送和保留原位续写。模拟设备通道覆盖系统返回，真机设置页和真实建议请求待验证。
- 聊天附件按 Files API 分类校验。采用版面解析的 PDF、Word 和 PPT 上限为 100 MiB，图片 64 MiB，`user_data` 为 32 MiB。 [Files API](https://api-docs.deepseek.com/zh-cn/guides/files_api/)
- 合并导入使用现有 ZIP 暂存和 IndexedDB 事务，保留同 ID 的本地会话，给新会话的附件重新分配本地 ID，校验失败时不会写入正式存储。支持 Web Locks 的浏览器会串行处理跨窗口的归档操作。
- 通过 `pnpm type`、`pnpm lint`、网页版和鸿蒙网页构建及 9 项鸿蒙回归。从页面入口用模拟 API 验证模型和工具搭配、参数持久化、65 MiB PDF 和各类文件超限提示、联网回答跟进、导入失败回滚、重复导入及图片原件隔离。HarmonyOS 26.0.0 SDK Debug 构建通过，核对版本 `1.5.1` / `1000019`、最低 API 12、目标 API 26 及包内 155 个网页资源。HDC 未发现真机，真实 API 和 ArkWeb 实机待验证。

## 1.5.0 对话查找、分享与语音

- 侧栏的历史搜索从 IndexedDB 逐条读取本机历史，优先展示标题命中，再分批返回当前分支的消息片段。搜索最多显示 50 条，关闭或改关键词会取消上一轮。定位消息时更新滚动位置并把焦点交给消息。无痕会话不在历史结果中。
- 「语音输入」保存到 `chat-demo:voice-input-mode`，缺省和旧版升级都使用系统离线识别。DeepSeek API 模式复用网页录制的 16 kHz WAV，经现有 `/v1/tools/asr` 转写。ArkWeb 仅对内置 HTTPS 页面的音频收音处理麦克风权限，首次明确同意并通过系统授权后将页面同意写入原生 Preferences。之后每次录音仍查询当前系统权限，系统已有授权时跳过授权请求，权限撤销或临时授权失效时走系统流程。音频只在内存中暂存，松手确认后才上传，取消和切后台会释放录音并忽略迟到结果。
- 在 HOP-AL10 的旧 1.5.0 包上通过按住说话观察到应用内麦克风确认，旧实现会为每次收音请求重开该弹窗。新增 `microphone-permission.test.mjs` 模拟系统权限和 Preferences，直接覆盖 ArkTS 的首次授权、连续录音、重建页面、拒绝后重试、系统权限撤销及端口重新连接。浏览器语音回归等待虚拟麦克风首帧后再结束录音。ArkTS CodeLinter 和 HarmonyOS 26.0.0 SDK Debug 构建通过，确认最低 API 12。维护者随后确认本轮修订通过其测试。
- 本机朗读复用回答的播放与停止状态，由 `LocalSpeech.ets` 检查系统能力并分段调用 Core Speech Kit。原有 API 音色设置继续生效，本机朗读失败时可重试或手动改用 API 音色。
- 单条回答和当前会话分支均可预览分享正文。文字由 Share Kit 直接分享，Markdown 和 PNG 长图通过受限的二进制帧交给 `ShareOut.ets`，写入沙箱缓存后用文件 URI 打开系统分享面板。长图用 Canvas 排版正文，达到高度上限时提示改用 Markdown。下次分享文件时清理超过 24 小时的缓存。
- 为设置标签、选择器、弹窗和侧栏补齐键盘焦点处理。语音模式下用 Enter 或空格开始、结束录音，Esc 取消。原生顶栏保留本地化无障碍名称，网页图标按钮在强制色彩模式显示焦点轮廓。
- 通过 `pnpm type`、`pnpm lint`、网页版与鸿蒙网页构建、`pnpm test:harmony` 的 8 个脚本、ArkTS CodeLinter 和 HarmonyOS 26.0.0 SDK Debug 构建。确认包名 `com.pocketchat.deepseek`、版本 `1.5.0` / `1000018` 和最低 API 12，包内 155 个网页资源与构建产物逐字节一致。新增浏览器回归使用虚拟麦克风和模拟消息通道，覆盖语音默认值及持久化、API 授权拒绝和重试、上滑取消、键盘操作、本机朗读和停止、三种分享格式与失败重试、标题和正文搜索、消息定位以及强制色彩焦点。
- 已在 HOP-AL10（HarmonyOS 7.0.0.111，API 26）从 1.4.2 覆盖至初版 1.5.0（提交 `849467f`），确认已有历史条目仍可打开侧栏查看、语音输入默认本地且可选 DeepSeek API、可选本机离线朗读，以及历史搜索的空结果。待真机验证 ArkWeb 麦克风授权、离线朗读和系统音频打断、系统分享接收应用能否打开 Markdown 和长图，以及系统屏幕朗读在深浅主题和高对比度下的焦点与播报。API 12 仍需单独实测。

- 多结果以 50 条已保存会话在 942×680 的鸿蒙模拟窗口复现。历史搜索弹窗高度限制为可见空间的 75%，上限 560px，结果列表单独滚动。在 942×680 和 360×320 上验证输入框保持原位、可滚到底并打开最后一项。前端类型、Lint、双平台网页构建、8 项鸿蒙浏览器回归和 SDK Release 构建通过。

### Pura X Max 真机补测

- HOP-AL10，HarmonyOS 7.0.0.111（API 26），已装 1.5.0 / `1000018` 的包管理器更新时间为 2026-11-19 04:50（多次测试包共用版本号，按安装时间区分）。
- 内屏在系统键盘开启时搜索历史对话，命中 50 条，弹窗高 679 个设备像素。滑动结果后出现不同条目，搜索框和结果提示坐标不变。点结果或从侧栏切换到另一会话后键盘保持收起，手动点输入框可唤起键盘。外屏复测另记。
- 选择「本机离线朗读」后用现有回答检查朗读和停止状态，测试后恢复原音色。纯文字、Markdown 和 PNG 长图均打开系统分享面板，后两项显示生成的文件名。仍待用本机接收应用打开分享文件，确认内容可读。
- 「数据管理」加载余额明细，手动刷新后再次显示明细。测试记录不含余额数值和 Key。文件接收与导出保存结果另行核对。

### Pura X Max 内屏布局

- 宽屏会话原本因输入框挂载时自动聚焦而唤起软键盘。鸿蒙会话页改为由用户主动进入输入框。在 942×680 和 360×320 的鸿蒙模拟窗口，从历史搜索和侧栏点按已有会话时均不聚焦输入框，手动点按可输入，返回原会话时草稿保留。Pura X Max 内屏实测见「真机补测」。
- 在 HOP-AL10 的初版 1.5.0 上从设置入口复现，向左滑动使「沉浸光感」等标签和开关整体左移 125 个设备像素。模拟窗口宽度 942px 时，「位置信息」说明的最小内容宽度让通用设置横向多出 48px。修复后说明随可用宽度换行，设置内容只保留纵向滚动，768px 和 942px 上的三个分组均无横向溢出。
- 全屏窗口可用显示器实际挖孔矩形收窄过大的左右避让带，同一角的挖孔转为顶部或底部避让。匹配的重复系统避让带同时收窄。网页在收到原生数据后从原生读取左右避让，避免 ArkWeb 的侧边值重新引入偏移。窗口与显示器尺寸不符时沿用窗口级避让，真正的侧边避让保留。模拟覆盖右上、左下、居中侧边挖孔、系统侧边和分屏回退。浏览器 8 个回归、ArkTS CodeLinter、SDK Debug 和未签名 Release 编译均通过。Pura X Max（HOP-AL10，HarmonyOS 7.0.0.111）覆盖安装修订包后，内屏实际宽度 2584px，收起边栏时欢迎页标题和设置弹窗中心均为 1292px。沿原路径横向滑动后标签和开关坐标不变，纵向仍能滚到语音输入和朗读设置。

## 1.4.2 聊天缩放与按住说话

- 原生层用 ArkWeb 的缩放事件控制原生顶栏。放大时聊天框架跟随视觉视口的位置与大小，正文按可见宽度排版，由网页顶栏接管。顶栏和输入区保持接近原有的屏幕尺寸，窗口安全区按缩放比例换算，软键盘仍按实际遮挡量避让。
- 阅读收起和展开沿用原有滚动逻辑，过渡改为 360ms，遵循减少动态效果偏好。鸿蒙输入区以单行为起点，留白随可见视口高度和窗口宽高比调整，文字与按住说话共享最低高度，长草稿和附件仍可扩展。
- 空白输入框右下角在设备支持时显示语音模式入口。当有文字或附件时，同一位置显示发送。录音底色覆盖输入区上沿和两侧圆角，并渐隐到工具栏。按住后向上划动会出现「松开取消」，划回可继续。离线引擎提前结束时暂存转写，松手后按手势选择写入草稿或丢弃。松手早于授权或引擎就绪时，正常结束会等待启动确认，取消会丢弃该次结果。
- 用浏览器和模拟 ArkWeb 消息通道复现 1.4.1 放大后聊天布局超出可见区域的问题。1.4.2 在 2.7 倍缩放、平移、系统字号放大和模拟键盘弹起时通过布局回归，也验证了缩放区间内打开侧栏和设置、缩回时恢复顶栏和保留草稿。回归覆盖收起和展开的中间帧、阅读位置、减少动态效果、空草稿与附件、触摸按压和取消、延迟启动、麦克风授权拒绝及重试。设置滚动、鸿蒙分享与识字、历史编辑、后台回复、个性化、余额和上下文回归通过。
- 本轮浏览器回归以 `390×844` 视口验证单行输入栏从 76px 增至约 106px，`440×450` 悬浮窗和 `844×390` 横屏约为 88px。验证软键盘弹起时收紧、横屏长草稿内部滚动、窗口尺寸切换保留草稿、浅深色录音底色无侧边留缝，以及触摸上滑、划回、引擎提前结束和启动延迟时取消。放大 2.7 倍后，手势触发距离随缩放比例换算。前端检查、双平台网页构建和 SDK Debug 编译通过。待用真机确认单指上滑和录音背景观感。
- 前端类型、Lint、格式、网页版和鸿蒙网页构建，改动 ArkTS 文件的 codelinter 及 HarmonyOS 26.0.0 SDK Debug 编译通过。核对 Debug 包版本、最低 API 12 和 155 个网页资源。未连接真机，ArkWeb 双指缩放、输入框收起展开的实际观感、首次麦克风授权与离线识别仍待实测。
- 最终输入栏优化的本地测试包通过前端类型、Lint、鸿蒙网页构建和 HarmonyOS 26.0.0 SDK Release 编译。确认未签名，包名为 `com.pocketchat.deepseek`，版本为 `1.4.2` / `1000017`，最低 API 12。包内 155 个网页资源与构建产物逐字节一致，核对了上滑取消、启动器图标、欢迎页 Logo 和授权声明的资源。用户确认该测试包通过，已随 `v1.4.2` 发布。

## 1.4.1 设置滚动与输入框动效

- 支持 CSS 滚动边界的 ArkWeb 使用原生滚动，省去全局非被动触摸监听和每次手势的布局读取。设置分组独立重建滚动容器，避免沿用上一页的偏移。设置弹窗以半透明遮罩代替全屏模糊，国家或地区列表按语言缓存排序。
- 阅读时输入框向下收起，和「显示输入框」交替过渡。收起阶段保留输入框 DOM，防止草稿和附件状态被释放。回到底部的触摸和滚轮手势可恢复输入框，即使收起造成的视口增高已将滚动位置限到底部。键盘、语音、历史编辑和减少动态效果偏好仍受支持。
- 320px 窄窗用模拟鸿蒙通道从设置入口复现，两次滑动的同步样式读取由 63 次降至 0 次。复测分组归零、浅深主题、国家或地区菜单滚动和键盘避让。浏览器录取输入框收起和展开的中间高度，验证触摸和滚轮在底部恢复、键盘焦点、阅读位置、草稿附件、窄宽切换及减少动态效果。阅读、人设、编辑、后台回复、余额和上下文回归通过。
- 前端类型、Lint、网页和鸿蒙资源构建，以及 HarmonyOS 26.0.0 SDK Debug 编译通过。包内核对 1.4.1、版本代码 `1000016`、最低 API 12 和 155 个网页资源。未连接真机，待验证 ArkWeb 的实际滚动帧率和系统键盘下的动效。

## 1.4.0 阅读、人设与 API 使用体验

- 「通用设置 → 阅读时隐藏输入框」保存到 `chat-demo:hide-composer-on-scroll`。向较早消息滚动时达到距离阈值才收起，继续向底部滚动或点「显示输入框」可恢复。输入框留在原位置保留草稿和附件。软键盘开启、消息编辑和语音识别期间暂停自动收起。
- 「个性化 → 人设卡」保存到 `chat-demo:persona-cards`，最多 24 张，每张名称最多 48 字、提示词最多 4000 字。应用内共用当前选中的一张卡，关闭开关时保留列表和选择。启用后在发起请求时把人设追加到系统提示，也适用于无痕对话。历史消息和历史导出不包含人设卡配置。
- 前端类型、Lint、网页版和鸿蒙网页构建，以及 HarmonyOS 26.0.0 SDK Debug 编译通过。Debug 包核对了版本、最低 API 12 和 155 个网页资源。
- 浏览器用模拟 API 和鸿蒙消息通道验证了两项开关的默认状态和持久化、窄宽窗的触摸与滚轮收起、手动及回到底部恢复、键盘焦点及语音识别保护、窗口变化时保留草稿，以及收起恢复后保留附件。人设卡覆盖增改删、选择、删除取消、重载后恢复和开关对实际请求的影响。原有个性化、历史消息编辑、鸿蒙输入与分享、1.3 功能回归通过。调试工具未发现连接的真机，待验证 ArkWeb 的触摸惯性和系统键盘表现。
- 「数据管理」打开时查询官方 `GET /user/balance`，可手动刷新。余额缓存只在本次打开的设置页内保留，按 API Key 隔离。刷新失败时标注上次结果。峰谷时段在设备上按北京时间计算，覆盖 2026 和 2027 年的法定放假日历。进入尚未覆盖的年份时，可能受假期影响的工作日时段显示「待更新」。 [余额接口](https://api-docs.deepseek.com/zh-cn/api/get-user-balance/) · [峰谷定价](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) · [2026 放假通知](https://www.gov.cn/gongbao/2025/issue_12406/material/gwygb202532.pdf) · [2027 放假通知](https://big5.www.gov.cn/gate/big5/www.gov.cn/zhengce/content/202611/content_7085101.htm)
- 上下文预警以实际进入请求的会话分支为基础，结合服务端首段输入用量、草稿、可估算的附件和输出预留。估计占用满 90% 时提示，展开详情可看上一轮实际输入与缓存命中。未解析文档的占用以服务端为准。服务端明确拒绝上下文超限时保留原消息和本地原件，在没有其他草稿时还原原始输入，暂停重复发送相同内容和生成选项。变更消息、附件或思考/搜索选项后可重试。携带草稿开启新对话时复用已上传的附件，新对话页已有的草稿继续保留。 [模型上下文长度](https://api-docs.deepseek.com/api/list-models/) · [Token 用量计算](https://api-docs.deepseek.com/zh-cn/quick_start/token_usage/)
- 余额和上下文改动通过前端类型、Lint、网页版及鸿蒙资源构建，以及 SDK 26.0.0 Debug 编译。复核包内 1.4.0、版本代码 `1000015`、最低 API 12 与 155 个网页资源。浏览器模拟覆盖 CNY/USD、余额刷新失败与恢复、2027 年春节与计费切换、上下文用量提示、HTTP 与流式超限、重载后恢复本地附件及新对话草稿冲突。复跑阅读、人设卡、消息编辑、后台回复、鸿蒙功能和 1.3 回归通过。尚无连接的真机，余额请求和超限恢复待在 ArkWeb 实机验证。

## 1.3.3 后台回复与通知修复

- `EntryAbility` 负责前后台状态和短时任务。网页从生成状态订阅直接同步原生，原生在前台开始生成时申请任务，进入 `onBackground` 时可补申请。后台配额到期按系统要求取消任务。
- 网页进入后台时把当前进度写入会话，后台收到的增量在回到前台或结束时合并。隐藏状态下先等待最终保存，再发完成事件并同步生成结束。原生等通知发布结束再释放任务，应用已回到前台时跳过尚未发布的通知。
- 网页发送前按原生显示上限裁剪标题和摘要，避免长回答触发消息端口的 8192 字符限制。通知使用 `SERVICE_INFORMATION` 通道和按会话区分的 WantAgent。切回页面时通过 ArkWeb `onActive` 恢复显示。重新开启通知且已申请过授权时，支持的 API 26 设备打开系统通知设置。
- 浏览器从聊天入口复现旧版后台逐段刷新，并验证新版回前台合并增量、超过 9000 字的回答仍发送完成事件、完成事件先于结束状态、重载后可打开已保存的回复，以及通知授权重试。原生服务的模拟检查覆盖延迟释放、配额到期、会话跳转参数及前台忽略迟到通知。
- 前端类型、Lint、格式、网页版和鸿蒙资源构建，以及 ArkTS `codelinter` 和 SDK 26.0.0 Debug 编译通过。Debug 包核对版本、最低 API 12 和 155 个网页资源。未连接真机，待实测退到后台和锁屏后通知是否送达、点击通知是否进入对话，以及回前台的实际刷新耗时。后台完成通知和点击回到对话已在 1.4.2 真机确认，见「验证与后续」的真机验收。

## 1.3.2 沉浸光感优化适配鸿蒙特性

- **图片识字菜单**。`DeviceBridge` 在 API 26.0.0 及以上按需加载 `ScanSourceMenu.ets`，按系统材质和识字能力上报 `immersiveScanMenu`。开关开启时网页通过 `scan-source` 请求选择图片来源，再沿用 `scan` 打开相机或图库。取消后回到输入区，系统不支持或菜单打开失败时用现有网页菜单。
- **原生菜单配色**。`window-ui` 上报实际生效的 `dark` 和应用的 `themePreference`。`Index.ets` 在 API 26 及以上通过 `UIAbilityContext.setColorMode` 设置当前界面的原生深浅色，选择「跟随系统」时传 `COLOR_MODE_NOT_SET` 解除覆盖。
- **聊天输入区**。降低背景模糊半径、提高底色不透明度，仍沿用主题色。`data-soft-keyboard` 生效期间暂停模糊，保留底色和高光，收起后恢复。ArkWeb 不支持背景模糊、光感关闭，或浏览器报告减少透明度、高对比度或强制颜色时，使用普通背景。
- **普通菜单键盘操作**。网页菜单打开时焦点进入菜单项，支持方向键循环、Home/End、Enter/空格和 Esc。Esc 或系统返回恢复触发按钮焦点，Tab 按页面原顺序继续。会话条目的更多按钮可在 2in1 上用 Tab 聚焦，右键仍能打开同一个菜单。
- **验证**。通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony`、改动前端文件的 `oxfmt`、改动 ArkTS 文件的 `codelinter` 和 HarmonyOS 26.0.0 SDK Debug 编译。核对 Debug 包的版本、包名、最低 API 12 和 155 个网页资源。浏览器专项回归用模拟消息通道验证识字来源选择、取消、失败回退与重试、旧端口兼容、光感开关持久化、深浅和高对比度主题，以及 320px 窄窗的键盘视口。1.3.1 的鸿蒙功能、1.3、配色设置和动效回归通过。
- **补充回归**。浏览器从识字按钮和 2in1 会话条目验证菜单焦点、方向键、确认、Esc 和返回恢复焦点、Tab 退出及右键打开。用 320px 窄窗的多行草稿验证键盘弹起时暂停模糊、失焦后等待键盘收起再恢复。模拟端口核对浅色、深色和跟随系统的偏好上报、系统深浅切换及重启读取。前端检查、网页版构建、ArkTS 检查和 Debug 编译均复跑通过，原有鸿蒙功能、设置、侧栏和动效回归通过。
- **真机待验证**。原生菜单在系统和应用深浅色相反、切回跟随系统、键盘弹起、分屏和悬浮窗中的观感与交互，包括系统返回手势关闭菜单和从菜单切换到相机或图库。另需在 API 12 真机上确认启动和普通网页菜单。

## 鸿蒙独有功能（1.1.0）

原生层集中在 `harmony/entry/src/main/ets/services/`，经原有的 ArkWeb 消息端口与网页通信，网页侧入口是 [`services/harmony.ts`](../chat-demo-main/src/services/harmony.ts)。状态码统一见 `DeviceStatus.ets`：0 成功、1 用户取消、2 权限被拒、3 设备不支持、4 文件过大、-1 通用失败，其余正数为系统错误码原样透传。

| 功能 | 原生 | 网页 | 说明 |
| --- | --- | --- | --- |
| 能力上报 | `DeviceBridge.features()` | `useDeviceFeatures` | 端口连上后发送 `device-features`。语音和识字按 `canIUse` 的系统能力决定是否显示按钮。 |
| 语音输入 | `VoiceInput.ets`（Core Speech Kit `speechRecognizer`，离线、`zh-CN`、短语音模式） | `useDeviceVoiceInput.ts` | 引擎自己收音，`vadEnd` 3 秒静音自动结束，单次最长 60 秒。`MICROPHONE` 权限首次弹窗；用户曾拒绝时改用 `requestPermissionOnSetting`。页面隐藏或端口重连时中断并通知网页回到空闲。识别结果按「已确认段 + 实时段」合并，兼容整句累计和逐段两种返回方式。 |
| 识别图片文字 | `TextScanner.ets`（`cameraPicker` / `PhotoViewPicker` + Core Vision Kit `textRecognition`） | `ScanTextButton.tsx` | 系统 Picker 不需要相机和相册权限。解码时长边缩到 4096 以内并开启方向检测。结果插入光标处，不需要 API Key。 |
| 接收分享 | `module.json5` 的 `ohos.want.action.sendData` 技能 + `ShareInbox.ets`（Share Kit `systemShare.getSharedData`） | `app/receiveShare.ts` | `onCreate` 和 `onNewWant` 都会接收。冷启动时先排队，端口连上后发送；网页读出 Key 后才处理，避免误开设置页。文字和链接写入新对话草稿，文件以 Base64 传入后按附件上传。单文件 20 MB、整批 40 MB、最多 9 项，超出部分计数提示。 |
| 导出记录 | `FileSaver.ets`（`DocumentViewPicker.save`） | 设置页 `ExportHistory` | 网页把 ZIP 以二进制帧发给原生：4 字节小端头长度 + JSON 头 + 内容，上限 512 MB，避免 Base64 膨胀。 |

麦克风权限的用途说明在 `entry/src/main/resources/base/element/string.json`。分享目标声明了 `general.text`、`general.hyperlink`、`general.image`、`com.adobe.pdf` 和 `general.composite-object`（Office 文档）。

## 个性化与记忆（1.2.0）

纯前端功能，网页版和鸿蒙版共用，不涉及原生层。

- **存储**：[`services/personalization.ts`](../chat-demo-main/src/services/personalization.ts) 是 zustand 状态，写入 localStorage 的 `chat-demo:custom-instructions`（`aboutUser`、`responseStyle`、`enabled`）和 `chat-demo:memory`（`enabled`、`auto`、`items`）。指令每项上限 1500 字，记忆每条 200 字、最多 100 条，读入时会清洗无效条目。不进入 IndexedDB，「删除所有对话」和历史导入导出都不影响它们。
- **注入**：`streamReply` 每次请求时调用 `buildSystemPrompt(CHAT_SYSTEM_PROMPT)`，在基础身份后追加「用户提供的背景信息」「用户希望的回复方式」、人设卡和「关于用户的记忆」，标题随界面语言。指令和人设卡使用发送当时的最新内容。记忆在会话首次请求时存为 `Session.memorySnapshot`（id 与文字），之后的轮次、续写和重新生成都按快照文字注入，只去掉已从记忆列表删除的条目；会话中途新增或改写的记忆从下一个对话起使用。这样自动提炼不会在每轮改动系统提示词开头，避免同一会话的历史整段失去 DeepSeek 前缀缓存。1.5.3 之前的旧会话在下次请求时补记快照，历史导出不含快照。输入框的上下文估算使用同一份快照。`personalization` 回归检查同一会话第二轮的系统提示词与首轮相同、删除的记忆在下一轮停用、新对话带上改写后的记忆；类型、Lint、鸿蒙网页构建和 10 项回归通过，未在真机验证。
- **自动提炼**：[`services/memory.ts`](../chat-demo-main/src/services/memory.ts) 在回复状态为 `done` 且未在导入历史时，把已有记忆（带序号）、本轮用户消息（前 4000 字）和回答节选（前 1500 字）发给 `deepseek-flash`，不开思考和工具，要求返回 `{"add","update","remove"}` JSON，序号对应请求时的快照。每轮最多新增 3 条，少于 4 个字的消息不触发。疑似密钥、密码、证件号或银行卡号的条目在本地过滤，这条规则偏保守，可能误挡含「密码」等字样的正常信息。失败或返回无效内容时静默放弃，有变化时提示「已更新记忆」。
- **整理**：同一模型返回 `{"memories":[…]}` 后整体替换，按文本保留原条目的 id 和来源。设置页保留整理前的列表，可撤销，离开设置页后撤销入口消失。提炼和整理共用一个 Promise 队列，不会并发改写列表。
- **界面**：[`PersonalizationSettings.tsx`](../chat-demo-main/src/components/settings/PersonalizationSettings.tsx)，设置新增 `personal` 分组。指令改动后需点「保存」。记忆列表最新的在上面，编辑框按 Esc 取消且不会关闭设置。清空需二次确认。
- **对旧回归的影响**：自动记忆默认开启，每轮回答后多一次 `/anthropic/v1/messages` 请求。按请求次数断言的旧脚本（motion、edit、brand-sider）需要先在 localStorage 里关掉自动记忆，见下方验证记录。

## 1.2.1 宽屏修复

- **未居中**：用户在 1.0.6 平板横屏截图中，欢迎页和输入框左边距 240、右边距 357 设备像素，状态栏图标也在右侧约 110 像素处截止。浏览器用右侧 58vp 的 inset 复现出同样的比例，推断是位于右上角的摄像头挖孔被 `TYPE_CUTOUT.rightRect` 上报，原 `includeAvoidArea` 把它当成整条右边距。[`WindowInsets.ets`](../harmony/entry/src/main/ets/window/WindowInsets.ets) 现在把完全落在窗口顶部或底部 25% 以内的左右避让区改算为上下避让；跨过中段的侧边刘海仍按左右处理。每次计算会在 hilog 输出 `Window WxH avoid system=… nav=… cutout=… -> {insets}`，真机排查时用 `hdc hilog | grep PocketChat` 查看原始矩形。
- **侧栏上下断开**：常驻侧栏原本在 `.frame` 的上下安全区 padding 以内，状态栏和手势区露出主背景色。[`Sider.module.css`](../chat-demo-main/src/components/sider/Sider.module.css) 在鸿蒙下给 `.docked` 加负的上下外边距，`.sider` 用同样的 padding 避开系统栏，底色和分隔线贯穿全高。窄屏抽屉原本就是全高，未改动。

## 1.3.0 无痕对话与鸿蒙适配

- **顶栏切换不跳动**：窄屏顶栏平时由原生 `ChatHeader.ets` 绘制，打开抽屉或弹层时切换为网页的 `MobileHeader`。鸿蒙版网页顶栏现在与原生逐项一致：44 按钮、间距 8、标题 15px Medium、三条等长横线和方框铅笔图标（`IconMenuLines22`、`IconSquarePencil22`）。原生图标固定为 `22vp`，标题用 fp，网页标题按 `--app-font-scale` 同步缩放。
- **跟随系统深色**：ArkWeb 默认 `WebDarkMode.Off`，网页的 `prefers-color-scheme` 永远是浅色。`Index.ets` 改为 `.darkMode(WebDarkMode.Auto).forceDarkAccess(false)`，配色仍由网页自己的深色主题负责。另外新增 `resources/dark/element/color.json`，启动页背景在深色下使用 `#161C19`。
- **键盘弹起时顶部重叠**：`.frame` 和弹层跟随视觉视口定位，在屏幕上的上沿始终位于状态栏下方，所以顶部安全区不再扣减 `visualViewport.offsetTop`（`App.module.css` 的 `--frame-safe-top` 和 `Modal.module.css`）。旧回归脚本里「31 − 12 = 19px」的断言已改为 31px。
- **返回手势**：[`services/backStack.ts`](../chat-demo-main/src/services/backStack.ts) 维护「返回即关闭」的层，Modal、Menu、Select、搜索面板、窄屏抽屉、消息编辑、会话重命名、记忆编辑和语音收音都会登记。网页通过 window-ui 的 `canGoBack` 告诉原生；`Index.ets` 的 `onBackPress` 在有可关闭的层时发送 `window-action: back`，由网页关闭最上面一层；没有可关闭的层时交给系统处理。
- **系统字体大小**：`AppScope/resources/base/profile/configuration.json` 声明 `fontSizeScale: followSystem` 和 `fontSizeMaxScale: 1.75`。`EntryAbility` 把 `config.fontSizeScale` 写入 AppStorage（`window/FontScale.ets`），`Index` 监听后发送 `font-scale`，取值限制在 0.8–1.75。网页在 `harmony.css` 中按 `--app-font-scale` 缩放 Markdown 字体变量、用户气泡、编辑框和输入框；按钮和间距不变。
- **2in1 键鼠**：[`app/shortcuts.ts`](../chat-demo-main/src/app/shortcuts.ts) 提供 `Ctrl+N`（新对话）、`Ctrl+B`（窄屏开关抽屉，宽屏收起或展开侧栏）、`Ctrl+,`（设置）。原生能力上报新增 `deviceType`，只有 2in1 在按钮提示里附带快捷键。鼠标右键会话条目会打开同一个菜单（`Menu` 新增 `controlRef`），触屏长按不受影响。
- **分屏与悬浮窗**：在浏览器中按 320×568、360×420、400×800、700×500、480×320 检查欢迎页和对话页，没有控件越界或横向滚动。脚本是 `Game-Miscellaneous/_verify-deepseek-go-1.3/windows.mjs`。
- **无痕对话**：会话带 `ephemeral: true`，只存在于 `sessionCache`，不进入 `sessions` 列表和导出，`persist` 直接跳过。附件原件通过 `db.keepFilesInMemory` 放在内存里，`loadFile` 优先读取内存。系统提示词保留自定义指令，但不附带记忆，也不触发记忆提炼。`newChat`、`selectSession` 离开时会调用 `discardEphemeral` 停止生成、移出缓存、释放附件和草稿；打开已保存的对话即退出无痕模式。入口在欢迎页问候语下方，会话页顶部有说明条，原生顶栏标题显示「无痕对话」。
- **后台生成与完成通知**：网页通过 window-ui 的 `generating` 告诉原生是否有回答在生成。[`BackgroundReply.ets`](../harmony/entry/src/main/ets/services/BackgroundReply.ets) 在 `onPageHide` 时若仍在生成，就申请短时任务 `requestSuspendDelay`；生成结束、回到前台或到期回调时取消。每条回答完成后网页发送 `reply-done`（会话 id、标题、去掉 Markdown 的摘要；无痕对话只发「回答已生成完成」），原生只在后台时发布通知，WantAgent 带 `pocketChatSessionId`。点击通知后 `EntryAbility.onNewWant` 写入 AppStorage，网页收到 `open-session` 后等会话列表加载再打开。回到前台时清除通知。首次开始生成时请求一次通知授权；设置 → 通用设置 → 回答完成通知（默认开启）在打开时会再次请求，被拒绝时给出提示。

## 1.3.1 配色与设置

- **默认主题色**：`settings.ts` 的 `DEFAULT_ACCENT = '#66ccff'`。`theme.ts` 的 `syncAccent` 始终设置 `data-custom-accent`，没有保存过主题色时使用默认值，因此所有强调色都走 `harmony.css` 中由 `--user-accent` 派生的规则。预设依次为默认天蓝、松绿 `#24634d`、海蓝、莓紫、珊瑚红、岩灰。点「默认天蓝」会清空已保存的主题色。
- **背景跟随主题色**：`harmony.css` 在 `[data-custom-accent]` 下用 `color-mix` 派生中性色。浅色背景是主题色 3% 混入 `#fafafa`，深色背景是主题色 5% 混入 `#141414`，深色正文色是主题色 4% 混入 `#f2f2f2`。深色输入区的色调、高光和描边也改为从主题色派生，旧的偏绿 rgba 值不再生效。原生侧的 ArkWeb 底色、启动页背景、顶栏和系统栏文字改为中性的 `#FAFAFA`、`#151515`、`#1A1A1A`、`#F2F2F2`。
- **位置信息**：不再按浏览器语言区分。设置里先选国家或地区（第一项是「不设置」），只有选中国时才出现省、市两级；`initialLocation` 直接读取保存值并校验。说明文案写明：它随消息作为最新信息的一部分发给模型，用于天气、出行和本地问题，只发送地名，不使用定位。
- **设置分隔**：沉浸光感和回答完成通知两个开关行加上 `styles.cell`，与其他设置项使用相同的 12px 上下内边距和分隔线。
- **界面文案**：按审阅稿逐条核对 247 组中英文文案，实际更新中文 41 条、英文 47 条，并更新 ArkWeb 资源加载失败提示。新版回归脚本位于 DSH 工作区的 `Game-Miscellaneous/_verify-deepseek-go-1.3.1/`，配色断言使用「默认天蓝」。README 截图已用新配色重新生成，截图脚本的按钮文案已同步为「新对话」。

## 1.0.x 的界面改动

- **顶栏**。上一版的蓝圈来自原生按钮使用系统材质时采用的默认填充色。1.0.5 的 `ChatHeader.ets` 使用透明底的 ArkUI 文本样式按钮。
- **Logo 与启动器图标**。鸿蒙欢迎页引用 [`assets/images/logo.png`](../assets/images/logo.png)。Rspack 将 PNG 输出到 `static/media/`，`Index.ets` 按 `image/png` 提供资源。启动器图标源文件是 [`assets/images/app-icon.png`](../assets/images/app-icon.png)，鸿蒙资源副本放在 `harmony/AppScope/resources/base/media/app_icon.png`。
- **键盘与欢迎页**。`Index.ets` 为 ArkWeb 设置 `WebKeyboardAvoidMode.RESIZE_VISUAL`。网页的 [`viewport.ts`](../chat-demo-main/src/app/viewport.ts) 读取 `visualViewport`，收到逐帧高度时跟随系统，遇到大幅跳变时平滑补间。失焦后继续用实际可视高度，直到键盘收起。欢迎页用 `object-fit: contain` 随可用空间等比显示完整 Logo。 [华为 ArkWeb 键盘避让文档](https://developer.huawei.com/consumer/en/doc/harmonyos-references/arkts-basic-components-web-attributes/)
- **侧栏动效**。窄屏使用滑动抽屉。中等和宽窗口使用 `DockedSider`，侧栏滑动的同时，聊天区随侧栏占用宽度变化。收起状态沿用现有设置，并响应系统的减少动态效果偏好。
- **其他过渡**。设置和搜索面板进出有过渡，退出期间保留原生顶栏的遮挡状态。欢迎页进入会话、编辑消息、恢复主输入栏和手动展开思考正文时轻量淡入。正文开始时，自动思考预览平滑收起。新增过渡遵循减少动态效果偏好。
- **消息编辑**。编辑历史消息时暂时隐藏主输入栏，编辑重发生成新版本，原消息和主输入栏草稿仍可找回。

## 验证与后续

- **浏览器回归**：脚本在 [`chat-demo-main/tests/harmony/`](../chat-demo-main/tests/harmony/)，在 `chat-demo-main/` 运行 `pnpm test:harmony`。它先执行 `pnpm build:harmony`，再由 `run.mjs` 依次运行全部 `*.test.mjs` 并汇总结果；`node tests/harmony/run.mjs personalization` 只运行文件名包含该片段的脚本，设置 `SHOTS_DIR` 可保存脚本截图。脚本加载鸿蒙网页资源，用模拟的 DeepSeek 接口（含 `/user/balance`）和 ArkWeb 消息通道，不需要真实 Key。依赖开发依赖 `playwright-core@1.62.1`（不下载浏览器），默认用 `channel: 'chrome'` 启动本机 Google Chrome，可用 `CHROME_PATH` 改为其他 Chromium 内核浏览器。仓库路径由 `support.mjs` 根据脚本位置推算，不依赖本机目录。
  - `device-features`：分享冷启动与运行中接收、按住说话（实时文字、引擎先结束时等松手提交、松手后等最终结果、上滑取消、系统中断、权限拒绝、识别出错、没识别到内容、切回键盘）、拍照与图库识字、导出保存，以及设备不支持时隐藏入口。
  - `personalization`：自定义指令、记忆的自动提炼、整理、撤销、编辑和清空。
  - `adaptation`：顶栏对齐、返回手势分层、字体缩放、键盘偏移时的安全区、无痕对话、后台完成通知、2in1 快捷键与右键菜单、按住说话时返回只取消收音。
  - `appearance-settings`：默认主题色、深浅色背景跟随主题色、开关分隔和位置信息。
  - `window-sizes`：五种悬浮窗和分屏尺寸下没有越界或横向滚动，另覆盖折叠屏宽度下的设置二级页动效、页签快速切换和选中状态。
  - `input-limit`：32,768 Token 限制下的回退、提示和后续标题，以及大图上传、历史补传、草稿迁移和原件保留。
  - `motion-smoke`、`brand-sider-smoke`、`edit-regression`：1.0.x 起的键盘、动效、侧栏、Logo、Key 保存与消息编辑回归。
  - `readme-shots.mjs` 不是测试，运行 `pnpm screenshots` 会把 README 截图写到 `assets/images/screenshots/`，也可以传入其他输出目录。
- **真机验收**：用户在 1.4.2 真机上确认以下功能正常：离线语音识别与首次麦克风授权、拍照和图库识字、各层的侧滑返回、「跟随系统」深浅色、系统字体缩放，以及后台继续生成后的完成通知和点击回到对话。设备型号和系统版本未记录。下文各版「尚未真机验证」中的这些项已关闭，其余仍待验证：
  - 系统分享面板是否列出 Deepseek GO 及各类文件能否读取，导出到文件管理器。
  - 平板和折叠屏：横屏挖孔避让是否左右对称，键盘弹起时左上角是否与状态栏重叠，折叠屏展开态侧栏。
  - 2in1：相机和语音的可用性，快捷键是否与系统冲突。
  - 1.3.2 原生识字菜单在深浅色相反、键盘弹起、分屏和悬浮窗中的表现，以及 API 12 真机的启动和网页菜单。
  - 1.4.x：ArkWeb 双指缩放、输入栏收起展开和滚动帧率、按住说话的单指上滑取消手感，余额请求与上下文超限恢复。
  - 覆盖安装后 localStorage 中的会话、记忆和设置是否保留。
- 1.4.2 起回归脚本从维护者本机的 `Game-Miscellaneous/` 移入仓库，并按 1.4.x 的行为更新：补上余额接口的模拟，语音改为按住说话，不支持语音时空输入框不显示发送键。下文较早的记录里提到的 `Game-Miscellaneous/` 路径只作历史参考。`device-features` 清空输入框前等待 100ms，避开语音写入后移动光标的那一帧打断全选。
- 前端已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 `pnpm build`。这些命令在 `chat-demo-main/` 下执行，`pnpm build:harmony` 生成 ArkWeb 网页资源。
- 1.0.6 浏览器模拟已验证键盘开合与失焦、Logo 完整显示、首条消息、设置和搜索面板、小窗抽屉和宽窗侧栏、减少动态效果、草稿保留、思考折叠与历史消息编辑。
- 检查原生代码时用 HarmonyOS 26.0.0 SDK 自带的 `codelinter`，例如在 `harmony/` 下运行 `codelinter -p default -e error entry/src/main/ets/pages/Index.ets`。1.0.6 的键盘配置已通过该检查。真机待验证项包括系统键盘与页面动效同步、横屏和分屏下的可用高度、启动器图标、折叠屏展开态侧栏及深浅主题下的顶栏反馈。
- 回归会话和设置时，从应用入口使用测试 Key、模拟 ArkWeb 消息通道和 API 回包。检查切换会话或折叠展开后草稿仍在，编辑重发后能切回原版本，以及 Key 校验成功但设备保存失败时能正确提示并重试。真机验收记录设备、系统版本和实际安装的包版本。
- 收到生成 HAP Release 的请求后，从 `harmony/AppScope/app.json5` 读取当前版本。先构建 ArkWeb 资源，再在 `harmony/` 下用 HarmonyOS 26.0.0 SDK 执行 `hvigorw assembleHap --mode module -p product=default -p module=entry@default -p buildMode=release --no-daemon`。核对构建日志的未签名状态及包内 `module.json` 的版本、包名和最低 API。比对图标、Logo、图像授权声明和打包的网页资源，最后复制到 `HAPS/` 并记录 SHA-256。
- 1.3.0 已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony`、改动文件的 `oxfmt`、改动的 ArkTS 文件通过 codelinter（无错误）和 ArkTS Release 编译；包内含 `configuration` 配置。回归脚本 `Game-Miscellaneous/_verify-deepseek-go-1.3/batch-1.3.mjs` 覆盖顶栏对齐、返回手势分层、字体缩放、键盘偏移时的安全区、无痕对话的创建与丢弃以及不发记忆、生成状态与完成通知内容、通知开关和授权拒绝、点击通知打开会话、2in1 快捷键提示与右键菜单。1.1、1.2 功能回归仍通过，motion、edit、brand-sider 用 `*.v13.mjs`（关闭自动记忆、键盘安全区改为 31px）通过。
- 1.3.0 尚未真机验证（侧滑返回、跟随系统、字体缩放、后台回复与通知已在 1.4.2 真机确认，见上文真机验收）：侧滑返回在各层的实际表现、ArkWeb `darkMode(Auto)` 是否让「跟随系统」生效、系统字体缩放和原生 fp 标题的一致性、平板键盘弹起时左上角是否仍与状态栏重叠、短时任务能否让 ArkWeb 在后台继续接收流式回复、通知授权弹窗与点击回到对话、2in1 快捷键是否与系统冲突。
- 1.3.1 文案同步后通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 `Index.ets` 的 codelinter（无错误）。在 `Game-Miscellaneous/_verify-deepseek-go-1.3.1/` 下复跑 8 个浏览器脚本，全部通过。`batch-1.3.1.mjs` 覆盖默认主题色、深浅色背景和莓紫配色、开关行分隔、国家及省市选择和地名随消息发送。其余脚本覆盖 1.3、个性化、系统分享和语音、消息编辑、动效、侧栏及多种窗口尺寸。`harmony-features.mjs` 在清空语音输入前等待 100 ms，避开下一帧移动光标对全选的干扰。
- 1.3.1 Release HAP 重新生成网页资源并通过干净的 ArkTS Release 编译，构建日志确认未签名。包内 `module.json` 显示 `com.pocketchat.deepseek`、`1.3.1`/`1000011`、最低 API 12、目标 API 26、SDK `26.0.0.105`、Release 非调试，并包含麦克风权限、系统分享技能和字体配置。包内 154 个网页文件与构建产物逐字节一致，欢迎页 Logo 与源码一致，启动器图标与 1.3.0 一致，编译后的 ArkTS 包含更新的资源加载失败提示。SHA-256 为 `0b0d8565d92cac173affa957f343aec7bef8ebc53484357824d25e9d10a69abb`。尚未在真机签名安装，待验证深色模式观感及启动页到网页首帧的颜色衔接。
- 1.3.0 Release HAP 已清空并重新生成网页资源，通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和干净的 ArkTS Release 编译，构建日志确认未签名。包内 `module.json` 显示 `com.pocketchat.deepseek`、`1.3.0`/`1000010`、最低 API 12、目标 API 26、SDK `26.0.0.105`、Release 非调试，并包含 `MICROPHONE` 权限、`sendData` 分享技能和 `$profile:configuration`。Logo 和网页资源与源码逐字节一致，启动器图标与 1.2.1 包中的相同。SHA-256 为 `b95abb662744ed5f2c1bd39759b11b93b5b13309d7979dd689a907c54fe2bcdb`，尚未在真机签名安装。
- 1.2.1 Release HAP 已重新构建网页资源，并通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 ArkTS Release 编译；构建日志确认未签名。包内 `module.json` 显示 `com.pocketchat.deepseek`、`1.2.1`/`1000009`、最低 API 12、目标 API 26、SDK `26.0.0.105`、Release 非调试，并包含 `MICROPHONE` 权限和 `sendData` 分享技能。Logo 和网页资源与源码逐字节一致。启动器图标被工具链从 1254px 缩为 512px，与已交付的 1.0.6 包中的图标逐字节相同。SHA-256 为 `33c29276c99819017ee620d9f5b99185e7ec6691635c3342f81b05e68be5c982`，尚未在真机签名安装。
- 1.2.1 已通过 `pnpm lint`、`pnpm build:harmony`、`WindowInsets.ets` 的 codelinter 和 ArkTS 编译。浏览器探针确认侧栏覆盖整个窗口高度，内容位置不变；1.1、1.2 功能回归以及关闭自动记忆后的 motion、edit、brand-sider 回归都通过。挖孔改算上下避让的逻辑只能在真机验证：需要确认平板横屏时左右对称，挖孔不遮挡内容，以及顶部 inset 是否因此变大。
- 1.2.0 已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 ArkTS 编译，原生代码未改动。浏览器回归脚本是 DSH 工作区的 `Game-Miscellaneous/_verify-deepseek-go-1.2/personalization.mjs`，在本仓库根目录用 Node 运行。它覆盖指令保存与注入、手动添加与去重、自动提炼的新增、更新和删除、敏感信息过滤、无效返回和短消息不触发、编辑与 Esc 取消、整理、撤销和整理失败、删除、开关关闭后不注入也不提炼、刷新后保留、清空确认。1.1.0 的 harmony-features 回归仍通过；motion、edit、brand-sider 在关闭自动记忆后通过。真机待验证 ArkWeb 的 localStorage 在覆盖安装后是否保留，以及长指令和长记忆列表在小屏设置页的滚动。暂未打包 1.2.0 HAP。
- 1.1.0 已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony`、`codelinter` 和 ArkTS 编译，包内 `module.json` 含 `MICROPHONE` 权限和分享技能。浏览器回归脚本在 DSH 工作区的 `Game-Miscellaneous/_verify-deepseek-go-1.1/harmony-features.mjs`，在本仓库根目录用 Node 运行。它用模拟端口覆盖冷启动和运行中分享、语音实时文字与自动结束、手动结束与取消、权限拒绝和识别失败、拍照与图库识字及取消、导出保存与失败，以及设备不支持时隐藏入口。1.0.6 的 motion、edit、brand-sider 回归仍通过。
- 1.1.0 尚未真机验证（离线语音和识字已在 1.4.2 真机确认，见上文真机验收）：系统分享面板是否列出 Deepseek GO 及各类文件能否读取、离线语音模型在目标设备上是否可用和首次授权流程、相机 Picker 返回的 URI 可读性和识字效果、文件管理器保存，以及 2in1 上相机和语音的可用性。暂未打包 1.1.0 HAP。
- 1.0.6 Release 已通过前端检查、ArkTS 编译和上述包内检查，SHA-256 为 `209246dd381e8b2a6e9f1dd9a0054a2b03817fdfcb1365786eb61f4f205aa9be`。该包尚未在真机签名安装。
