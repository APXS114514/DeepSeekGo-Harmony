# Features

All features in the current version of Deepseek GO. For changes by version, see the [changelog](CHANGELOG.md) (in Chinese). [简体中文](FEATURES.md)

## Chat

- Stream replies in multi-turn chats, edit earlier messages and regenerate replies, and switch between reply versions.
- **DeepThink.** Preview the latest few lines of reasoning. The preview collapses when the answer starts. Tap its heading to expand it.
- **Web search.** Search the web with source citations. In wide windows, source cards appear alongside the chat on the right.
- Render Markdown, highlighted code, equations, and Mermaid diagrams. Copy replies or read them aloud.
- Attach images, PDFs, Office documents, and code files.
- **Incognito chat.** Turn it on from the new chat screen. Incognito chats skip history and memory and are discarded when you leave.

## HarmonyOS features

- **Voice input.** System offline speech recognition shows text as you speak and adds it to the composer when you pause. Recognition runs on your device and uses no DeepSeek tokens.
- **Recognize text in an image.** Take a photo or pick one from the gallery. The app recognizes text on your device and inserts it into the composer without uploading the image.
- **Share to Deepseek GO.** Choose **Share → Deepseek GO** in another app. Text, links, images, and documents appear in a new chat for you to review before sending.
- **Export chat history.** In **Settings → Data**, export all chats as a ZIP file and choose where to save it in the system file picker. Import an archive from the same page.
- **Background generation and reply notifications.** Replies can keep generating in the background. Tap the completion notification to go straight to the chat. You can turn this off in **Settings → General → Reply notifications**.
- **Secure API key storage.** HarmonyOS Asset Store keeps the key in the device’s secure storage, outside web storage.

Voice input and image text recognition depend on the device’s system AI capabilities. The app hides the corresponding buttons on devices that lack support.

## Personalization and memory

Open **Settings → Personalization**.

- **Custom instructions.** Fill in **What should DeepSeek know about you?** and **How should DeepSeek respond?** Save to use your instructions across chats.
- **Memory across chats.** After each reply, the model can pick out useful long-term details from what you said, such as your work, goals, or preferences. Future chats can use those details. You can also say “remember…” or “forget…”.
- **Manage memories.** View, add, edit, delete, or clear memories. **Tidy up** lets the model consolidate duplicate or outdated entries. You can undo the change.
- Custom instructions and memory have separate switches. Turning them off keeps the saved content on the device and stops sending it to the model. The app skips details that look like API keys, passwords, or ID numbers when saving memories.

Automatic memory sends one small extra request per reply and uses a few extra tokens. You can turn it off in settings.

## Devices and interface

- One package supports phones, foldables, tablets, and 2-in-1 devices. The layout follows the window width and keeps your chat and draft when it changes.
- Narrow windows use a slide-out drawer. Wide windows have a persistent sidebar, and the chat resizes smoothly as you open or collapse it.
- The background extends behind the status bar and gesture area. Content adjusts around system bars, camera cutouts, and the keyboard.
- Choose Light, Dark, or System. Pick a preset accent color, use the color picker, or enter a hex value.
- The system back gesture closes the topmost menu, dialog, settings screen, search panel, or sidebar first. It leaves the app once those layers are closed.
- Replies, messages, and the composer follow the system font size up to 1.75×.
- On 2-in-1 devices, use `Ctrl+N` for a new chat, `Ctrl+B` to toggle the sidebar, and `Ctrl+,` for Settings. Right-click a chat to rename or delete it.
- **Immersive lighting.** The composer uses translucency and highlights. On supported devices, the image text recognition menu also uses system materials. Turn the effect off in **Settings → General**.
- Animations follow the system’s Reduce Motion setting.

## Privacy

- Chats, drafts, instructions, and memories are stored locally.
- The chat connects to `api.deepseek.com`. The bundled page uses a strict content security policy and opens external links in the system browser.
- API keys are kept out of source code, app packages, and logs.
