# Roadmap

[简体中文](ROADMAP.md)

These features are planned without a release date.

## HarmonyOS-exclusive features

- **Multi-page document scanning**. Integrate HarmonyOS document scanning to capture multi-page paper documents with automatic cropping, perspective correction, and shadow removal, attaching clean images or PDFs while preserving tables, formulas, and layout.
- **Background read-aloud and media controls**. Connect read-aloud to HarmonyOS media session controls so long replies keep playing in the background or on the lock screen, with pause and resume from the control center, lock screen, and headphones.
- **Home screen widgets**. Offer a 2×2 quick-action widget (new chat, voice, OCR, document scan) and a 4×2 widget that adds direct access to recent chats, with translucent card styling on supported systems.
- **Cross-device camera and document capture**. When adding attachments on a tablet or 2-in-1 device, use a nearby phone signed into the same Huawei account to take photos, scan documents, or pick from its gallery and insert them straight into the draft.
- **Knock-to-share and air gesture transfer**. From a reply or share preview, tap two HarmonyOS devices together or use an air gesture to send plain text, Markdown, or a long image to another device.
- **Smart holding-hand adaptation**. On devices with holding-hand detection, recognize left- or right-handed use and shift frequent one-handed controls such as scroll-to-bottom and voice input toward the thumb side.

## Model providers

- **Third-party model APIs**. Keep the official DeepSeek API and add settings for SiliconFlow, Tencent Cloud TokenHub, and custom OpenAI-compatible endpoints. Expand support to Alibaba Cloud Model Studio, OpenAI, Gemini, OpenRouter, and Claude over time. Store each connection's API key separately in the HarmonyOS Asset Store, and choose the provider and model in chat. Web search, images, files, and voice depend on the capabilities of the provider and model.

See [Features](FEATURES.en.md) for what's available and the [Changelog](CHANGELOG.md) for release history.
