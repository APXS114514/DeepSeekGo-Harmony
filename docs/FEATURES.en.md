# Features

All features in the current version of Deepseek GO. For changes by version, see the [changelog](CHANGELOG.md) (in Chinese). [简体中文](FEATURES.md)

## Chat

- Stream replies in multi-turn chats, edit earlier messages and regenerate replies, and switch between reply versions.
- **Recall last turn.** Recall the latest prompt and its answer, stopping generation first if needed. The prompt and attachments return to an editable draft, and the turn is removed from local history and future context.
- **Chat branches.** Choose **Branch from here** on a reply to start an independent chat with everything up to that reply. The original chat and its branches are grouped automatically in a collapsible sidebar group, and each can continue, be renamed, or be deleted separately.
- **Chat model.** Select Flash or V4 Pro in **General → Chat**. Requests with attachments or the existing web tools use Flash automatically.
- **DeepThink.** Preview the latest few lines of reasoning. The preview collapses when the answer starts. Tap its heading to expand it. Set reasoning effort and output token limits in **General → Chat**.
- **Web search.** Search the web with source citations. In wide windows, source cards appear alongside the chat on the right. Control link reading separately in **General → Chat**.
- **Local information lookup.** Automatically uses your city and local date to look up weather, events, and opening hours with sources in the answer. Daily forecasts use structured Open-Meteo data when available, falling back to web search otherwise. When you ask for live data such as exchange rates while Web search is off, the reply shows a reminder with a one-tap button to turn Web search on. You can turn off local lookup in **General → Chat**.
- **Suggested questions.** Enable this in **General → Chat** to generate up to three related questions through a separate API call after a new answer in the active chat. Select a question to add it to your draft, where you can edit it before sending.
- Render Markdown, highlighted code, equations, interactive data charts (line, area, bar, and pie with summary metrics, calculation notes, sources, tap-to-inspect values, and a Chart / Data table switcher without raw code; **General → Chat → Proactive charts** is on by default so the model decides when to plot, or turn it off to chart only on request), and Mermaid diagrams. Copy replies or read them aloud.
- **Search chat history.** Search titles or messages in the current version of each chat from the sidebar. Open a chat or jump to the matching message.
- Attach images, PDFs, Office documents, and code files. The per-file limits are 100 MiB for PDF, Word, and PowerPoint, 64 MiB for images, and 32 MiB for plain text, spreadsheets, and ebooks.
- **Incognito chat.** Turn it on from the new chat screen. Incognito chats skip history and memory and are discarded when you leave. The privacy notice appears at the start of the message list and scrolls with it.

## HarmonyOS features

- **Voice input.** Hold to talk, release to add the transcript to your draft, or swipe up and release to cancel. In **General → Voice**, choose on-device recognition (the default) or the multilingual DeepSeek API. With the API selected, releasing to confirm uploads the recording. Billing is based on audio duration.
- **Read aloud offline.** On supported devices, choose the offline system voice or a DeepSeek API voice in **General → Voice**.
- **Share a reply or chat.** Open a preview from the reply toolbar or chat menu, then use the system share sheet to send a reply or the current chat branch as plain text, Markdown, or a long image.
- **Recognize text in an image.** On supported devices, the composer paperclip button opens **Add attachment** with options to upload an image or file, take a photo, or choose from the gallery. Text is recognized on your device and inserted into the composer without uploading the image, and the home screen shortcut still opens the camera or gallery picker directly.
- **Share to Deepseek GO.** Choose **Share → Deepseek GO** in another app. Text, links, images, and documents appear in a new chat for you to review before sending.
- **Import and export chat history.** In **Settings → Data**, export your chats as a ZIP file or merge an archive into local history. A merge keeps existing chats with matching IDs. You can also choose to replace all local chats.
- **Background generation and reply notifications.** Replies can keep generating in the background. Tap the completion notification to go straight to the chat. Turn off reply notifications in **General → Chat**.
- **On-demand location.** Turn on **Location** in **Settings → Privacy** with a single toggle—no manual region entry required. When enabled, the app uses HarmonyOS approximate location in the foreground for “here” and “nearby” questions and converts it on-device to only the city and administrative region.
- **System haptics.** Feel subtle preset haptics when you hold to talk, swipe up to cancel, receive the first streamed token, finish DeepThink, copy, or open a menu. Haptics follow the system haptic setting.
- **Home screen shortcuts.** Long-press the app icon to jump straight into a new chat, voice input, image text recognition, or an incognito chat.
- **Secure API key storage.** HarmonyOS Asset Store keeps the key in the device’s secure storage, outside web storage.

On-device speech and image text recognition depend on system AI capabilities. Available controls reflect device capabilities and voice settings.

## Personalization and memory

Open **Settings → Personalization**.

- **Custom instructions.** Fill in **What should DeepSeek know about you?** and **How should DeepSeek respond?** Save to use your instructions across chats.
- **Memory across chats.** After each reply, the model can pick out useful long-term details from what you said, such as your work, goals, or preferences. Future chats can use those details. You can also say “remember…” or “forget…”. New or edited memories apply from your next chat, and deleted ones stop being used right away.
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
- On 2-in-1 devices, use `Ctrl+N` for a new chat, `Ctrl+B` to toggle the sidebar, and `Ctrl+,` for Settings. Right-click or long-press a chat to rename, share, or delete it.
- **Immersive lighting.** The composer, floating buttons, and pill toggles use translucency and highlights. On devices with system materials, the narrow-window header buttons add press, light, and symbol effects, and the chat menu, shortcut image text recognition menu, **Add attachment** sheet, and delete or clear confirmations use native immersive surfaces. Turn the effect off in **General → Appearance**.
- **Drag and drop.** Drop text, links, images, or files into the composer. Drag a reply’s Copy button into another app to drop the reply as plain text.
- **Foldable hover mode.** On supported devices in full-screen hover mode, the chat stays above the fold and the composer below it. Unfolding keeps the current chat and draft.
- Animations follow the system’s Reduce Motion setting. The sidebar, history search, settings, and share preview support keyboard navigation. In voice mode, use Enter or Space to start and stop recording, and Escape to cancel.

## Privacy

- **Screen capture protection.** Turn it on in **Settings → Privacy** to hide the chat window in screenshots, recordings, screen sharing, and recent apps.
- **Location.** Turn on on-demand approximate location in **Settings → Privacy** to fetch only your city and administrative region for local questions in the foreground, without sending precise coordinates.
- Chats, drafts, instructions, and memories are stored locally.
- The chat connects to `api.deepseek.com` and the structured weather lookup endpoints (`open-meteo.com`). The bundled page uses a strict content security policy and opens external links in the system browser.
- API keys are kept out of source code, app packages, and logs.
