# Deepseek GO

- `harmony/` 是 ArkTS、ArkUI 和 ArkWeb 外壳，`chat-demo-main/` 是内置的聊天前端。
- 使用 HarmonyOS 26.0.0 SDK 编译。最低兼容版本是 HarmonyOS 5.0（API 12）。调用光感等新 API 时按系统版本和设备能力判断，保留普通顶栏路径。
- 布局以可用窗口宽度为准，跨断点时复用当前会话和草稿。横屏遵循系统旋转锁定。检查悬浮或分屏窗口的挖孔、键盘和 2in1 窗口按钮在深浅主题下的可见性。
- 项目图片集中在 `assets/images/`，文件名用小写，多个单词用连字符。`logo.png` 用于新对话欢迎页，`app-icon.png` 是启动器图标的源文件，更新后同步到 `harmony/AppScope/resources/base/media/app_icon.png`。README 截图放在 `assets/images/screenshots/`。
- API Key 由用户在手机上填写，经受限的 ArkWeb 消息通道存进鸿蒙 Asset Store。代码、包、构建配置和日志不得包含真实 Key。

## 开发与验证

- 开始前读 `HANDOFF.md`，检查 `git status --short`。如果仓库根目录有 `AGENTS.local.md`，同时读取其中适用于当前工作区的本机说明。保留已有改动，按可独立验证的任务组织提交。
- 修复 Bug 时尽量先用原入口复现，再用同一场景验证。修改前端后，在 `chat-demo-main/` 运行 `pnpm type`、`pnpm lint` 和 `pnpm build:harmony`；改动界面行为时再运行 `pnpm test:harmony`，并在 `chat-demo-main/tests/harmony/` 补充或更新对应回归。改 ArkTS 或鸿蒙配置时，用相应 SDK 检查改动及最低版本兼容性。
- 修改键盘、侧栏、动画、消息流、会话存储或 API Key 保存时，从实际页面入口做相关回归。浏览器测试用模拟 API 和设备消息通道，检查成功路径及这次涉及的失败或重试路径。涉及真机效果时，有设备就验证实际安装的版本；交接时记录未实测的部分。
- 提交前运行 `git diff --check` 并自查暂存改动，确认文件属于本次任务，保留用户已有工作，且源码和交付内容中没有密钥或签名材料。汇报提交、通过的检查和待验证项。

## 版本与提交

- `versionName` 使用 `x.y.z`。只有开发者明确要求调整版本时，才修改 `harmony/AppScope/app.json5` 中的 `versionName` 或 `versionCode`。修复 Bug、新增功能、修改文档和打包测试默认沿用当前版本。例如，在开发中的 `1.4.2` 修复 Bug 后仍为 `1.4.2`。
- 获准调整 `versionName` 时按开发者指定的版本执行，`versionCode` 默认加一。开发者明确指定 `versionCode` 时按指定值执行。
- 完成 Bug 修复或功能添加后，验证改动并更新 `HANDOFF.md` 和当前版本的 `CHANGELOG.md`，再提交本地 Git。
- 本地提交与远端推送分别处理。远端推送或公开发布须有用户明确授权。获准推送时先确认目标分支和远端状态，只推送已检查的完整改动。用远端实际结果确认推送或发布是否成功。
- 上游仓库是 GitHub 上的 `APXS114514/DeepSeekGo-Harmony`，默认分支为 `main`。推送前检查 `git remote -v`，确认当前克隆中远端别名实际指向的仓库。Fork 和 Pull Request 流程见 [`CONTRIBUTING.md`](CONTRIBUTING.md#提交改动)。
- 开发者以自己配置的 Git 身份提交，并使用自己的 GitHub 凭据推送。代理代表开发者操作时，先核对 `git config user.name` 和 `git config user.email`。身份缺失或与用户预期不符时，先请用户确认。

## HAP 与文档

- 仅在用户明确要求生成 HAP Release 时，使用当前源码版本打包。构建命令和包内校验见 [`HANDOFF.md`](HANDOFF.md#验证与后续)。将未签名成品以 `Deepseek-GO-<版本>-unsigned.hap` 命名并放入根目录的 `HAPS/`，保留历史包，由用户签名。
- 发布到 GitHub Releases 须有用户明确要求。用用户身份打附注标签 `v<版本>`，指向已推送的提交，并且该提交的源码版本与 HAP 一致。说明用中文，按 `CHANGELOG.md` 写本版和上次发布以来的变化，注明安装包未签名及安装方式，附上 HAP 和 SHA-256。发布后用 `gh release view` 核对标签、附件和说明。
- `CHANGELOG.md` 按版本记录用户看得到的变化，每条一句话，通常每版 3–6 条。小补丁按实际变化记录。实现细节、测试结果和已知限制写在 `HANDOFF.md` 或提交说明。
- 自有代码和相关文档按 MIT 许可证发布。根目录 `LICENSE` 归 APXS，`chat-demo-main/LICENSE` 是上游 DeepSeek Chat Demo 的许可证，两份都要保留，不要合并或改写上游版权行。原创角色图像按 CC BY-NC-ND 4.0 授权，范围见 [`ARTWORK-NOTICE.txt`](ARTWORK-NOTICE.txt)。鸿蒙构建随附此声明。
- 开发规则集中在 `AGENTS.md`，架构、验证与打包命令放在 `HANDOFF.md`，用户安装使用说明放在 `README.md`。其他文档链接到对应位置。
