# Deepseek GO 交接

## 工作区

- 当前源码为 1.0.6，版本代码为 `1000006`，包含 1.0.5 发布后的启动器图标、键盘避让和过渡动画修复。接手时用 `git status --short` 和 `git log -1 --oneline` 查看源码状态。
- 最近一次交付是 `HAPS/Deepseek-GO-1.0.5-unsigned.hap`，版本代码为 `1000005`。只有用户明确要求时才打包当前源码版本。
- 保持覆盖安装所需的包名 `com.pocketchat.deepseek`。用户在手机上填写 Key，由 ArkWeb 消息通道交给系统 Asset Store。测试使用模拟 Key 和回复。

## 版本与开发流程

- 按 [`AGENTS.md`](AGENTS.md) 的 `x.y.z` 规则升版并提交一次本地 Git。用户明确要求时调整 `x`，新增功能时递增 `y` 并将 `z` 归零，Bug 修复时递增 `z`。每次升版都将 `versionCode` 加一。
- 完成修改后依次更新 `harmony/AppScope/app.json5`、运行相关验证、更新交接文档并提交源码。单独请求生成 HAP 时直接使用当前源码版本。

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

## 当前改动

- **顶栏**。上一版的蓝圈来自原生按钮使用系统材质时采用的默认填充色。1.0.5 的 `ChatHeader.ets` 使用透明底的 ArkUI 文本样式按钮。
- **Logo 与启动器图标**。鸿蒙欢迎页引用根目录的 `LOGO.png`。Rspack 将 PNG 输出到 `static/media/`，`Index.ets` 按 `image/png` 提供资源。已将根目录最新的 `Icon.png` 原样同步至 `harmony/AppScope/resources/base/media/app_icon.png`。两个源文件的大小写以实际文件名为准。
- **键盘与欢迎页**。`Index.ets` 为 ArkWeb 设置 `WebKeyboardAvoidMode.RESIZE_VISUAL`。网页的 [`viewport.ts`](chat-demo-main/src/app/viewport.ts) 读取 `visualViewport`，收到逐帧高度时跟随系统，遇到大幅跳变时平滑补间。失焦后继续用实际可视高度，直到键盘收起。欢迎页用 `object-fit: contain` 随可用空间等比显示完整 Logo。 [华为 ArkWeb 键盘避让文档](https://developer.huawei.com/consumer/en/doc/harmonyos-references/arkts-basic-components-web-attributes/)
- **侧栏动效**。窄屏使用滑动抽屉。中等和宽窗口使用 `DockedSider`，侧栏滑动的同时，聊天区随侧栏占用宽度变化。收起状态沿用现有设置，并响应系统的减少动态效果偏好。
- **其他过渡**。设置和搜索面板进出有过渡，退出期间保留原生顶栏的遮挡状态。欢迎页进入会话、编辑消息、恢复主输入栏和手动展开思考正文时轻量淡入。正文开始时，自动思考预览平滑收起。新增过渡遵循减少动态效果偏好。
- **消息编辑**。编辑历史消息时暂时隐藏主输入栏，编辑重发生成新版本，原消息和主输入栏草稿仍可找回。

## 验证与后续

- 前端已通过 `pnpm type`、`pnpm lint`、`pnpm build:harmony` 和 `pnpm build`。这些命令在 `chat-demo-main/` 下执行，`pnpm build:harmony` 生成 ArkWeb 网页资源。
- 浏览器模拟已验证键盘弹出和收起存在中间帧、失焦时布局保持到视口恢复、Logo 完整显示、键盘打开时发送首条消息、设置与搜索面板的进出、小窗抽屉和宽窗侧栏、减少动态效果、草稿保留，以及思考折叠和历史消息编辑。
- `Index.ets` 的键盘配置已通过 HarmonyOS 26.0.0 SDK 的 CodeLinter。真机待验证项包括系统键盘与页面动效同步、横屏和分屏下的可用高度、启动器图标和折叠屏展开态侧栏动画，以及深浅主题下的顶栏按压反馈。
- 1.0.5 的 Release 构建已通过。已核对包名、最低 API 12、启动器图标、欢迎页 Logo 和全部 154 个内置网页资源。包的 SHA-256 为 `7b003bdb5835bfe89503603ccee2fee12fd644fc0da8587c0ff0ab93ae5528cf`。
- 收到生成 HAP Release 的请求后，从 `harmony/AppScope/app.json5` 读取当前版本。先构建 ArkWeb 资源，再在 `harmony/` 下用 HarmonyOS 26.0.0 SDK 执行 `hvigorw assembleHap --mode module -p product=default -p module=entry@default -p buildMode=release --no-daemon`。核对未签名包的版本、包名、最低 API、应用图标和网页资源后，复制到 `HAPS/`。
