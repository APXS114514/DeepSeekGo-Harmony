import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

/**
 * 鸿蒙版浏览器回归的公共部分。
 * 页面加载 `pnpm build:harmony` 生成的 ArkWeb 资源，接口和设备消息通道由各脚本模拟。
 */
export { chromium }

/** 仓库根目录（本文件位于 chat-demo-main/tests/harmony/）。 */
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

/** 默认使用本机安装的 Google Chrome；设置 CHROME_PATH 可改用其他 Chromium 内核浏览器。 */
export const launchOptions = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH }
  : { channel: 'chrome' }
