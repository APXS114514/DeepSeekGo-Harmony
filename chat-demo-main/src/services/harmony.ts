import { create } from 'zustand'
import type { ThemePreference } from './settings.js'

const PORT_MESSAGE = 'pocket-chat-device-port'
const PORT_TIMEOUT = 4000
/** 系统授权弹窗、相机和文件选择器要等用户操作，回复超时放宽。 */
const PICKER_TIMEOUT = 30 * 60 * 1000
let connectedPort: MessagePort | undefined
let requestId = 0
let windowUiMessage: string | undefined

type WindowAction = 'sidebar' | 'new-chat' | 'back' | 'open-session'
type WindowUi = {
  mobile: boolean
  covered: boolean
  dark: boolean
  themePreference: ThemePreference
  immersiveLight: boolean
  title: string
  menuLabel: string
  newChatLabel: string
  showNewChat: boolean
  /** 有可由返回手势关闭的层 */
  canGoBack: boolean
  /** 有回答正在生成，切到后台时原生据此申请短时任务 */
  generating: boolean
}

let windowAction: ((action: WindowAction, value?: string) => void) | undefined

/** 与原生 DeviceStatus 一致；其余正数为系统错误码，-1 为通用失败。 */
export const DeviceStatus = {
  ok: 0,
  cancelled: 1,
  denied: 2,
  unsupported: 3,
  tooLarge: 4,
  failed: -1,
} as const

/** 原生连接后上报的设备能力，未连接时全部关闭。 */
export const useDeviceFeatures = create(() => ({
  voice: false,
  apiVoice: false,
  readAloud: false,
  share: false,
  scan: false,
  immersiveScanMenu: false,
  save: false,
  windowPrivacy: null as boolean | null,
  updatingWindowPrivacy: false,
  /** 2in1 设备，按钮提示里附带键盘快捷键 */
  keyboard: false,
}))

export type DeviceVoiceEvent =
  | { event: 'result'; text: string; final: boolean; last: boolean }
  | { event: 'end' | 'cancel' }
  | { event: 'error'; code: number }

let readAloudListener: ((token: string, status: number) => void) | undefined

let voiceListener: ((event: DeviceVoiceEvent) => void) | undefined

export type SharedItem =
  | { kind: 'text'; text: string }
  | { kind: 'file'; name: string; data: string }
export type SharedContent = { items: SharedItem[]; skipped: number }

const pendingShares: SharedContent[] = []
let shareListener: ((content: SharedContent) => void) | undefined

const readShare = (message: { items?: unknown; skipped?: unknown }): SharedContent => {
  const items: SharedItem[] = []
  for (const item of Array.isArray(message.items) ? message.items : []) {
    if (item?.kind === 'text' && typeof item.text === 'string' && item.text) {
      items.push({ kind: 'text', text: item.text })
    } else if (
      item?.kind === 'file' &&
      typeof item.name === 'string' &&
      typeof item.data === 'string' &&
      item.data
    ) {
      items.push({ kind: 'file', name: item.name, data: item.data })
    }
  }
  const skipped = Number.isSafeInteger(message.skipped) ? (message.skipped as number) : 0
  return { items, skipped }
}
type FoldBounds = { upper: number; lower: number }
let foldBounds: FoldBounds | null = null
export const getFoldBounds = () => foldBounds

const readFoldBounds = (bounds: Partial<FoldBounds> | null | undefined) => {
  if (
    bounds &&
    typeof bounds.upper === 'number' &&
    typeof bounds.lower === 'number' &&
    Number.isFinite(bounds.upper) &&
    Number.isFinite(bounds.lower) &&
    bounds.upper > 0 &&
    bounds.lower >= bounds.upper
  ) {
    return { upper: bounds.upper, lower: bounds.lower }
  }
  return null
}

const edges = ['top', 'right', 'bottom', 'left'] as const
let horizontalInsets = 0
export const getHorizontalInsets = () => horizontalInsets

const onWindowMessage = (event: MessageEvent<string>) => {
  try {
    const message = JSON.parse(event.data)
    if (message?.type === 'window-action') {
      if (
        message.action === 'sidebar' ||
        message.action === 'new-chat' ||
        message.action === 'back'
      ) {
        windowAction?.(message.action)
      } else if (message.action === 'open-session' && typeof message.value === 'string') {
        windowAction?.('open-session', message.value)
      }
    } else if (message?.type === 'font-scale') {
      const scale = Number(message.scale)
      if (Number.isFinite(scale) && scale >= 0.5 && scale <= 4) {
        document.body.style.setProperty('--app-font-scale', String(scale))
      }
    } else if (message?.type === 'device-features') {
      useDeviceFeatures.setState({
        voice: message.voice === true,
        apiVoice: message.apiVoice === true,
        readAloud: message.readAloud === true,
        share: message.share === true,
        scan: message.scan === true,
        immersiveScanMenu: message.immersiveScanMenu === true,
        save: message.save === true,
        windowPrivacy: typeof message.windowPrivacy === 'boolean' ? message.windowPrivacy : null,
        keyboard: message.deviceType === '2in1',
      })
    } else if (message?.type === 'read-aloud') {
      if (typeof message.token === 'string' && Number.isInteger(message.status)) {
        readAloudListener?.(message.token, message.status)
      }
    } else if (message?.type === 'voice') {
      if (message.event === 'result' && typeof message.text === 'string') {
        voiceListener?.({
          event: 'result',
          text: message.text,
          final: message.final === true,
          last: message.last === true,
        })
      } else if (message.event === 'end' || message.event === 'cancel') {
        voiceListener?.({ event: message.event })
      } else if (message.event === 'error') {
        voiceListener?.({ event: 'error', code: Number(message.code) || DeviceStatus.failed })
      }
    } else if (message?.type === 'share') {
      const content = readShare(message)
      if (content.items.length > 0 || content.skipped > 0) {
        if (shareListener) {
          shareListener(content)
        } else {
          pendingShares.push(content)
        }
      }
    } else if (message?.type === 'window-layout') {
      const bounds = readFoldBounds(message.foldBounds)
      if (bounds?.upper !== foldBounds?.upper || bounds?.lower !== foldBounds?.lower) {
        foldBounds = bounds
        window.dispatchEvent(new Event('pocket-chat-fold'))
      }
      const body = document.body
      body.toggleAttribute('data-native-chat-header', message.nativeHeader === true)
      for (const edge of edges) {
        const value = message.insets?.[edge]
        if (Number.isFinite(value) && value >= 0) {
          body.style.setProperty(`--native-inset-${edge}`, `${value}px`)
        }
      }
      const left = message.insets?.left
      const right = message.insets?.right
      if (
        Number.isFinite(left) &&
        left >= 0 &&
        Number.isFinite(right) &&
        right >= 0 &&
        left + right !== horizontalInsets
      ) {
        horizontalInsets = left + right
        window.dispatchEvent(new Event('pocket-chat-insets'))
      }
    }
  } catch {
    // 非窗口消息由其他监听器处理。
  }
}

const portReady = __HARMONY_APP__
  ? new Promise<MessagePort>((resolve) => {
      window.addEventListener('message', (event: MessageEvent) => {
        if (
          event.data !== PORT_MESSAGE ||
          event.ports.length !== 1 ||
          (event.origin && event.origin !== 'null' && event.origin !== window.location.origin)
        ) {
          return
        }
        connectedPort?.close()
        connectedPort = event.ports[0]
        connectedPort.addEventListener('message', onWindowMessage)
        connectedPort.start()
        if (windowUiMessage) {
          connectedPort.postMessage(windowUiMessage)
        }
        resolve(connectedPort)
      })
    })
  : undefined

export const sendWindowUi = (state: WindowUi) => {
  windowUiMessage = JSON.stringify({ id: 0, operation: 'window-ui', value: JSON.stringify(state) })
  connectedPort?.postMessage(windowUiMessage)
}

export const bindWindowActions = (listener: (action: WindowAction, value?: string) => void) => {
  windowAction = listener
  return () => {
    windowAction = undefined
  }
}

const waitForPort = () =>
  connectedPort
    ? Promise.resolve(connectedPort)
    : new Promise<MessagePort>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('WEB_PORT')), PORT_TIMEOUT)
        void portReady?.then((port) => {
          clearTimeout(timer)
          resolve(connectedPort ?? port)
        })
      })

type DeviceReply = { id: number; status: number; value: string }

type DeviceOperation =
  | 'read'
  | 'save'
  | 'voice'
  | 'speak-stop'
  | 'scan'
  | 'scan-source'
  | 'reply-done'
  | 'notify-permission'
  | 'window-privacy'

const requestDevice = (
  operation: DeviceOperation,
  value?: string,
  timeout = PORT_TIMEOUT
): Promise<DeviceReply> => sendRequest((id) => JSON.stringify({ id, operation, value }), timeout)

/** 二进制请求：4 字节小端头长度 + JSON 头 + 内容，避免大文件转 Base64。 */
const requestDeviceFrame = (
  operation: 'save-file' | 'share-content' | 'speak-text',
  value: string,
  data: ArrayBuffer,
  timeout: number,
  signal?: AbortSignal
): Promise<DeviceReply> =>
  sendRequest((id) => {
    signal?.throwIfAborted()
    const header = new TextEncoder().encode(JSON.stringify({ id, operation, value }))
    const frame = new Uint8Array(4 + header.byteLength + data.byteLength)
    new DataView(frame.buffer).setUint32(0, header.byteLength, true)
    frame.set(header, 4)
    frame.set(new Uint8Array(data), 4 + header.byteLength)
    return frame.buffer
  }, timeout)

const sendRequest = async (
  build: (id: number) => string | ArrayBuffer,
  timeout: number
): Promise<DeviceReply> => {
  const port = await waitForPort()
  const id = ++requestId
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      port.removeEventListener('message', onMessage)
    }
    const onMessage = (event: MessageEvent<string>) => {
      try {
        const reply = JSON.parse(event.data) as DeviceReply
        if (reply.id === id && Number.isInteger(reply.status) && typeof reply.value === 'string') {
          cleanup()
          resolve(reply)
        }
      } catch {
        // 等待匹配本次调用的有效响应。
      }
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('WEB_REPLY'))
    }, timeout)
    port.addEventListener('message', onMessage)
    try {
      port.postMessage(build(id))
    } catch {
      cleanup()
      reject(new Error('WEB_PORT'))
    }
  })
}

export const readDeviceApiKey = async (): Promise<string | null> => {
  try {
    const reply = await requestDevice('read')
    return reply.status === 0 ? reply.value || null : null
  } catch {
    return null
  }
}

/** 保存成功返回 null，失败只返回系统状态码或固定通信错误码。 */
export const saveDeviceApiKey = async (value: string | null): Promise<string | null> => {
  try {
    const reply = await requestDevice('save', value ?? '')
    return reply.status === 0 ? null : String(reply.status)
  } catch (error) {
    return error instanceof Error && error.message === 'WEB_REPLY' ? 'WEB_REPLY' : 'WEB_PORT'
  }
}

const postDevice = (operation: DeviceOperation, value: string) => {
  const message = JSON.stringify({ id: 0, operation, value })
  if (connectedPort) {
    try {
      connectedPort.postMessage(message)
    } catch {
      // 端口可能在页面重建时关闭。
    }
    return
  }
  void waitForPort()
    .then((port) => port.postMessage(message))
    .catch(() => {})
}

/** 开始系统离线语音识别，返回 DeviceStatus；结果经 bindDeviceVoice 的监听器送达。 */
export const startDeviceVoice = async (): Promise<number> => {
  try {
    return (await requestDevice('voice', 'start', PICKER_TIMEOUT)).status
  } catch {
    return DeviceStatus.failed
  }
}

/** 停止收音，等待最后的识别结果。 */
export const stopDeviceVoice = () => postDevice('voice', 'stop')

export const cancelDeviceVoice = () => postDevice('voice', 'cancel')

export const bindDeviceVoice = (listener: (event: DeviceVoiceEvent) => void) => {
  voiceListener = listener
  return () => {
    if (voiceListener === listener) {
      voiceListener = undefined
    }
  }
}

export type ScanSource = 'camera' | 'album'

export const chooseDeviceScanSource = async (labels: {
  title: string
  camera: string
  album: string
  cancel: string
}): Promise<ScanSource | 'cancelled' | 'unavailable'> => {
  try {
    const { status, value } = await requestDevice(
      'scan-source',
      JSON.stringify(labels),
      PICKER_TIMEOUT
    )
    if (status === DeviceStatus.ok && (value === 'camera' || value === 'album')) {
      return value
    }
    if (status === DeviceStatus.cancelled) {
      return 'cancelled'
    }
  } catch {
    // 端口或原生菜单失效时仍可从网页菜单选择来源。
  }
  return 'unavailable'
}

/** 以原生窗口返回的实际状态为准，跨设置页重挂载仍只允许一个请求。 */
export const setDeviceWindowPrivacy = async (enabled: boolean): Promise<boolean> => {
  if (useDeviceFeatures.getState().updatingWindowPrivacy) {
    return false
  }
  useDeviceFeatures.setState({ updatingWindowPrivacy: true })
  try {
    const { status, value } = await requestDevice('window-privacy', String(enabled))
    if (value === 'true' || value === 'false') {
      useDeviceFeatures.setState({ windowPrivacy: value === 'true' })
    }
    return status === DeviceStatus.ok
  } catch {
    return false
  } finally {
    useDeviceFeatures.setState({ updatingWindowPrivacy: false })
  }
}

/** 用系统相机或图库取图，在本机识别文字。 */
export const scanDeviceText = async (
  source: ScanSource
): Promise<{ status: number; text: string }> => {
  try {
    const reply = await requestDevice('scan', source, PICKER_TIMEOUT)
    return { status: reply.status, text: reply.value }
  } catch {
    return { status: DeviceStatus.failed, text: '' }
  }
}

/** 先按原生通知的显示上限裁剪，避免长回答超出消息端口的大小限制。 */
export const notifyReplyDone = ({
  sessionId,
  title,
  text,
}: {
  sessionId: string
  title: string
  text: string
}) =>
  postDevice(
    'reply-done',
    JSON.stringify({ sessionId, title: title.slice(0, 40), text: text.slice(0, 120) })
  )

/** 申请系统通知授权，返回 DeviceStatus。 */
export const requestNotificationPermission = async (openSettings = false): Promise<number> => {
  try {
    return (
      await requestDevice('notify-permission', openSettings ? 'settings' : '', PICKER_TIMEOUT)
    ).status
  } catch {
    return DeviceStatus.failed
  }
}

/** 由用户在系统文件管理器里选择位置并保存，返回 DeviceStatus。 */
export const saveDeviceFile = async (name: string, data: ArrayBuffer): Promise<number> => {
  try {
    return (await requestDeviceFrame('save-file', name, data, PICKER_TIMEOUT)).status
  } catch {
    return DeviceStatus.failed
  }
}

/** 接收其他应用分享来的内容；绑定前收到的内容会补发。 */
export const bindSharedContent = (listener: (content: SharedContent) => void) => {
  shareListener = listener
  for (const content of pendingShares.splice(0)) {
    listener(content)
  }
  return () => {
    if (shareListener === listener) {
      shareListener = undefined
    }
  }
}

const openDeviceLink = (url: URL) => {
  if (
    url.origin !== window.location.origin &&
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    !url.username &&
    !url.password
  ) {
    void waitForPort()
      .then((port) =>
        port.postMessage(JSON.stringify({ id: 0, operation: 'open', value: url.href }))
      )
      .catch(() => {})
  }
}

export const openCitation = (href: string) => {
  if (!__HARMONY_APP__) {
    window.open(href, '_blank', 'noopener,noreferrer')
    return
  }
  try {
    openDeviceLink(new URL(href))
  } catch {
    // 无效的来源链接
  }
}

export const routeDeviceLinks = () => {
  document.addEventListener('click', (event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (event.defaultPrevented || !(anchor instanceof HTMLAnchorElement) || !anchor.href) {
      return
    }
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin) {
      event.preventDefault()
      openDeviceLink(url)
    }
  })
}

export const shareDeviceContent = async (
  format: 'text' | 'markdown' | 'image',
  data: ArrayBuffer
): Promise<number> => {
  if (data.byteLength > 12 * 1024 * 1024) {
    return DeviceStatus.tooLarge
  }
  try {
    return (await requestDeviceFrame('share-content', format, data, PICKER_TIMEOUT)).status
  } catch {
    return DeviceStatus.failed
  }
}

export const bindDeviceReadAloud = (listener: (token: string, status: number) => void) => {
  readAloudListener = listener
  return () => {
    if (readAloudListener === listener) {
      readAloudListener = undefined
    }
  }
}

export const startDeviceReadAloud = async (
  token: string,
  text: string,
  signal: AbortSignal
): Promise<number> => {
  const data = new TextEncoder().encode(text)
  if (data.byteLength > 256 * 1024) {
    return DeviceStatus.tooLarge
  }
  return (await requestDeviceFrame('speak-text', token, data.buffer, 10_000, signal)).status
}

export const stopDeviceReadAloud = (token: string) => postDevice('speak-stop', token)
