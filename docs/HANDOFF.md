# Deepseek GO 交接

## 工作区

- **当前版本**：源码 `1.7.0`（`versionCode: 1000024`），包名保持 `com.pocketchat.deepseek`（覆盖安装依赖）。接手时用 `git status --short` 和 `git log -1 --oneline` 查看状态。
- **最近 HAP 包**（仅用户明确要求时打包当前源码；更早版本的包保存在本地 `HAPS/`，SHA-256 见 GitHub Releases 与 Git 历史）：
  - `1.7.0` 测试包：`HAPS/Deepseek-GO-1.7.0-unsigned.hap`（构建自 `20759fd`，`1000024`，SHA-256 `3b558b45ed3947cf8f93835ef679bea8ae9f0b4c09f63f4a6afd27c13fda102d`）。之后源码已新增主动图表开关/实时数据提示、撤回与分支、系统触感反馈、桌面长按快捷方式和扩展沉浸光感，尚未重新打包。
  - `1.6.0` 最新正式版：`HAPS/Deepseek-GO-1.6.0-unsigned.hap`（标签 `v1.6.0`，构建自 `5e3e32f`，SHA-256 `9981364c6a49e644196bb03979e13bdf2d1d7513823bdb7b36338f609ba8413a`）。
- **密钥与规则**：API Key 由用户在设备上填写，经受限 ArkWeb 消息通道存入鸿蒙 Asset Store；测试一律使用模拟 Key 和回复。版本、提交、发布和目录规范见 [`AGENTS.md`](../AGENTS.md)，用户可见变更见 [`CHANGELOG.md`](CHANGELOG.md)，贡献流程见 [`CONTRIBUTING.md`](CONTRIBUTING.md)，本机维护配置见根目录 `AGENTS.local.md`。

## SDK 与编译工具

| 项目 | 配置与说明 |
| --- | --- |
| 编译 SDK | HarmonyOS 26.0.0（实测 `compileSdkVersion: 26.0.0.105`），通过 Hvigor 调用 ArkTS 编译器打包 HAP。 |
| 目标与最低版本 | [`harmony/build-profile.json5`](../harmony/build-profile.json5) 配置 `targetSdkVersion: "26.0.0"`、`compatibleSdkVersion: "5.0.0(12)"`、`runtimeOS: "HarmonyOS"`。调用高版本 API 时按版本和设备能力检测，保留 API 12 普通路径。 |
| 原生层 | `harmony/entry/src/main/ets/` 承载窗口、系统栏、窄屏原生顶栏及原生服务。 |
| 前端层 | `chat-demo-main/` 使用 pnpm + Rspack；`pnpm build:harmony` 将内置网页输出至 `harmony/entry/src/main/resources/rawfile/chat/`，并随包附带 [`ARTWORK-NOTICE.txt`](../ARTWORK-NOTICE.txt)（CC BY-NC-ND 4.0）与上游 `chat/LICENSE`（MIT）。 |
| 图片与图标 | 欢迎页 Logo 源为 `assets/images/logo.png`；启动器图标源为 `assets/images/app-icon.png`（1024 × 1024 双图层分层描述文件，冷启动沿用 PNG）。 |

## 现行架构与原生桥接

### 沉浸光感开关

- **应用级静态配置**：[`harmony/entry/src/main/module.json5`](../harmony/entry/src/main/module.json5) 的 `module.metadata` 配置 `ohos.arkui.UIMaterial.state = "enable"`（要求 `targetSdkVersion >= 26.0.0`），作用于支持系统材质的原生 ArkUI 组件（`default`/省略沿用默认，`disable` 全局禁用）。排查用 `uiMaterial.getMaterialInfo()` 与 `uiMaterial.isImmersiveMaterialSupported()`。[启用指南](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-enable) · [组件适配](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-immersive-light-sense-component-adaptation/)
- **前端与原生联动**：设置项「通用设置 → 外观 → 沉浸光感」默认开启（`chat-demo:immersive-light`），由 [`App.tsx`](../chat-demo-main/src/app/App.tsx) 更新 `data-immersive-light`，[`ChatInput.module.css`](../chat-demo-main/src/components/chatInput/ChatInput.module.css) 控制半透明底、模糊与高光（软键盘弹起、抽屉/弹窗过渡、减少透明度或高对比度时自动降级）。支持原生材质的 API 26 设备会给窄屏透明顶栏操作按钮应用 `THIN` 材质，并在「识别图片文字」使用带 `SymbolGlyph` 图标的 `CustomDialogController` 系统背板弹窗。
- **扩展光感（原生弹层）**：`DeviceBridge` 在 API 26 且 `supportsImmersiveMaterial()` 时上报 `immersiveUi`。网页侧仅在 `immersiveUi` 且「沉浸光感」开启时，经 `native-menu`（会话「…」、右键和触屏长按菜单）、`native-confirm`（删除会话、清空历史、清空记忆、删除人设卡）和 `native-sheet`（回形针改为「附件与对话工具」半模态：上传、拍照/图库识字、深度思考、智能搜索、阅读链接）请求 [`ImmersiveUi.ets`](../harmony/entry/src/main/ets/services/ImmersiveUi.ets) 的原生弹层；返回 `unavailable` 时回退网页菜单或弹窗。弹窗用 `CustomDialogController`（`customStyle: false`），半模态挂在 `Index.ets` 的 `bindSheet`，2 秒内未出现视为失败；`DeviceBridge` 同一时间只允许一个原生弹层（含识字菜单）。顶栏按钮材质改为 `interactive: true` 并带 `lightEffect`，点按时 `SymbolGlyph` 播放 `BounceSymbolEffect`。网页侧悬浮按钮和胶囊开关的玻璃样式由 `--glass-*` 变量控制，减少透明度、高对比度或强制颜色时降级。

### 原生服务与消息通道

原生服务位于 `harmony/entry/src/main/ets/services/` 与 `window/`，经受限 ArkWeb 消息端口与 [`services/harmony.ts`](../chat-demo-main/src/services/harmony.ts) 通信。`DeviceStatus.ets` 统一状态码：`0` 成功、`1` 取消、`2` 权限被拒、`3` 不支持、`4` 文件过大、`-1` 通用失败，其余正数透传系统错误码。

| 能力 | 原生模块 | 网页侧 / 要点 |
| --- | --- | --- |
| 能力上报 | `DeviceBridge.ets` | 端口连接后发送 `device-features`（含 `deviceType`、`immersiveScanMenu`、`location` 等），按 `canIUse` 决定入口显示。 |
| 按需模糊定位 | `LocationService.ets` | 仅声明 `APPROXIMATELY_LOCATION`（API 12+ `geoLocationManager`），只在前台单次定位并本机反地理编码，仅返回国家/省/市/区县（不传坐标与街道），5 分钟内存缓存；`.geolocationAccess(false)`。鸿蒙设置改为单个开关（`chat-demo:auto-location`，默认关），网页版保留手动省市选择。 |
| 语音输入与麦克风 | `VoiceInput.ets`、`Microphone.ets` | 支持系统离线识别（Core Speech Kit，`zh-CN`，`vadEnd` 3s，最长 60s）与 DeepSeek API（16 kHz WAV → `/v1/tools/asr`），模式存 `chat-demo:voice-input-mode`（默认离线）。支持空白输入框按住说话、上滑取消、延迟启动兜底。 |
| 图片识字 | `TextScanner.ets`、`ScanSourceMenu.ets` | `cameraPicker` / `PhotoViewPicker` + Core Vision Kit `textRecognition`，无需相机/相册权限，长边缩至 4096 px 并开启方向检测；原生菜单失败回退网页菜单。 |
| 触感反馈 | `Haptics.ets` | 网页发送 `haptic`（`voice-start`、`voice-cancel`、`reply-first-token`、`thinking-done`、`copy`、`menu`），原生按 `isSupportEffectSync` 选择预置效果，`usage: 'touch'` 遵循系统触感设置，仅前台触发并限制 35 ms 最小间隔；声明 `ohos.permission.VIBRATE`。 |
| 桌面快捷方式 | `QuickShortcut.ets`、`shortcuts_config.json` | `module.json5` 的 `ohos.ability.shortcuts` 声明新对话、语音、识字、无痕四项，`Want` 参数 `pocketChatShortcut` 只接受白名单动作；`EntryAbility` 按通知跳转 > 快捷方式 > 分享的优先级分发，带递增序号写入 AppStorage，页面转发给网页执行（设备不支持语音或识字时提示）。 |
| 原生光感弹层 | `ImmersiveUi.ets` | 原生菜单、确认弹窗与工具半模态，见上文「扩展光感」。 |
| 本机朗读 | `LocalSpeech.ets` | 复用回答播放状态，按能力分段调用 Core Speech Kit；失败可重试或切换 API 音色。 |
| 接收/发起分享 | `ShareInbox.ets`、`ShareOut.ets` | `ohos.want.action.sendData` 支持文本、链接、图片、PDF 和 Office 文档（单文件 20 MB、整批 40 MB、最多 9 项），冷启动排队等 Key 就绪后导入。分享单条回答/分支支持纯文本、Markdown 与 Canvas 长图，二进制帧写沙箱缓存并定期清理超 24 小时文件。 |
| 导出记录 | `FileSaver.ets` | `DocumentViewPicker.save`；ZIP 以二进制帧传输（4 字节小端头长 + JSON 头 + 数据，上限 512 MB）。 |
| 后台回复与通知 | `BackgroundReply.ets`、`EntryAbility.ets` | `generating` 状态同步原生，前后台切换时申请/释放短时任务（`requestSuspendDelay`）；隐藏态先持久化再发 `reply-done`（裁剪摘要防超 8192 字符端口限制），后台发 `SERVICE_INFORMATION` 通知并带 `pocketChatSessionId` 跳转，回前台自动清通知。 |
| 窗口与交互 | `ChatHeader.ets`、`WindowInsets.ets`、`WindowPrivacy.ets`、`FoldHover.ets`、`FontScale.ets` | 窄屏原生顶栏与网页 `MobileHeader` 像素对齐；`Window.setWindowPrivacyMode` 防截屏并由 Preferences 持久化；全屏悬停分居折痕上下；字体缩放随系统 `0.8–1.75`（`--app-font-scale`）；`Index.ets` 用 `.darkMode(WebDarkMode.Auto)` 并在 API 26+ 用 `setColorMode` 同步原生弹层配色；[`backStack.ts`](../chat-demo-main/src/services/backStack.ts) 统一接管系统返回手势。 |

### 前端核心机制与存储

- **主题与外观**：默认主题色 `DEFAULT_ACCENT = '#66ccff'`（[`settings.ts`](../chat-demo-main/src/services/settings.ts)），`harmony.css` 在 `[data-custom-accent]` 下用 `color-mix` 派生浅/深色中性背景与深色输入区色调。
- **对话策略与工具路由**（[`store.ts`](../chat-demo-main/src/services/chat/store.ts)）：
  - 含附件、开启智能搜索、需阅读新链接或保留历史网页结果时路由至 Flash；首选 Pro 的纯文本请求使用 Pro。阅读链接默认开启且可独立关闭（关闭时不回传历史网页签名块）。请求省略 `safety_check`，保留 `refusal` 提示。
  - **无痕对话**（`ephemeral: true`）：仅驻留内存与 `db.keepFilesInMemory`，离开即销毁；携带自定义指令与人设卡，不带记忆也不触发提炼。
  - **1.7.0 本地信息与图表**：[`localInfo.ts`](../chat-demo-main/src/services/localInfo.ts) 注册表内置 Open-Meteo 逐日天气（[`Index.ets`](../harmony/entry/src/main/ets/pages/Index.ets) CSP `connect-src` 放行 `geocoding-api.open-meteo.com` 与 `api.open-meteo.com`，超时 4.5s、缓存 15 分钟），开关 `chat-demo:auto-local-info`（默认开）；失败或非天气本地场景自动走 `deepseek_web_search`（Flash），上下文拼入当轮用户消息以保前缀缓存；汇率/股价等实时数据未开智能搜索时在回答顶部提示并提供一键开启。[`chart.ts`](../chat-demo-main/src/services/markdown/chart.ts) 与 [`ChartBlock.tsx`](../chat-demo-main/src/components/markdown/ChartBlock.tsx) 渲染 ` ```chart ` 块，仅保留「图表 / 数据表」切换（无代码页签，复制/分享/朗读走 [`plainText.ts`](../chat-demo-main/src/services/markdown/plainText.ts)），开关 `chat-demo:proactive-charts`（默认开，开启时静态准则写入 `system`，关闭时按需附入当轮）；流程图继续用 Mermaid。
  - **1.7.0 撤回与分支**：支持撤回上一轮、从消息创建对话分支及侧栏分支分组展示（`branches.ts`、`sessionGroups.ts`）。
  - **猜你想问**：`chat-demo:suggested-questions`（默认关），前台回答完成后用 Flash 生成最多 3 条建议，点按填入草稿不覆盖已有输入。
- **个性化与记忆**（[`personalization.ts`](../chat-demo-main/src/services/personalization.ts)、[`memory.ts`](../chat-demo-main/src/services/memory.ts)）：
  - 写入 localStorage：`chat-demo:custom-instructions`（每项 ≤ 1500 字）、`chat-demo:memory`（每条 ≤ 200 字，≤ 100 条）、`chat-demo:persona-cards`（≤ 24 张，提示词 ≤ 4000 字）；不随历史导出或清空对话删除。
  - 会话首轮将记忆冻结为 `Session.memorySnapshot`，后续轮次仅剔除已删条目（新增/修改从下个新对话生效），防止每轮变动 `system` 破坏前缀缓存。
  - 后台提炼与整理共用串行 Promise 队列，使用 `deepseek-flash`（独立请求 `high`），本地保守过滤疑似密钥/密码/证件/银行卡条目。
- **附件、余额与上下文**：
  - Files API 体积上限：版面解析 PDF/Word/PPT 100 MiB、图片 64 MiB、`user_data` 32 MiB。[Files API](https://api-docs.deepseek.com/zh-cn/guides/files_api/)
  - [`attachments.ts`](../chat-demo-main/src/services/attachments.ts) 上传前将长边 > 4096 px 图片等比缩小（动图保留首帧），本地预览与历史保留原件；发送前自动检查并补传历史超限旧图。[视觉限制](https://api-docs.deepseek.com/zh-cn/guides/vision/#限制)
  - 合并导入使用 ZIP 暂存、IndexedDB 事务与 Web Locks 串行保护，保留同 ID 本地会话，校验失败回滚。
  - 余额查询 `GET /user/balance` 仅在打开「数据管理」时内存缓存（按 Key 隔离）；峰谷时段按北京时间及内置 2026/2027 法定节假日计算（未覆盖年份工作日标「待更新」）。
  - 上下文估算满 90% 预警；服务端明确超限时保留消息与本地附件、还原草稿并暂停重复发送。
- **输入与多形态交互**：
  - 软键盘：鸿蒙手机/平板普通 Enter 由输入法换行；2in1 实体键盘 Enter 发送、`Shift+Enter` 换行、`Ctrl/⌘+Enter` 提交。
  - 2in1 快捷键（[`shortcuts.ts`](../chat-demo-main/src/app/shortcuts.ts)）：`Ctrl+N` 新对话、`Ctrl+B` 开关侧栏、`Ctrl+,` 设置；会话条目支持鼠标右键菜单与键盘焦点导航。
  - 阅读自动收起输入框（`chat-demo:hide-composer-on-scroll`）保留 DOM 与草稿；网页拖拽支持拖入文本/链接/文件及从复制按钮拖出纯文本；ArkWeb 缩放时由网页顶栏接管并按比例换算安全区与上滑手势距离。

## 关键约束与防踩坑记录

### DeepSeek API 实测行为

- **未文档化的 32,768 Token 输入限制**：请求开启 `title`、`deepseek_read_url` 或 `deepseek_web_search` 任一项时，服务端限制**最新一条用户消息（文字 + 附件合计）≤ 32,768 Token**，超限返回 400（`user input too long, N tokens exceeds max 32768 tokens`）。更早轮次附件、`system`、`latest_reminder` 和深度思考不触发。
  - 处理方式：[`store.ts`](../chat-demo-main/src/services/chat/store.ts) 通过 [`errors.ts`](../chat-demo-main/src/services/api/errors.ts) 的 `isUserInputTooLong` 捕获首包前 400，去掉 `title`（且消息不含链接时关闭本次阅读链接）自动重发一次；若开启了智能搜索或提问含链接则展示中文说明 `replyInputTooLongForTools`。上下文总长超限（1,048,576 Token）由 `isContextOverflow` 识别，带 `title` 时会先触发 32K 检查再回退到上下文超限提示。
- **前缀缓存实测（2026-11-19，直连 `/anthropic/v1/messages`）**：
  - 命中粒度 64 Token，上一次请求末尾约 100–250 Token 不会命中。
  - **不影响命中**：`tools` 增删 `deepseek_web_search` / `deepseek_read_url`、首轮 `title: { enabled: true }`、以及在最新提问前追加新的 `latest_reminder`（服务端保留历史 reminder 原位）。
  - **整段不命中（命中 0）**：切换模型（Flash ↔ `deepseek-v4-pro`）或切换深度思考开关。缓存按「模型 × 思考模式」隔离；当前客户端未因缓存限制自动路由（如附件/搜索切 Flash）。

### 鸿蒙原生与 ArkWeb 坑点

- **折叠屏旋转锁定**：`FoldSplitContainer` 展开时会调用 `setPreferredOrientation(AUTO_ROTATION)` 覆盖系统旋转锁定。已彻底移除该组件，保持 `module.json5` 的 `follow_desktop`，改由 `FoldHover.ets` 直接监听显示服务横向折痕（API 20+ 优先实时折痕接口，旧版按旋转角度换算）。[显示接口](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-references/js-apis-display/)
- **识字弹窗背板透明**：`openCustomDialog(ComponentContent)` 自定义背板不支持系统沉浸材质，深色下会透明叠字。必须使用 `CustomDialogController` 的系统背板（默认 `ULTRA_THICK` 材质）。[光感 FAQ](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/arkts-immersive-light-sense-faq/)
- **启动器图标降采样**：HarmonyOS 26.0.0 资源工具只要检测到纹理压缩配置（即使已关闭），就会把启动器图标压到 512 × 512。Entry 的 Hvigor 任务必须在资源编译前移除该配置，以保留 1024 × 1024 双图层。
- **常驻侧栏禁止 `content-visibility: hidden`**：对宽屏常驻侧栏加 `content-visibility: hidden` 会导致 Pura X Max 内屏收起侧栏后，反复点按输入框触发渲染进程约 500px 异常平滑滚动回跳（见 [issue #1](https://github.com/APXS114514/DeepSeekGo-Harmony/issues/1)）。仅允许窄屏抽屉在关闭动画结束后加 `data-idle` 使用该优化；常驻侧栏须保持 `content-visibility: visible`。
- **ArkWeb 键盘掉帧与视口跳变**：
  - ArkWeb 键盘常只上报一次 `ResizeVisibleViewport` 跳变。[`viewport.ts`](../chat-demo-main/src/app/viewport.ts) 须先读完视口/窗口尺寸再写样式、同帧合并更新、数值不变不重写。
  - 键盘过渡时长只能写在带 `data-viewport-motion` 的框架和弹窗遮罩自身（不要挂在 `body` 造成全树继承与整页重算）；`--frame-safe-bottom` 直接取键盘最终位置，过渡期间不变；`offsetTop` 实时补偿（顶部安全区不再扣减 `visualViewport.offsetTop`）。ArkWeb M114 已支持 CSS `@property`。
  - 过渡期间暂关输入栏背景模糊，宽屏来源面板固定宽度平移以减少布局重算。
- **宽屏挖孔避让**：[`WindowInsets.ets`](../harmony/entry/src/main/ets/window/WindowInsets.ets) 将完全落在窗口顶/底 25% 内的左右挖孔与重复系统避让带转为上下避让，居中侧边挖孔与非全屏窗口沿用原值。真机排查用 `hdc hilog | grep PocketChat` 查看原始避让矩形。
- **性能排查**：用户版系统 `web.debug.devtools` 设置会报 1001；可用 `hitrace` 录 `graphic ace app nweb animation sched freq` 定位掉帧。
- **麦克风与语音授权**：ArkWeb 仅对内置 HTTPS 页面放行录音权限，首次同意后写入原生 Preferences，后续每次仍查系统权限，避免每次按住说话重复弹窗。
- **测试脚本注意事项**：自动记忆默认开启，每轮回复会额外发一次 `/anthropic/v1/messages`，按请求次数断言的回归需先在 localStorage 关闭自动记忆；清空语音草稿前等待 100 ms 避开移动光标打断全选；`motion-smoke.test.mjs` 存在偶发 `setViewportSize(942, 680)` 后的 `settleFrame(680)` 时序竞态，复跑即可确认。

## 验证与后续

### 浏览器回归与截图

脚本位于 [`chat-demo-main/tests/harmony/`](../chat-demo-main/tests/harmony/)，依赖开发依赖 `playwright-core`（默认调用本机 Chrome，可用 `CHROME_PATH` 指定其他 Chromium 浏览器）。在 `chat-demo-main/` 运行：

- 全量回归：`pnpm test:harmony`（先执行 `pnpm build:harmony`，再由 `run.mjs` 顺序执行全部 `*.test.mjs`）。
- 单项运行：`node tests/harmony/run.mjs <片段>`；设置 `SHOTS_DIR=<目录>` 可保存截图。
- 重新生成 README 截图：`pnpm screenshots`（脚本 `readme-shots.mjs`，输出到 `assets/images/screenshots/`）。

当前回归脚本（17 项，全部使用模拟 DeepSeek API 与模拟 ArkWeb 端口）：

- `adaptation`：顶栏对齐、返回手势分层、字体缩放、键盘安全区、无痕对话、后台通知、2in1 快捷键/右键菜单。
- `appearance-settings`：默认主题色、背景跟随主题色、设置项分隔。
- `brand-sider-smoke`：Logo、Key 保存与失败重试、宽窄侧栏切换。
- `conversation-management`：撤回上一轮、对话分支创建与侧栏分支分组。
- `device-features`：接收/发起分享、语音输入与按住说话、原生/网页识字菜单、导出保存、防截屏与悬停。
- `edit-regression`：历史消息编辑、版本切换与草稿保留。
- `haptics`：关键交互触发系统触感反馈消息。
- `immersive-light-extended`：原生菜单、确认弹窗与工具半模态的请求和回退，关闭沉浸光感后恢复网页交互，胶囊开关与悬浮按钮光感样式。
- `input-limit`：32,768 Token 回退与提示、大图缩放、历史补传与原件保留。
- `local-info-charts`：按需定位开关、Open-Meteo 天气与失败回退、活动搜索、实时数据未开搜索提示、主动/按需图表渲染与纯文本复制、Mermaid 共存。
- `location-service`：原生定位权限、前后台守卫、粗粒度脱敏与缓存回退。
- `microphone-permission`：原生麦克风首次授权、连续录音、页面重建与权限撤销。
- `motion-smoke`：键盘视口合并过渡、继承变量稳定、抽屉 `data-idle` 与常驻侧栏 `content-visibility: visible`、来源面板宽度稳定。
- `quick-shortcuts`：四种桌面快捷动作、冷热启动派发与不支持时的提示。
- `personalization`：自定义指令、记忆快照与前端提炼/整理/撤销、人设卡。
- `window-orientation`：悬停折痕实时/旧版坐标、非全屏回退与旋转策略。
- `window-sizes`：320–942px 悬浮窗/分屏布局、设置二级页动效与页签首帧切换高亮。

### 静态检查与 HAP Release 打包

- **工具位置**：本机没有 pnpm、DevEco Studio 或系统 Java 时，命令行工具、Node 和 Java 的路径及等价命令见根目录 `AGENTS.local.md`。`PackageHap` 需要 Java，缺少时 ArkTS 编译通过但打包报 `00308018 Unknown Error`。
- **前端检查**（在 `chat-demo-main/`）：`pnpm type`、`pnpm lint`、`pnpm build:harmony`、`pnpm build`。
- **ArkTS 检查**（在 `harmony/`）：`codelinter -p default -e error entry/src/main/ets/...`。
- **Release HAP 打包流程**（仅用户明确要求时执行）：
  1. 核对 `harmony/AppScope/app.json5` 中的当前 `versionName` / `versionCode`。
  2. 在 `chat-demo-main/` 执行 `pnpm build:harmony`。
  3. 在 `harmony/` 用 HarmonyOS 26.0.0 SDK 执行：
     `hvigorw assembleHap --mode module -p product=default -p module=entry@default -p buildMode=release --no-daemon`
  4. 校验产物：确认构建日志跳过签名且无签名块；解包核对 `module.json`（`com.pocketchat.deepseek`、版本与版本代码、Release 非调试、最低 API 12、目标 API 26、权限、分享技能、`ohos.arkui.UIMaterial.state`）；核对网页资源与 `rawfile/chat/` 逐字节一致、1024 × 1024 双图层启动器图标、欢迎页 Logo、`chat/LICENSE` 与 `chat/ARTWORK-NOTICE.txt`。
  5. 复制为 `HAPS/Deepseek-GO-<版本>-unsigned.hap` 并记录 SHA-256。

### 真机待验证清单

> 1.4.2–1.6.0 已在真机（含 HOP-AL10 / HarmonyOS 7.0.0.111）确认通过：离线语音与首次麦克风授权、拍照/图库识字与弹窗取消、侧滑返回分层、跟随系统深浅色、系统字体缩放、后台生成通知与点击回会话、余额明细加载、内屏旋转锁定、软键盘换行、展开态收起侧栏反复点按无回跳、内屏挖孔居中与设置无横向溢出。

当前仍待真机实测：

- **1.7.0 新增**：模糊定位首次授权与二次引导去设置、本机反地理编码中英文结果、切后台取消定位；真实模型在主动/按需图表与实时汇率提示下的表现；撤回/分支与系统触感反馈实际手感；桌面长按快捷方式在启动器中的显示与冷热启动；原生光感菜单、确认弹窗和工具半模态在深浅主题、悬浮窗和 2in1 下的材质与位置；从工具半模态选择「上传图片或文件」后网页文件选择器能否打开（该操作发生在原生层，ArkWeb 可能不再视为用户手势）。
- **1.6.0 延续**：设置页签快速切换首帧高亮（ArkWeb 实机）、键盘掉帧修复后的 `hitrace` 对比、原生光感顶栏分层、防截屏/录屏/投屏、折叠屏全屏悬停 + 键盘组合、平板分屏与 2in1 跨应用拖拽。
- **既有跨形态与文件流**：系统分享面板列出 Deepseek GO 及跨应用接收/打开分享导出的 Markdown 与长图、导出到文件管理器；2in1 相机/语音与系统快捷键冲突；ArkWeb 双指缩放与单指上滑取消语音手感；真实 API 下的长图缩放补传、余额与上下文超限恢复；华为上架自检对分层图标的裁切校验；覆盖安装后 localStorage 数据保留。
- **低版本兼容**：HarmonyOS 5.0（API 12）真机启动、普通顶栏与网页识字菜单回退路径。
