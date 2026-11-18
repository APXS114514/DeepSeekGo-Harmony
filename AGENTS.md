# DeepSeek 随身

- `harmony/` 是 ArkTS、ArkUI 和 ArkWeb 外壳，`chat-demo-main/` 是内置的聊天前端。修改前端后，在该目录运行 `pnpm type`、`pnpm lint` 和 `pnpm build:harmony`，再编译 HAP。
- 使用 HarmonyOS 26.0.0 SDK 编译。最低兼容版本是 HarmonyOS 5.0（API 12）。调用光感等新 API 时按系统版本和设备能力判断，保留普通顶栏路径。
- 布局以可用窗口宽度为准，跨断点时复用当前会话和草稿。横屏遵循系统旋转锁定。检查悬浮或分屏窗口的挖孔、键盘和 2in1 窗口按钮在深浅主题下的可见性。
- 用户提供的应用图标源文件是根目录的 `icon.jpg`。鸿蒙资源使用 `harmony/AppScope/resources/base/media/app_icon.png`。
- 交付用的 HAP 统一放在根目录的 `HAPS/`。用 `DeepSeek-Pocket-<版本>-unsigned.hap` 命名未签名 Release 包，并保留历史版本。Hvigor 的中间产物留在构建目录。
- 发布新 HAP 时，在 `harmony/AppScope/app.json5` 递增版本号和版本代码。交付前检查版本、包名、最低 API 和内置网页资源。用户在自己的设备上签名。
- API Key 由用户在手机上填写，经受限的 ArkWeb 消息通道存进鸿蒙 Asset Store。代码、包、构建配置和日志不得包含真实 Key。
