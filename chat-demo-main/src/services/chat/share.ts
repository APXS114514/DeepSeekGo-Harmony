import { getVisibleMessages } from './branches.js'
import { loadSession } from './db.js'
import { getReplyText } from './reply.js'
import { useChatStore } from './store.js'
import { plainAnswer } from '../markdown/plainText.js'

export type ShareFormat = 'text' | 'markdown' | 'image'
export type ShareContent = { title: string; text: string; markdown: string }

export const shareAnswer = (title: string, markdown: string): ShareContent => ({
  title,
  text: plainAnswer(markdown),
  markdown,
})

export const shareSession = async (
  id: string,
  title: string,
  labels: { user: string; assistant: string }
): Promise<ShareContent | undefined> => {
  const state = useChatStore.getState()
  if (state.importingHistory || Object.hasOwn(state.streaming, id)) {
    return
  }
  const session = Object.hasOwn(state.sessionCache, id)
    ? state.sessionCache[id]
    : await loadSession(id)
  const latest = useChatStore.getState()
  if (
    !session ||
    session.ephemeral ||
    latest.importingHistory ||
    !latest.sessions.some((summary) => summary.id === id) ||
    Object.hasOwn(latest.streaming, id)
  ) {
    return
  }
  const messages = getVisibleMessages(
    Object.hasOwn(latest.sessionCache, id) ? latest.sessionCache[id] : session
  )
  const markdown: string[] = []
  const text: string[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      const body = [message.content, ...message.files.map((file) => file.name)]
        .filter(Boolean)
        .join('\n\n')
      if (body) {
        markdown.push(`## ${labels.user}\n\n${body}`)
        text.push(`${labels.user}\n${body}`)
      }
    } else if (message.stopReason !== 'refusal') {
      const answer = getReplyText(message).trim()
      if (answer) {
        markdown.push(`## ${labels.assistant}\n\n${answer}`)
        text.push(`${labels.assistant}\n${plainAnswer(answer)}`)
      }
    }
  }
  if (!text.length) {
    return
  }
  const heading = title.replace(/\s+/g, ' ')
  return {
    title: heading,
    text: [heading, ...text].join('\n\n'),
    markdown: [`# ${heading}`, ...markdown].join('\n\n'),
  }
}

/** 画固定宽度的正文长图，避免截取页面控件或请求外部图片。 */
export const renderShareImage = async (text: string): Promise<Blob | null> => {
  const width = 800
  const padding = 44
  const lineHeight = 34
  const maxHeight = 12_000
  const maxLines = Math.floor((maxHeight - 2 * padding) / lineHeight)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx || text.length > 60_000) {
    return null
  }
  const font = '23px system-ui, sans-serif'
  ctx.font = font
  const lines: string[] = []
  for (const paragraph of text.split(/\r\n?|\n/)) {
    let line = ''
    for (const character of paragraph) {
      if (line && ctx.measureText(line + character).width > width - padding * 2) {
        lines.push(line)
        line = ''
      }
      line += character
      if (lines.length >= maxLines) {
        return null
      }
    }
    lines.push(line)
    if (lines.length > maxLines) {
      return null
    }
  }
  canvas.width = width
  canvas.height = Math.max(144, 2 * padding + lines.length * lineHeight)
  ctx.font = font
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, canvas.height)
  ctx.fillStyle = '#181b22'
  ctx.textBaseline = 'top'
  lines.forEach((line, index) => ctx.fillText(line, padding, padding + index * lineHeight))
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
