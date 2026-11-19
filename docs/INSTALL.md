# 安装与构建

[English](INSTALL.en.md)

## 下载与安装

系统要求：HarmonyOS 5.0（API 12）及以上。

在 [Releases](https://github.com/APXS114514/DeepSeekGo-Harmony/releases) 中下载最新的 `Deepseek-GO-<版本>-unsigned.hap`。这是**未签名**的安装包，HarmonyOS 不能直接安装未签名的应用，需要先用自己的证书和 Profile 签名，再通过 `hdc install` 安装。

如果你没有现成的签名环境，从源码构建并用 DevEco Studio 自动签名会更简单：

1. 按下文 [从源码构建](#从源码构建) 生成内置聊天界面。
2. 用 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) 打开 `harmony/`，等待工程同步。
3. 在手机上开启开发者模式和 USB 调试，连接电脑后在 DevEco Studio 中选择这台手机。
4. 打开 **File → Project Structure → Signing Configs**，勾选 **Automatically generate signature**，按提示登录华为开发者账号，然后点 **Run** 安装。参见[华为真机调试说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-faqs/app-debugging-faq-0005/)。

首次打开会进入 **设置 → 数据管理**。填入 API Key 后点 **确定**，应用会先向官方接口校验，再保存到系统安全存储，以后可以在同一页面修改。

## 从源码构建

需要 Node.js 22.12+、pnpm，以及带 HarmonyOS 26.0.0 SDK 的 DevEco Studio。

```sh
cd chat-demo-main
pnpm install --frozen-lockfile
pnpm build:harmony
```

内置聊天界面会生成到 `harmony/entry/src/main/resources/rawfile/chat/`。这个目录不在仓库里，克隆后和修改界面后都要先运行上面的命令，再回到 DevEco Studio 构建。在 `chat-demo-main/` 中运行 `pnpm dev` 可以单独调试网页版。

项目结构：

| 目录 | 内容 |
| --- | --- |
| `harmony/` | ArkTS、ArkUI、ArkWeb 外壳，包括窗口与系统栏、Asset Store、语音、识字、分享和文件保存 |
| `chat-demo-main/` | 内置的聊天前端（React + Rspack），在上游 Chat Demo 的基础上修改 |
| `assets/images/` | 欢迎页 Logo、启动器图标源文件和 README 截图 |
| `docs/` | 功能说明、安装与构建、未来规划、更新日志、贡献指南、交接文档和英文版 |

架构、验证和打包命令见 [HANDOFF.md](HANDOFF.md)，开发与提交规则见 [AGENTS.md](../AGENTS.md)，每个版本的变化见 [CHANGELOG.md](CHANGELOG.md)。
