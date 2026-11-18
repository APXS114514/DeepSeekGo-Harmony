# Deepseek GO 交接

## 工作区

- 当前源码为 1.3.2，版本代码为 `1000012`。接手时用 `git status --short` 和 `git log -1 --oneline` 查看源码状态。
- 最近一次交付是 `HAPS/Deepseek-GO-1.3.1-unsigned.hap`，版本代码为 `1000011`，对应 GitHub Releases 标签 `v1.3.1`。只有用户明确要求时才打包当前源码版本。
- 上游仓库是 GitHub 上的 `APXS114514/DeepSeekGo-Harmony`，默认分支为 `main`。贡献方式见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。仓库只收源码、配置、文档和图片资源。忽略规则覆盖本机元数据（如 `.DS_Store`）、依赖、构建产物、`HAPS/`、签名材料，以及上游遗留的 `chat-demo-main/.github/` 和过期的 `*.module.css.d.ts`。README 截图在 `assets/images/screenshots/`，使用鸿蒙版网页构建产物、模拟接口和设备消息通道生成。维护者的截图生成命令见本机 `AGENTS.local.md`。
- 保持覆盖安装所需的包名 `com.pocketchat.deepseek`。用户在手机上填写 Key，由 ArkWeb 消息通道交给系统 Asset Store。测试使用模拟 Key 和回复。

版本、提交和发布规则见 [`AGENTS.md`](AGENTS.md#版本与提交)，每版的用户可见变化见 [`CHANGELOG.md`](CHANGELOG.md)。

## SDK 与编译工具

| 项目 | 当前配置与用途 |
| --- | --- |
| 编译 SDK | HarmonyOS 26.0.0。1.0.5 HAP 的 `compileSdkVersion` 实测为 `26.0.0.105`。使用带对应 SDK 的 DevEco Studio 或命令行工具，由 Hvigor 调用 ArkTS 编译器，再打包 HAP。 |
| 目标与最低版本 | [`harmony/build-profile.json5`](harmony/build-profile.json5) 配置 `targetSdkVersion: "26.0.0"`、`compatibleSdkVersion: "5.0.0(12)"` 和 `runtimeOS: "HarmonyOS"`。目标版本声明应用所适配的 API 版本，也满足应用级光感的启用条件。最低版本是 HarmonyOS 5.0（API 12）。调用高版本 API 时按系统版本及设备能力检查，并保留普通界面。 |
| ArkTS 与 ArkUI | `harmony/entry/src/main/ets/` 是原生代码。ArkUI 承载窗口、系统栏和窄屏原生顶栏。 |
| ArkWeb 与前端 | 聊天页、侧栏、设置和输入框由 ArkWeb 渲染。Node.js 下的 pnpm/Rspack 构建 `chat-demo-main/`，`pnpm build:harmony` 将网页资源输出到 `harmony/entry/src/main/resources/rawfile/chat/`，供 HAP 内置。 |

后续鸿蒙构建会将原创角色图像的 CC BY-NC-ND 4.0 授权声明 [`ARTWORK-NOTICE.txt`](ARTWORK-NOTICE.txt) 复制到 `chat/ARTWORK-NOTICE.txt`，随欢迎页图像和启动器图标一起进入 HAP。上游 MIT 许可证以 `chat/LICENSE` 随包分发。

## 沉浸光感开关

- **原生应用级配置**位于 [`harmony/entry/src/main/module.json5`](harmony/entry/src/main/module.json5) 的 `module.metadata`，键为 `ohos.arkui.UIMaterial.state`，当前值为 `enable`。已在 1.0.5 HAP 内的 `module.json` 中核实。这是 Entry 模块的静态配置，要求目标 SDK 至少为 26.0.0，作用范围是支持系统材质的原生 ArkUI 组件和场景。ArkWeb 中的 HTML 元素由网页样式控制。 [华为官方指南](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-enable)

  | 值 | 效果 |
  | --- | --- |
  | `default` 或省略 | 沿用 SDK 的默认策略，按组件及场景应用材质。 |
  | `enable` | 为适配的原生组件和场景批量开启系统材质。 |
  | `disable` | 在应用级禁用系统材质，组件级开启也不生效。 |

- **原生组件级配置**可通过 `systemMaterial` 等属性调整支持的组件。应用级未禁用时，组件配置优先，个别组件可通过 `uiMaterial.Material.empty` 关闭。排查时，在支持的系统上用 `uiMaterial.getMaterialInfo()` 读取应用级配置状态，用 `uiMaterial.isImmersiveMaterialSupported()` 检查设备能力，再用真机验证呈现。 [组件适配指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-immersive-light-sense-component-adaptation/)
- **设置 → 通用设置 → 沉浸光感**默认开启，保存在本地的 `chat-demo:immersive-light`。[`App.tsx`](chat-demo-main/src/app/App.tsx) 据此更新 `data-immersive-light`，由 [`ChatInput.module.css`](chat-demo-main/src/components/chatInput/ChatInput.module.css) 控制半透明底、背景模糊和高光。支持原生材质的设备还会在「识别图片文字」中打开 ArkUI 操作菜单。

## 1.3.2 沉浸光感优化适配鸿蒙特性

- **图片识字菜单**。`DeviceBridge` 在 API 26.0.0 及以上按需加载 `ScanSourceMenu.ets`，按系统材质和识字能力上报 `immersiveScanMenu`。开关开启时网页通过 `scan-source` 请求选择图片来源，再沿用 `scan` 打开相机或图库。取消后回到输入区，系统不支持或菜单打开失败时用现有网页菜单。原生菜单配色跟随系统，网页输入区跟随应用内主题。
- **聊天输入区**。降低背景模糊半径、提高底色不透明度，仍沿用主题色。ArkWeb 不支持背景模糊、光感关闭，或浏览器报告减少透明度、高对比度或强制颜色时，使用普通背景。
- **验证**。通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony`、改动前端文件的 `oxfmt`、改动 ArkTS 文件的 `codelinter` 和 HarmonyOS 26.0.0 SDK Debug 编译。核对 Debug 包的版本、包名、最低 API 12 和 155 个网页资源。浏览器专项回归用模拟消息通道验证识字来源选择、取消、失败回退与重试、旧端口兼容、光感开关持久化、深浅和高对比度主题，以及 320px 窄窗的键盘视口。1.3.1 的鸿蒙功能、1.3、配色设置和动效回归通过。
- **真机待验证**。原生菜单在深浅主题、键盘弹起、分屏和悬浮窗中的观感与交互，包括系统返回手势关闭菜单和从菜单切换到相机或图库。另需在 API 12 真机上确认启动和普通网页菜单。

## 鸿蒙独有功能（1.1.0）

原生层集中在 `harmony/entry/src/main/ets/services/`，经原有的 ArkWeb 消息端口与网页通信，网页侧入口是 [`services/harmony.ts`](chat-demo-main/src/services/harmony.ts)。状态码统一见 `DeviceStatus.ets`：0 成功、1 用户取消、2 权限被拒、3 设备不支持、4 文件过大、-1 通用失败，其余正数为系统错误码原样透传。

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

- **存储**：[`services/personalization.ts`](chat-demo-main/src/services/personalization.ts) 是 zustand 状态，写入 localStorage 的 `chat-demo:custom-instructions`（`aboutUser`、`responseStyle`、`enabled`）和 `chat-demo:memory`（`enabled`、`auto`、`items`）。指令每项上限 1500 字，记忆每条 200 字、最多 100 条，读入时会清洗无效条目。不进入 IndexedDB，「删除所有对话」和历史导入导出都不影响它们。
- **注入**：`streamReply` 每次请求时调用 `buildSystemPrompt(SYSTEM_PROMPT)`，在基础身份后追加「用户提供的背景信息」「用户希望的回复方式」「关于用户的记忆」三段，标题随界面语言。续写和重新生成也使用发送当时的最新内容。
- **自动提炼**：[`services/memory.ts`](chat-demo-main/src/services/memory.ts) 在回复状态为 `done` 且未在导入历史时，把已有记忆（带序号）、本轮用户消息（前 4000 字）和回答节选（前 1500 字）发给 `deepseek-flash`，不开思考和工具，要求返回 `{"add","update","remove"}` JSON，序号对应请求时的快照。每轮最多新增 3 条，少于 4 个字的消息不触发。疑似密钥、密码、证件号或银行卡号的条目在本地过滤，这条规则偏保守，可能误挡含「密码」等字样的正常信息。失败或返回无效内容时静默放弃，有变化时提示「已更新记忆」。
- **整理**：同一模型返回 `{"memories":[…]}` 后整体替换，按文本保留原条目的 id 和来源。设置页保留整理前的列表，可撤销，离开设置页后撤销入口消失。提炼和整理共用一个 Promise 队列，不会并发改写列表。
- **界面**：[`PersonalizationSettings.tsx`](chat-demo-main/src/components/settings/PersonalizationSettings.tsx)，设置新增 `personal` 分组。指令改动后需点「保存」。记忆列表最新的在上面，编辑框按 Esc 取消且不会关闭设置。清空需二次确认。
- **对旧回归的影响**：自动记忆默认开启，每轮回答后多一次 `/anthropic/v1/messages` 请求。按请求次数断言的旧脚本（motion、edit、brand-sider）需要先在 localStorage 里关掉自动记忆，见下方验证记录。

## 1.2.1 宽屏修复

- **未居中**：用户在 1.0.6 平板横屏截图中，欢迎页和输入框左边距 240、右边距 357 设备像素，状态栏图标也在右侧约 110 像素处截止。浏览器用右侧 58vp 的 inset 复现出同样的比例，推断是位于右上角的摄像头挖孔被 `TYPE_CUTOUT.rightRect` 上报，原 `includeAvoidArea` 把它当成整条右边距。[`WindowInsets.ets`](harmony/entry/src/main/ets/window/WindowInsets.ets) 现在把完全落在窗口顶部或底部 25% 以内的左右避让区改算为上下避让；跨过中段的侧边刘海仍按左右处理。每次计算会在 hilog 输出 `Window WxH avoid system=… nav=… cutout=… -> {insets}`，真机排查时用 `hdc hilog | grep PocketChat` 查看原始矩形。
- **侧栏上下断开**：常驻侧栏原本在 `.frame` 的上下安全区 padding 以内，状态栏和手势区露出主背景色。[`Sider.module.css`](chat-demo-main/src/components/sider/Sider.module.css) 在鸿蒙下给 `.docked` 加负的上下外边距，`.sider` 用同样的 padding 避开系统栏，底色和分隔线贯穿全高。窄屏抽屉原本就是全高，未改动。

## 1.3.0 无痕对话与鸿蒙适配

- **顶栏切换不跳动**：窄屏顶栏平时由原生 `ChatHeader.ets` 绘制，打开抽屉或弹层时切换为网页的 `MobileHeader`。鸿蒙版网页顶栏现在与原生逐项一致：44 按钮、间距 8、标题 15px Medium、三条等长横线和方框铅笔图标（`IconMenuLines22`、`IconSquarePencil22`）。原生图标固定为 `22vp`，标题用 fp，网页标题按 `--app-font-scale` 同步缩放。
- **跟随系统深色**：ArkWeb 默认 `WebDarkMode.Off`，网页的 `prefers-color-scheme` 永远是浅色。`Index.ets` 改为 `.darkMode(WebDarkMode.Auto).forceDarkAccess(false)`，配色仍由网页自己的深色主题负责。另外新增 `resources/dark/element/color.json`，启动页背景在深色下使用 `#161C19`。
- **键盘弹起时顶部重叠**：`.frame` 和弹层跟随视觉视口定位，在屏幕上的上沿始终位于状态栏下方，所以顶部安全区不再扣减 `visualViewport.offsetTop`（`App.module.css` 的 `--frame-safe-top` 和 `Modal.module.css`）。旧回归脚本里「31 − 12 = 19px」的断言已改为 31px。
- **返回手势**：[`services/backStack.ts`](chat-demo-main/src/services/backStack.ts) 维护「返回即关闭」的层，Modal、Menu、Select、搜索面板、窄屏抽屉、消息编辑、会话重命名、记忆编辑和语音收音都会登记。网页通过 window-ui 的 `canGoBack` 告诉原生；`Index.ets` 的 `onBackPress` 在有可关闭的层时发送 `window-action: back`，由网页关闭最上面一层；没有可关闭的层时交给系统处理。
- **系统字体大小**：`AppScope/resources/base/profile/configuration.json` 声明 `fontSizeScale: followSystem` 和 `fontSizeMaxScale: 1.75`。`EntryAbility` 把 `config.fontSizeScale` 写入 AppStorage（`window/FontScale.ets`），`Index` 监听后发送 `font-scale`，取值限制在 0.8–1.75。网页在 `harmony.css` 中按 `--app-font-scale` 缩放 Markdown 字体变量、用户气泡、编辑框和输入框；按钮和间距不变。
- **2in1 键鼠**：[`app/shortcuts.ts`](chat-demo-main/src/app/shortcuts.ts) 提供 `Ctrl+N`（新对话）、`Ctrl+B`（窄屏开关抽屉，宽屏收起或展开侧栏）、`Ctrl+,`（设置）。原生能力上报新增 `deviceType`，只有 2in1 在按钮提示里附带快捷键。鼠标右键会话条目会打开同一个菜单（`Menu` 新增 `controlRef`），触屏长按不受影响。
- **分屏与悬浮窗**：在浏览器中按 320×568、360×420、400×800、700×500、480×320 检查欢迎页和对话页，没有控件越界或横向滚动。脚本是 `Game-Miscellaneous/_verify-deepseek-go-1.3/windows.mjs`。
- **无痕对话**：会话带 `ephemeral: true`，只存在于 `sessionCache`，不进入 `sessions` 列表和导出，`persist` 直接跳过。附件原件通过 `db.keepFilesInMemory` 放在内存里，`loadFile` 优先读取内存。系统提示词保留自定义指令，但不附带记忆，也不触发记忆提炼。`newChat`、`selectSession` 离开时会调用 `discardEphemeral` 停止生成、移出缓存、释放附件和草稿；打开已保存的对话即退出无痕模式。入口在欢迎页问候语下方，会话页顶部有说明条，原生顶栏标题显示「无痕对话」。
- **后台生成与完成通知**：网页通过 window-ui 的 `generating` 告诉原生是否有回答在生成。[`BackgroundReply.ets`](harmony/entry/src/main/ets/services/BackgroundReply.ets) 在 `onPageHide` 时若仍在生成，就申请短时任务 `requestSuspendDelay`；生成结束、回到前台或到期回调时取消。每条回答完成后网页发送 `reply-done`（会话 id、标题、去掉 Markdown 的摘要；无痕对话只发「回答已生成完成」），原生只在后台时发布通知，WantAgent 带 `pocketChatSessionId`。点击通知后 `EntryAbility.onNewWant` 写入 AppStorage，网页收到 `open-session` 后等会话列表加载再打开。回到前台时清除通知。首次开始生成时请求一次通知授权；设置 → 通用设置 → 回答完成通知（默认开启）在打开时会再次请求，被拒绝时给出提示。

## 1.3.1 配色与设置

- **默认主题色**：`settings.ts` 的 `DEFAULT_ACCENT = '#66ccff'`。`theme.ts` 的 `syncAccent` 始终设置 `data-custom-accent`，没有保存过主题色时使用默认值，因此所有强调色都走 `harmony.css` 中由 `--user-accent` 派生的规则。预设依次为默认天蓝、松绿 `#24634d`、海蓝、莓紫、珊瑚红、岩灰。点「默认天蓝」会清空已保存的主题色。
- **背景跟随主题色**：`harmony.css` 在 `[data-custom-accent]` 下用 `color-mix` 派生中性色。浅色背景是主题色 3% 混入 `#fafafa`，深色背景是主题色 5% 混入 `#141414`，深色正文色是主题色 4% 混入 `#f2f2f2`。深色输入区的色调、高光和描边也改为从主题色派生，旧的偏绿 rgba 值不再生效。原生侧的 ArkWeb 底色、启动页背景、顶栏和系统栏文字改为中性的 `#FAFAFA`、`#151515`、`#1A1A1A`、`#F2F2F2`。
- **位置信息**：不再按浏览器语言区分。设置里先选国家或地区（第一项是「不设置」），只有选中国时才出现省、市两级；`initialLocation` 直接读取保存值并校验。说明文案写明：它随消息作为最新信息的一部分发给模型，用于天气、出行和本地问题，只发送地名，不使用定位。
- **设置分隔**：沉浸光感和回答完成通知两个开关行加上 `styles.cell`，与其他设置项使用相同的 12px 上下内边距和分隔线。
- **界面文案**：按审阅稿逐条核对 247 组中英文文案，实际更新中文 41 条、英文 47 条，并更新 ArkWeb 资源加载失败提示。新版回归脚本位于 DSH 工作区的 `Game-Miscellaneous/_verify-deepseek-go-1.3.1/`，配色断言使用「默认天蓝」。README 截图已用新配色重新生成，截图脚本的按钮文案已同步为「新对话」。

## 1.0.x 的界面改动

- **顶栏**。上一版的蓝圈来自原生按钮使用系统材质时采用的默认填充色。1.0.5 的 `ChatHeader.ets` 使用透明底的 ArkUI 文本样式按钮。
- **Logo 与启动器图标**。鸿蒙欢迎页引用 [`assets/images/logo.png`](assets/images/logo.png)。Rspack 将 PNG 输出到 `static/media/`，`Index.ets` 按 `image/png` 提供资源。启动器图标源文件是 [`assets/images/app-icon.png`](assets/images/app-icon.png)，鸿蒙资源副本放在 `harmony/AppScope/resources/base/media/app_icon.png`。
- **键盘与欢迎页**。`Index.ets` 为 ArkWeb 设置 `WebKeyboardAvoidMode.RESIZE_VISUAL`。网页的 [`viewport.ts`](chat-demo-main/src/app/viewport.ts) 读取 `visualViewport`，收到逐帧高度时跟随系统，遇到大幅跳变时平滑补间。失焦后继续用实际可视高度，直到键盘收起。欢迎页用 `object-fit: contain` 随可用空间等比显示完整 Logo。 [华为 ArkWeb 键盘避让文档](https://developer.huawei.com/consumer/en/doc/harmonyos-references/arkts-basic-components-web-attributes/)
- **侧栏动效**。窄屏使用滑动抽屉。中等和宽窗口使用 `DockedSider`，侧栏滑动的同时，聊天区随侧栏占用宽度变化。收起状态沿用现有设置，并响应系统的减少动态效果偏好。
- **其他过渡**。设置和搜索面板进出有过渡，退出期间保留原生顶栏的遮挡状态。欢迎页进入会话、编辑消息、恢复主输入栏和手动展开思考正文时轻量淡入。正文开始时，自动思考预览平滑收起。新增过渡遵循减少动态效果偏好。
- **消息编辑**。编辑历史消息时暂时隐藏主输入栏，编辑重发生成新版本，原消息和主输入栏草稿仍可找回。

## 验证与后续

- 下文记录中的 `Game-Miscellaneous/` 脚本位于维护者的本机工作区。新克隆可直接运行本仓库的前端检查和构建命令。
- 前端已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 `pnpm build`。这些命令在 `chat-demo-main/` 下执行，`pnpm build:harmony` 生成 ArkWeb 网页资源。
- 1.0.6 浏览器模拟已验证键盘开合与失焦、Logo 完整显示、首条消息、设置和搜索面板、小窗抽屉和宽窗侧栏、减少动态效果、草稿保留、思考折叠与历史消息编辑。
- 检查原生代码时用 HarmonyOS 26.0.0 SDK 自带的 `codelinter`，例如在 `harmony/` 下运行 `codelinter -p default -e error entry/src/main/ets/pages/Index.ets`。1.0.6 的键盘配置已通过该检查。真机待验证项包括系统键盘与页面动效同步、横屏和分屏下的可用高度、启动器图标、折叠屏展开态侧栏及深浅主题下的顶栏反馈。
- 回归会话和设置时，从应用入口使用测试 Key、模拟 ArkWeb 消息通道和 API 回包。检查切换会话或折叠展开后草稿仍在，编辑重发后能切回原版本，以及 Key 校验成功但设备保存失败时能正确提示并重试。真机验收记录设备、系统版本和实际安装的包版本。
- 收到生成 HAP Release 的请求后，从 `harmony/AppScope/app.json5` 读取当前版本。先构建 ArkWeb 资源，再在 `harmony/` 下用 HarmonyOS 26.0.0 SDK 执行 `hvigorw assembleHap --mode module -p product=default -p module=entry@default -p buildMode=release --no-daemon`。核对构建日志的未签名状态及包内 `module.json` 的版本、包名和最低 API。比对图标、Logo、图像授权声明和打包的网页资源，最后复制到 `HAPS/` 并记录 SHA-256。
- 1.3.0 已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony`、改动文件的 `oxfmt`、改动的 ArkTS 文件通过 codelinter（无错误）和 ArkTS Release 编译；包内含 `configuration` 配置。回归脚本 `Game-Miscellaneous/_verify-deepseek-go-1.3/batch-1.3.mjs` 覆盖顶栏对齐、返回手势分层、字体缩放、键盘偏移时的安全区、无痕对话的创建与丢弃以及不发记忆、生成状态与完成通知内容、通知开关和授权拒绝、点击通知打开会话、2in1 快捷键提示与右键菜单。1.1、1.2 功能回归仍通过，motion、edit、brand-sider 用 `*.v13.mjs`（关闭自动记忆、键盘安全区改为 31px）通过。
- 1.3.0 尚未真机验证：侧滑返回在各层的实际表现、ArkWeb `darkMode(Auto)` 是否让「跟随系统」生效、系统字体缩放和原生 fp 标题的一致性、平板键盘弹起时左上角是否仍与状态栏重叠、短时任务能否让 ArkWeb 在后台继续接收流式回复、通知授权弹窗与点击回到对话、2in1 快捷键是否与系统冲突。
- 1.3.1 文案同步后通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 `Index.ets` 的 codelinter（无错误）。在 `Game-Miscellaneous/_verify-deepseek-go-1.3.1/` 下复跑 8 个浏览器脚本，全部通过。`batch-1.3.1.mjs` 覆盖默认主题色、深浅色背景和莓紫配色、开关行分隔、国家及省市选择和地名随消息发送。其余脚本覆盖 1.3、个性化、系统分享和语音、消息编辑、动效、侧栏及多种窗口尺寸。`harmony-features.mjs` 在清空语音输入前等待 100 ms，避开下一帧移动光标对全选的干扰。
- 1.3.1 Release HAP 重新生成网页资源并通过干净的 ArkTS Release 编译，构建日志确认未签名。包内 `module.json` 显示 `com.pocketchat.deepseek`、`1.3.1`/`1000011`、最低 API 12、目标 API 26、SDK `26.0.0.105`、Release 非调试，并包含麦克风权限、系统分享技能和字体配置。包内 154 个网页文件与构建产物逐字节一致，欢迎页 Logo 与源码一致，启动器图标与 1.3.0 一致，编译后的 ArkTS 包含更新的资源加载失败提示。SHA-256 为 `0b0d8565d92cac173affa957f343aec7bef8ebc53484357824d25e9d10a69abb`。尚未在真机签名安装，待验证深色模式观感及启动页到网页首帧的颜色衔接。
- 1.3.0 Release HAP 已清空并重新生成网页资源，通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和干净的 ArkTS Release 编译，构建日志确认未签名。包内 `module.json` 显示 `com.pocketchat.deepseek`、`1.3.0`/`1000010`、最低 API 12、目标 API 26、SDK `26.0.0.105`、Release 非调试，并包含 `MICROPHONE` 权限、`sendData` 分享技能和 `$profile:configuration`。Logo 和网页资源与源码逐字节一致，启动器图标与 1.2.1 包中的相同。SHA-256 为 `b95abb662744ed5f2c1bd39759b11b93b5b13309d7979dd689a907c54fe2bcdb`，尚未在真机签名安装。
- 1.2.1 Release HAP 已重新构建网页资源，并通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 ArkTS Release 编译；构建日志确认未签名。包内 `module.json` 显示 `com.pocketchat.deepseek`、`1.2.1`/`1000009`、最低 API 12、目标 API 26、SDK `26.0.0.105`、Release 非调试，并包含 `MICROPHONE` 权限和 `sendData` 分享技能。Logo 和网页资源与源码逐字节一致。启动器图标被工具链从 1254px 缩为 512px，与已交付的 1.0.6 包中的图标逐字节相同。SHA-256 为 `33c29276c99819017ee620d9f5b99185e7ec6691635c3342f81b05e68be5c982`，尚未在真机签名安装。
- 1.2.1 已通过 `pnpm lint`、`pnpm build:harmony`、`WindowInsets.ets` 的 codelinter 和 ArkTS 编译。浏览器探针确认侧栏覆盖整个窗口高度，内容位置不变；1.1、1.2 功能回归以及关闭自动记忆后的 motion、edit、brand-sider 回归都通过。挖孔改算上下避让的逻辑只能在真机验证：需要确认平板横屏时左右对称，挖孔不遮挡内容，以及顶部 inset 是否因此变大。
- 1.2.0 已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 ArkTS 编译，原生代码未改动。浏览器回归脚本是 DSH 工作区的 `Game-Miscellaneous/_verify-deepseek-go-1.2/personalization.mjs`，在本仓库根目录用 Node 运行。它覆盖指令保存与注入、手动添加与去重、自动提炼的新增、更新和删除、敏感信息过滤、无效返回和短消息不触发、编辑与 Esc 取消、整理、撤销和整理失败、删除、开关关闭后不注入也不提炼、刷新后保留、清空确认。1.1.0 的 harmony-features 回归仍通过；motion、edit、brand-sider 在关闭自动记忆后通过。真机待验证 ArkWeb 的 localStorage 在覆盖安装后是否保留，以及长指令和长记忆列表在小屏设置页的滚动。暂未打包 1.2.0 HAP。
- 1.1.0 已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony`、`codelinter` 和 ArkTS 编译，包内 `module.json` 含 `MICROPHONE` 权限和分享技能。浏览器回归脚本在 DSH 工作区的 `Game-Miscellaneous/_verify-deepseek-go-1.1/harmony-features.mjs`，在本仓库根目录用 Node 运行。它用模拟端口覆盖冷启动和运行中分享、语音实时文字与自动结束、手动结束与取消、权限拒绝和识别失败、拍照与图库识字及取消、导出保存与失败，以及设备不支持时隐藏入口。1.0.6 的 motion、edit、brand-sider 回归仍通过。
- 1.1.0 尚未真机验证：系统分享面板是否列出 Deepseek GO 及各类文件能否读取、离线语音模型在目标设备上是否可用和首次授权流程、相机 Picker 返回的 URI 可读性和识字效果、文件管理器保存，以及 2in1 上相机和语音的可用性。暂未打包 1.1.0 HAP。
- 1.0.6 Release 已通过前端检查、ArkTS 编译和上述包内检查，SHA-256 为 `209246dd381e8b2a6e9f1dd9a0054a2b03817fdfcb1365786eb61f4f205aa9be`。该包尚未在真机签名安装。
