# Deepseek GO

- `harmony/` 是 ArkTS、ArkUI 和 ArkWeb 外壳，`chat-demo-main/` 是内置的聊天前端。
- 使用 HarmonyOS 26.0.0 SDK 编译。最低兼容版本是 HarmonyOS 5.0（API 12）。调用光感等新 API 时按系统版本和设备能力判断，保留普通顶栏路径。
- 布局以可用窗口宽度为准，跨断点时复用当前会话和草稿。横屏遵循系统旋转锁定。检查悬浮或分屏窗口的挖孔、键盘和 2in1 窗口按钮在深浅主题下的可见性。
- 根目录的 `LOGO.png` 用于新对话欢迎页，`Icon.png` 是应用启动器图标的源文件。将更新的 `Icon.png` 同步到 `harmony/AppScope/resources/base/media/app_icon.png`，注意大小写。
- API Key 由用户在手机上填写，经受限的 ArkWeb 消息通道存进鸿蒙 Asset Store。代码、包、构建配置和日志不得包含真实 Key。

## 开发与验证

- 开始前读 `HANDOFF.md`，检查 `git status --short`。保留已有改动，按可独立验证的任务组织提交。
- 修复 Bug 时尽量先用原入口复现，再用同一场景验证。修改前端后，在 `chat-demo-main/` 运行 `pnpm type`、`pnpm lint` 和 `pnpm build:harmony`。改 ArkTS 或鸿蒙配置时，用相应 SDK 检查改动及最低版本兼容性。
- 修改键盘、侧栏、动画、消息流、会话存储或 API Key 保存时，从实际页面入口做相关回归。浏览器测试用模拟 API 和设备消息通道，检查成功路径及这次涉及的失败或重试路径。涉及真机效果时，有设备就验证实际安装的版本；交接时记录未实测的部分。
- 提交前运行 `git diff --check` 并自查暂存改动，确认文件属于本次任务，保留用户已有工作，且源码和交付内容中没有密钥或签名材料。汇报提交、通过的检查和待验证项。

## 版本与提交

- `versionName` 使用 `x.y.z`。第一位 `x` 仅按用户明确要求调整。
- 新增功能时将 `y` 加一并把 `z` 归零，例如 `1.0.5 → 1.1.0`。修复 Bug 时将 `z` 加一，例如 `1.0.5 → 1.0.6`。同一批交付同时有功能和修复时按功能升版一次。
- 每次完成一次 Bug 修复或功能添加时，更新 `harmony/AppScope/app.json5` 的 `versionName`，将 `versionCode` 加一，验证改动并更新 `HANDOFF.md` 和本版 `CHANGELOG.md`，再提交一次本地 Git。仅改文档或开发流程时沿用当前应用版本。
- 本地提交与远端推送分别处理。远端推送或公开发布须有用户明确授权。获准推送时先确认目标分支和远端状态，只推送已检查的完整改动。用远端实际结果确认推送或发布是否成功。
- 远端仓库是 GitHub 上的 `APXS114514/DeepseekGo-Harmony`，即 `origin`（`git@github.com:APXS114514/DeepseekGo-Harmony.git`），默认分支为 `main`。
- 每次提交和推送都使用用户本人的 Git 身份 `APXS`。该身份就是本机全局 Git 配置中的 `user.name` 和 `user.email`，本仓库的 `.git/config` 也已固定为同一身份。不要改用其他账号、机器人或代理身份，也不要用 `-c user.*`、`--author` 或环境变量覆盖。推送前运行 `git config user.name`、`git config user.email` 和 `git log origin/main..HEAD --format='%an <%ae> | %cn <%ce>'`，确认待推送提交的作者和提交者都是这个身份；不一致时停下并告知用户。
- SSH 使用 DSH 工作区的专用密钥 `../.ssh-gh/id_ed25519`，由本仓库的 `core.sshCommand` 指定，与 DeepSeek-Arcade、LifeSim 两个仓库一致。不要移动该目录，也不要改用其他密钥或 HTTPS 令牌。

## HAP 与文档

- 仅在用户明确要求生成 HAP Release 时，使用当前源码版本打包。构建命令和包内校验见 [`HANDOFF.md`](HANDOFF.md#验证与后续)。将未签名成品以 `Deepseek-GO-<版本>-unsigned.hap` 命名并放入根目录的 `HAPS/`，保留历史包，由用户签名。
- `CHANGELOG.md` 按版本记录用户看得到的变化，每条一句话，通常每版 3–6 条。小补丁按实际变化记录。实现细节、测试结果和已知限制写在 `HANDOFF.md` 或提交说明。
- 开发规则集中在 `AGENTS.md`，架构、验证与打包命令放在 `HANDOFF.md`，用户安装使用说明放在 `README.md`。其他文档链接到对应位置。
