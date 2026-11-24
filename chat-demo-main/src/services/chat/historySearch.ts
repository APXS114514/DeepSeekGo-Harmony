import { create } from 'zustand'
import { throwIfAborted } from '../../utils/abort.js'
import { getVisibleMessages } from './branches.js'
import { loadSession } from './db.js'
import { getReplyText } from './reply.js'
import { useChatStore } from './store.js'
import type { SessionSummary } from './types.js'

type Location = { sessionId: string; messageId: string }
export type HistoryMatch = { session: SessionSummary; messageId?: string; excerpt?: string }

export const useHistoryLocation = create<{ target: Location | null }>(() => ({ target: null }))

const MAX_RESULTS = 50

export const findHistory = async (
  sessions: SessionSummary[],
  query: string,
  signal: AbortSignal,
  onResults: (results: HistoryMatch[]) => void
) => {
  const needle = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu')
  const results: HistoryMatch[] = []

  for (const session of sessions) {
    if (needle.test(session.title)) {
      results.push({ session })
      if (results.length === MAX_RESULTS) {
        break
      }
    }
  }
  onResults([...results])

  for (let index = 0; index < sessions.length && results.length < MAX_RESULTS; index++) {
    throwIfAborted(signal)
    const summary = sessions[index]
    const cache = useChatStore.getState().sessionCache
    const session = Object.hasOwn(cache, summary.id)
      ? cache[summary.id]
      : await loadSession(summary.id)
    throwIfAborted(signal)
    if (session && !session.ephemeral) {
      for (const message of getVisibleMessages(session)) {
        const text =
          message.role === 'user'
            ? message.content
            : message.stopReason === 'refusal'
              ? ''
              : getReplyText(message)
        const match = needle.exec(text)
        if (match) {
          const from = Math.max(0, match.index - 48)
          const to = Math.min(text.length, match.index + match[0].length + 76)
          const excerpt =
            (from ? '…' : '') +
            text.slice(from, to).replace(/\s+/g, ' ') +
            (to < text.length ? '…' : '')
          results.push({ session: summary, messageId: message.id, excerpt })
          if (results.length === MAX_RESULTS) {
            break
          }
        }
      }
    }
    if (index % 12 === 11) {
      onResults([...results])
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    }
  }
    throwIfAborted(signal)
  onResults(results)
}
