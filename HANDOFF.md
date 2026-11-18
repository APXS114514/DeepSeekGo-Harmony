# Deepseek GO 交接

## 工作区

- 当前源码为 1.2.1，版本代码为 `1000009`，修复宽屏居中和侧栏上下断开，见「1.2.1 宽屏修复」。1.1.0 新增系统语音输入、本机识字、接收系统分享和经系统文件管理器导出，见下方「鸿蒙独有功能」；1.2.0 新增自定义指令和跨对话记忆，见「个性化与记忆」。接手时用 `git status --short` 和 `git log -1 --oneline` 查看源码状态。
- 最近一次交付是 `HAPS/Deepseek-GO-1.0.6-unsigned.hap`，版本代码为 `1000006`。只有用户明确要求时才打包当前源码版本。
- 保持覆盖安装所需的包名 `com.pocketchat.deepseek`。用户在手机上填写 Key，由 ArkWeb 消息通道交给系统 Asset Store。测试使用模拟 Key 和回复。

版本、提交和发布规则见 [`AGENTS.md`](AGENTS.md#版本与提交)，每版的用户可见变化见 [`CHANGELOG.md`](CHANGELOG.md)。

## SDK 与编译工具

| 项目 | 当前配置与用途 |
| --- | --- |
| 编译 SDK | HarmonyOS 26.0.0。1.0.5 HAP 的 `compileSdkVersion` 实测为 `26.0.0.105`。使用带对应 SDK 的 DevEco Studio 或命令行工具，由 Hvigor 调用 ArkTS 编译器，再打包 HAP。 |
| 目标与最低版本 | [`harmony/build-profile.json5`](harmony/build-profile.json5) 配置 `targetSdkVersion: "26.0.0"`、`compatibleSdkVersion: "5.0.0(12)"` 和 `runtimeOS: "HarmonyOS"`。目标版本声明应用所适配的 API 版本，也满足应用级光感的启用条件。最低版本是 HarmonyOS 5.0（API 12）。调用高版本 API 时按系统版本及设备能力检查，并保留普通界面。 |
| ArkTS 与 ArkUI | `harmony/entry/src/main/ets/` 是原生代码。ArkUI 承载窗口、系统栏和窄屏原生顶栏。 |
| ArkWeb 与前端 | 聊天页、侧栏、设置和输入框由 ArkWeb 渲染。Node.js 下的 pnpm/Rspack 构建 `chat-demo-main/`，`pnpm build:harmony` 将网页资源输出到 `harmony/entry/src/main/resources/rawfile/chat/`，供 HAP 内置。 |

## 沉浸光感开关

- **原生应用级配置**位于 [`harmony/entry/src/main/module.json5`](harmony/entry/src/main/module.json5) 的 `module.metadata`，键为 `ohos.arkui.UIMaterial.state`，当前值为 `enable`。已在 1.0.5 HAP 内的 `module.json` 中核实。这是 Entry 模块的静态配置，要求目标 SDK 至少为 26.0.0，作用范围是支持系统材质的原生 ArkUI 组件和场景。ArkWeb 中的 HTML 元素由网页样式控制。 [华为官方指南](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-enable)

  | 值 | 效果 |
  | --- | --- |
  | `default` 或省略 | 沿用 SDK 的默认策略，按组件及场景应用材质。 |
  | `enable` | 为适配的原生组件和场景批量开启系统材质。 |
  | `disable` | 在应用级禁用系统材质，组件级开启也不生效。 |

- **原生组件级配置**可通过 `systemMaterial` 等属性调整支持的组件。应用级未禁用时，组件配置优先，个别组件可通过 `uiMaterial.Material.empty` 关闭。排查时，在支持的系统上用 `uiMaterial.getMaterialInfo()` 读取应用级配置状态，用 `uiMaterial.isImmersiveMaterialSupported()` 检查设备能力，再用真机验证呈现。 [组件适配指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-immersive-light-sense-component-adaptation/)
- **设置 → 通用设置 → 沉浸光感**是当前应用的网页输入区偏好，默认开启，保存在本地的 `chat-demo:immersive-light`。切换时由 [`App.tsx`](chat-demo-main/src/app/App.tsx) 更新 `data-immersive-light`，由 [`ChatInput.module.css`](chat-demo-main/src/components/chatInput/ChatInput.module.css) 控制半透明底、背景模糊和高光。原生 `module.metadata` 在构建时写入 HAP。

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

## 1.0.x 的界面改动

- **顶栏**。上一版的蓝圈来自原生按钮使用系统材质时采用的默认填充色。1.0.5 的 `ChatHeader.ets` 使用透明底的 ArkUI 文本样式按钮。
- **Logo 与启动器图标**。鸿蒙欢迎页引用根目录的 `LOGO.png`。Rspack 将 PNG 输出到 `static/media/`，`Index.ets` 按 `image/png` 提供资源。已将根目录最新的 `Icon.png` 原样同步至 `harmony/AppScope/resources/base/media/app_icon.png`。两个源文件的大小写以实际文件名为准。
- **键盘与欢迎页**。`Index.ets` 为 ArkWeb 设置 `WebKeyboardAvoidMode.RESIZE_VISUAL`。网页的 [`viewport.ts`](chat-demo-main/src/app/viewport.ts) 读取 `visualViewport`，收到逐帧高度时跟随系统，遇到大幅跳变时平滑补间。失焦后继续用实际可视高度，直到键盘收起。欢迎页用 `object-fit: contain` 随可用空间等比显示完整 Logo。 [华为 ArkWeb 键盘避让文档](https://developer.huawei.com/consumer/en/doc/harmonyos-references/arkts-basic-components-web-attributes/)
- **侧栏动效**。窄屏使用滑动抽屉。中等和宽窗口使用 `DockedSider`，侧栏滑动的同时，聊天区随侧栏占用宽度变化。收起状态沿用现有设置，并响应系统的减少动态效果偏好。
- **其他过渡**。设置和搜索面板进出有过渡，退出期间保留原生顶栏的遮挡状态。欢迎页进入会话、编辑消息、恢复主输入栏和手动展开思考正文时轻量淡入。正文开始时，自动思考预览平滑收起。新增过渡遵循减少动态效果偏好。
- **消息编辑**。编辑历史消息时暂时隐藏主输入栏，编辑重发生成新版本，原消息和主输入栏草稿仍可找回。

## 验证与后续

- 前端已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 `pnpm build`。这些命令在 `chat-demo-main/` 下执行，`pnpm build:harmony` 生成 ArkWeb 网页资源。
- 1.0.6 浏览器模拟已验证键盘开合与失焦、Logo 完整显示、首条消息、设置和搜索面板、小窗抽屉和宽窗侧栏、减少动态效果、草稿保留、思考折叠与历史消息编辑。
- 检查原生代码时用 HarmonyOS 26.0.0 SDK 自带的 `codelinter`，例如在 `harmony/` 下运行 `codelinter -p default -e error entry/src/main/ets/pages/Index.ets`。1.0.6 的键盘配置已通过该检查。真机待验证项包括系统键盘与页面动效同步、横屏和分屏下的可用高度、启动器图标、折叠屏展开态侧栏及深浅主题下的顶栏反馈。
- 回归会话和设置时，从应用入口使用测试 Key、模拟 ArkWeb 消息通道和 API 回包。检查切换会话或折叠展开后草稿仍在，编辑重发后能切回原版本，以及 Key 校验成功但设备保存失败时能正确提示并重试。真机验收记录设备、系统版本和实际安装的包版本。
- 收到生成 HAP Release 的请求后，从 `harmony/AppScope/app.json5` 读取当前版本。先构建 ArkWeb 资源，再在 `harmony/` 下用 HarmonyOS 26.0.0 SDK 执行 `hvigorw assembleHap --mode module -p product=default -p module=entry@default -p buildMode=release --no-daemon`。核对构建日志的未签名状态及包内 `module.json` 的版本、包名和最低 API。比对图标、Logo 和打包的网页资源，最后复制到 `HAPS/` 并记录 SHA-256。
- 1.2.1 已通过 `pnpm lint`、`pnpm build:harmony`、`WindowInsets.ets` 的 codelinter 和 ArkTS 编译。浏览器探针确认侧栏覆盖整个窗口高度，内容位置不变；1.1、1.2 功能回归以及关闭自动记忆后的 motion、edit、brand-sider 回归都通过。挖孔改算上下避让的逻辑只能在真机验证：需要确认平板横屏时左右对称，挖孔不遮挡内容，以及顶部 inset 是否因此变大。
- 1.2.0 已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 ArkTS 编译，原生代码未改动。浏览器回归脚本是 DSH 工作区的 `Game-Miscellaneous/_verify-deepseek-go-1.2/personalization.mjs`，在本仓库根目录用 Node 运行。它覆盖指令保存与注入、手动添加与去重、自动提炼的新增、更新和删除、敏感信息过滤、无效返回和短消息不触发、编辑与 Esc 取消、整理、撤销和整理失败、删除、开关关闭后不注入也不提炼、刷新后保留、清空确认。1.1.0 的 harmony-features 回归仍通过；motion、edit、brand-sider 在关闭自动记忆后通过。真机待验证 ArkWeb 的 localStorage 在覆盖安装后是否保留，以及长指令和长记忆列表在小屏设置页的滚动。暂未打包 1.2.0 HAP。
- 1.1.0 已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony`、`codelinter` 和 ArkTS 编译，包内 `module.json` 含 `MICROPHONE` 权限和分享技能。浏览器回归脚本在 DSH 工作区的 `Game-Miscellaneous/_verify-deepseek-go-1.1/harmony-features.mjs`，在本仓库根目录用 Node 运行。它用模拟端口覆盖冷启动和运行中分享、语音实时文字与自动结束、手动结束与取消、权限拒绝和识别失败、拍照与图库识字及取消、导出保存与失败，以及设备不支持时隐藏入口。1.0.6 的 motion、edit、brand-sider 回归仍通过。
- 1.1.0 尚未真机验证：系统分享面板是否列出 Deepseek GO 及各类文件能否读取、离线语音模型在目标设备上是否可用和首次授权流程、相机 Picker 返回的 URI 可读性和识字效果、文件管理器保存，以及 2in1 上相机和语音的可用性。暂未打包 1.1.0 HAP。
- 1.0.6 Release 已通过前端检查、ArkTS 编译和上述包内检查，SHA-256 为 `209246dd381e8b2a6e9f1dd9a0054a2b03817fdfcb1365786eb61f4f205aa9be`。该包尚未在真机签名安装。
