const PORT_MESSAGE = 'pocket-chat-device-port'
const PORT_TIMEOUT = 4000
let connectedPort: MessagePort | undefined
let requestId = 0
let windowUiMessage: string | undefined

type WindowAction = 'sidebar' | 'new-chat'
type WindowUi = {
  mobile: boolean
  covered: boolean
  dark: boolean
  title: string
  menuLabel: string
  newChatLabel: string
  showNewChat: boolean
}

let windowAction: ((action: WindowAction) => void) | undefined
const edges = ['top', 'right', 'bottom', 'left'] as const
let horizontalInsets = 0
export const getHorizontalInsets = () => horizontalInsets

const onWindowMessage = (event: MessageEvent<string>) => {
  try {
    const message = JSON.parse(event.data)
    if (message?.type === 'window-action') {
      if (message.action === 'sidebar' || message.action === 'new-chat') {
        windowAction?.(message.action)
      }
    } else if (message?.type === 'window-layout') {
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

export const bindWindowActions = (listener: (action: WindowAction) => void) => {
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

const requestDevice = async (operation: 'read' | 'save', value?: string): Promise<DeviceReply> => {
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
    }, PORT_TIMEOUT)
    port.addEventListener('message', onMessage)
    try {
      port.postMessage(JSON.stringify({ id, operation, value }))
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
