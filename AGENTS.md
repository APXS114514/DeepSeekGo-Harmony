# Deepseek GO

- `harmony/` 是 ArkTS、ArkUI 和 ArkWeb 外壳，`chat-demo-main/` 是内置的聊天前端。修改前端后，在该目录运行 `pnpm type`、`pnpm lint` 和 `pnpm build:harmony` 验证。
- 使用 HarmonyOS 26.0.0 SDK 编译。最低兼容版本是 HarmonyOS 5.0（API 12）。调用光感等新 API 时按系统版本和设备能力判断，保留普通顶栏路径。
- 布局以可用窗口宽度为准，跨断点时复用当前会话和草稿。横屏遵循系统旋转锁定。检查悬浮或分屏窗口的挖孔、键盘和 2in1 窗口按钮在深浅主题下的可见性。
- 根目录的 `LOGO.png` 用于新对话欢迎页，`Icon.png` 是应用启动器图标的源文件。将更新的 `Icon.png` 同步到 `harmony/AppScope/resources/base/media/app_icon.png`，注意大小写。
- 接手时阅读根目录的 `HANDOFF.md`。完成改动后在其中更新源码状态、验证结果和待完成的真机测试。
- API Key 由用户在手机上填写，经受限的 ArkWeb 消息通道存进鸿蒙 Asset Store。代码、包、构建配置和日志不得包含真实 Key。

## 版本与提交

- `versionName` 使用 `x.y.z`。第一位 `x` 仅按用户明确要求调整。
- 新增功能时将 `y` 加一并把 `z` 归零，例如 `1.0.5 → 1.1.0`。修复 Bug 时将 `z` 加一，例如 `1.0.5 → 1.0.6`。同一批交付同时有功能和修复时按功能升版一次。
- 每次完成一次 Bug 修复或功能添加时，更新 `harmony/AppScope/app.json5` 的 `versionName`，将 `versionCode` 加一，验证改动并更新 `HANDOFF.md`，再提交一次本地 Git。仅改文档或开发流程时沿用当前应用版本。
- 仅在用户明确要求生成 HAP Release 时，使用当前源码版本打包。交付前检查版本、包名、最低 API 和内置网页资源，将未签名成品以 `Deepseek-GO-<版本>-unsigned.hap` 命名并放入根目录的 `HAPS/`。保留历史包，用户自行签名。
