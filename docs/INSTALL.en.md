# Install and build

[简体中文](INSTALL.md)

## Download and install

Requires HarmonyOS 5.0 (API 12) or later.

Download the latest `Deepseek-GO-<version>-unsigned.hap` from [Releases](https://github.com/APXS114514/DeepSeekGo-Harmony/releases). The package is **unsigned**. Sign it with your own certificate and profile before installing it with `hdc install`.

If you’re setting up signing for the first time, you can build from source and let DevEco Studio handle signing.

1. Generate the bundled chat interface by following [Build from source](#build-from-source).
2. Open `harmony/` in [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/) and wait for the project to sync.
3. Enable Developer mode and USB debugging on your phone, connect it to your computer, and select it in DevEco Studio.
4. Go to **File → Project Structure → Signing Configs**, select **Automatically generate signature**, sign in to your Huawei developer account when prompted, and click **Run** to install. [Huawei’s device debugging guide](https://developer.huawei.com/consumer/cn/doc/harmonyos-faqs/app-debugging-faq-0005/)

On first launch, the app opens **Settings → Data**. Enter your API key and select **Confirm**. The app checks it against the official API, then saves it to system secure storage. You can change it from the same page.

## Build from source

Install Node.js 22.12+, pnpm, and DevEco Studio with the HarmonyOS 26.0.0 SDK.

```sh
cd chat-demo-main
pnpm install --frozen-lockfile
pnpm build:harmony
```

The bundled chat interface is generated in `harmony/entry/src/main/resources/rawfile/chat/`. Run the commands above after cloning or changing the frontend, then build the app in DevEco Studio. To work on the web version separately, run `pnpm dev` in `chat-demo-main/`.

| Directory | Contents |
| --- | --- |
| `harmony/` | ArkTS, ArkUI, and ArkWeb shell for windows, system bars, Asset Store, voice input, text recognition, sharing, and file saving |
| `chat-demo-main/` | Bundled React and Rspack frontend adapted from the upstream Chat Demo |
| `assets/images/` | Welcome screen logo, launcher icon source, and README screenshots |
| `docs/` | Documentation: features, install and build, roadmap, changelog, contributing guide, handoff notes, and English versions |

See [HANDOFF.md](HANDOFF.md) for architecture, verification, and packaging commands, [AGENTS.md](../AGENTS.md) for development and commit rules, and [CHANGELOG.md](CHANGELOG.md) for changes by version.
