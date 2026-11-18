# Deepseek GO

基于 DeepSeek 官方 MIT 开源 [Chat Demo](https://github.com/deepseek-ai/chat-demo) 的个人鸿蒙客户端，面向 HarmonyOS NEXT / HarmonyOS 5.0（API 12）及以上的手机和平板。鸿蒙工程位于 `harmony/`，聊天界面沿用 `chat-demo-main/` 的消息处理和移动端布局。

首次打开会进入 **设置 → 数据管理**。在手机上输入 DeepSeek 开放平台的 API Key，点 **确定**。应用先用官方 `GET /models` 校验，再将 Key 存入本机的系统安全存储。以后可从同一页面修改。请求由应用直连 `https://api.deepseek.com`，会话存在本机。

这个版本使用 Demo 默认的 `deepseek-flash`，保留流式回复、多轮对话、深度思考、联网搜索和 Markdown。

鸿蒙版独有的功能：

- **语音输入**：点输入框的麦克风，用系统离线语音识别把话转成文字，说完停顿片刻自动结束。首次使用会申请麦克风权限，不经过 DeepSeek API。
- **识别图片文字**：点麦克风左边的识字按钮，拍照或从图库选图，在本机识别出文字插入输入框，图片不会上传。
- **分享到 Deepseek GO**：在其他应用里选择分享 → Deepseek GO，文字、链接、图片和文档会放进新对话的输入框，确认后再发送。
- **导出聊天记录**：**设置 → 数据管理 → 导出所有历史对话 → 保存**，在系统文件管理器里选择位置。导出的 ZIP 可从同一页面导入。

语音和识字依赖设备的系统 AI 能力，设备不支持时不显示对应按钮。

## 个性化与记忆

在 **设置 → 个性化** 中：

- **自定义指令**：填写「希望 DeepSeek 了解你的哪些背景」和「希望 DeepSeek 怎样回复」，保存后用于之后的所有对话。
- **记忆**：开启「自动记住新信息」后，每轮回答结束会让模型从你的话里提炼值得长期记住的信息，例如职业、长期目标和偏好。在对话中说「记住……」或「忘掉……」同样有效。每次提炼会额外消耗少量 Token，不需要时可以关掉。
- 记忆列表可手动添加、编辑、删除和清空。「整理」会让模型合并重复和过时的条目，不满意可以点「撤销整理」。
- 指令和记忆只存在本机，发送消息时附在系统提示词里。「删除所有对话」不会清除它们，聊天记录导出也不包含它们。

鸿蒙版背景延伸到系统栏，聊天内容会避让状态栏、底部手势区和屏幕挖孔。窄窗口打开侧栏时，聊天页随侧栏向右滑动。宽窗口收起或展开侧栏时，聊天区随之扩展或缩回。**设置 → 通用设置 → 沉浸光感** 可控制聊天输入区的半透明材质和高光，默认开启。

同一 HAP 支持手机、折叠屏、平板和 2in1。布局跟随可用窗口宽度变化，空间较小时使用抽屉，宽窗口可并排显示对话历史、聊天和搜索来源。在 **设置 → 通用设置 → 主题颜色** 可选预设、拾色或输入十六进制颜色。

## 安装到自己的手机

现成的未签名 Release HAP 位于 `HAPS/`。自编译时使用带 HarmonyOS 26.0.0 SDK 的 DevEco Studio。

1. 用 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) 打开 `harmony/`，等待工程同步。
2. 手机上开启开发者模式和 USB 调试，通过 USB 连接电脑，在 DevEco Studio 中选择手机。
3. 打开 **File → Project Structure → Signing Configs**，勾选 **Automatically generate signature**。按提示登录华为开发者账号，完成签名后点击 **Run** 安装。 [华为真机调试说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-faqs/app-debugging-faq-0005/)
4. 打开「Deepseek GO」，填入自己的 Key 并发送一条消息。可在 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 创建 Key。

## 重建内置聊天界面

当前工作区已生成鸿蒙版前端资源。首次从源码检出或修改界面后，请在工程根目录运行以下命令，再回 DevEco Studio 构建。需要 Node.js 22.12+ 和 pnpm。

```sh
cd chat-demo-main
pnpm install --frozen-lockfile
pnpm build:harmony
```

资源生成到 `harmony/entry/src/main/resources/rawfile/chat/`。普通网页开发仍可在 `chat-demo-main/` 中运行 `pnpm dev`。

## 许可证

本项目以 [MIT 许可证](LICENSE) 发布，版权归 APXS 所有。`chat-demo-main/` 基于 DeepSeek 官方的 [Chat Demo](https://github.com/deepseek-ai/chat-demo)，这部分沿用其 [MIT 许可证](chat-demo-main/LICENSE)，版权归 DeepSeek 所有。分发或修改时请同时保留两份许可证声明。
