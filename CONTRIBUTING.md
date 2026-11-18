# 参与改进

## 反馈问题

提交 Issue 时，请写明 Deepseek GO 版本、设备型号和 HarmonyOS 版本，并给出复现步骤、预期结果和实际表现。界面问题可以附截图，先遮住 API Key 和私人对话。

## 提交改动

1. Fork 本仓库，从 `main` 新建分支。用自己的 Git 身份提交，推送到自己的 Fork，再向上游仓库的 `main` 提交 Pull Request。
2. 修改前端时，使用 Node.js 22.12+ 和 pnpm，从仓库根目录运行以下命令。

   ```sh
   cd chat-demo-main
   pnpm install --frozen-lockfile
   pnpm type
   pnpm lint
   pnpm build:harmony
   ```

3. 修改原生代码或鸿蒙配置时，使用带 HarmonyOS 26.0.0 SDK 的 DevEco Studio 检查，并留意 HarmonyOS 5.0（API 12）的最低兼容要求。构建步骤见 [README](README.md#从源码构建)。
4. 提交前运行 `git diff --check`。PR 里简要写清要解决的问题、改动效果、验证步骤和未覆盖的场景。界面改动请附截图。API Key、私钥、签名文件和构建产物请留在本机。

项目开发约定见 [AGENTS.md](AGENTS.md)，架构和验证记录见 [HANDOFF.md](HANDOFF.md)。
