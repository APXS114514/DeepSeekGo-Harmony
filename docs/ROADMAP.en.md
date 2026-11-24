# Roadmap

[简体中文](ROADMAP.md)

These features are planned without a release date.

## HarmonyOS-exclusive features

- **Expanded immersive lighting**. Add press feedback, light effects, and system symbol animations to the native header buttons. On supported devices, move context menus, attachment and tool sheets, and confirmation dialogs to native ArkUI surfaces with system immersive materials, and bring matching visual lighting to floating web controls and pill toggles. Devices without system materials keep the standard appearance.
- **Home screen shortcuts**. Long-press the app icon to jump straight into a new chat, voice input, image text recognition, or an incognito chat.
- **System haptic feedback**. Provide subtle preset haptics for voice recording start and cancel, first streamed token, DeepThink completion, copy actions, and menu popups, while respecting system haptic settings.
- **Multi-page document scanning**. Integrate HarmonyOS document scanning to capture multi-page paper documents with automatic cropping, perspective correction, and shadow removal, attaching clean images or PDFs while preserving tables, formulas, and layout.
- **Background read-aloud and media controls**. Connect read-aloud to HarmonyOS media session controls so long replies keep playing in the background or on the lock screen, with pause and resume from the control center, lock screen, and headphones.
- **Home screen widgets**. Offer a 2×2 quick-action widget (new chat, voice, OCR, document scan) and a 4×2 widget that adds direct access to recent chats, with translucent card styling on supported systems.
- **Cross-device camera and document capture**. When adding attachments on a tablet or 2-in-1 device, use a nearby phone signed into the same Huawei account to take photos, scan documents, or pick from its gallery and insert them straight into the draft.
- **Knock-to-share and air gesture transfer**. From a reply or share preview, tap two HarmonyOS devices together or use an air gesture to send plain text, Markdown, or a long image to another device.
- **Smart holding-hand adaptation**. On devices with holding-hand detection, recognize left- or right-handed use and shift frequent one-handed controls such as scroll-to-bottom and voice input toward the thumb side.

## Model providers

- **Third-party model APIs**. Keep the official DeepSeek API and add settings for SiliconFlow, Tencent Cloud TokenHub, and custom OpenAI-compatible endpoints. Expand support to Alibaba Cloud Model Studio, OpenAI, Gemini, OpenRouter, and Claude over time. Store each connection's API key separately in the HarmonyOS Asset Store, and choose the provider and model in chat. Web search, images, files, and voice depend on the capabilities of the provider and model.

## Chat management

- **Undo the last turn**. Remove the latest prompt and its answer, stopping generation first if it's still running. Restore the prompt and attachments as an editable draft, and remove the turn from local history and future request context. Requests already received by the provider are handled under its policies.
- **Branch from a reply**. Create an independent chat with the visible conversation up to and including the selected reply. The sidebar adds and opens a branch such as `Chat (1)` or `Chat (2)`. The original chat and each branch can continue independently and can be renamed or deleted separately.
- **Group branches automatically**. Creating the first branch puts the original chat and its branches in a collapsible sidebar group and expands it. Branches created from another branch join the same group. Regular new chats still appear individually, and branches remain usable if the original chat is deleted.

See [Features](FEATURES.en.md) for what's available and the [Changelog](CHANGELOG.md) for release history.
