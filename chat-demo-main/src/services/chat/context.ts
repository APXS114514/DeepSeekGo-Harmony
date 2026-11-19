import type { MessageUsage } from '../api/types.js'
import { DEFAULT_GENERATION, type GenerationOptions } from '../settings.js'
import type { Draft } from './drafts.js'
import { getContextRounds } from './reply.js'
import type { FileAttachment, Message } from './types.js'

export const CHAT_SYSTEM_PROMPT = '该助手为DeepSeek，由深度求索公司创造。'
/** /models 的 context_window 同时包含输入与输出。 */
const CONTEXT_LIMIT = 1_048_576
const WARN_AT = 0.9
const MAX_IMAGE_TOKENS = 1_024
const REQUEST_OVERHEAD = 512
const TEXT_EXTENSIONS = /\.(?:txt|md|csv|tsv|json|xml|log|py|js|ts|html|css|yaml|yml)$/i

export const getInputTokens = (usage: MessageUsage) =>
  usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

export const getContextRejection = (messages: Message[]) => {
  const question = messages.at(-2)
  const reply = messages.at(-1)
  return reply?.role === 'assistant' && reply.error?.kind === 'context' && question?.role === 'user'
    ? {
        question,
        thinking: reply.thinking ?? false,
        search: reply.search ?? false,
        generation: reply.generation ?? DEFAULT_GENERATION,
      }
    : null
}

/** 依据官方字符换算给近似值，按 UTF-16 计量的表情及其他非 ASCII 内容保留余量。 */
const textTokens = (text: string) => {
  let ascii = 0
  for (let i = 0; i < text.length; i++) {
    ascii += Number(text.charCodeAt(i) < 128)
  }
  return Math.ceil(ascii * 0.3 + (text.length - ascii) * 0.7)
}

const fileTokens = ({ size, name, isImage }: Pick<FileAttachment, 'size' | 'name' | 'isImage'>) =>
  isImage ? MAX_IMAGE_TOKENS : TEXT_EXTENSIONS.test(name) ? Math.ceil(size / 3) : null

/** 仅计入实际会回传的轮次，服务端首段用量可补足已发送附件及还原的网页。 */
export const getHistoryContext = (messages: Message[]) => {
  const rounds = getContextRounds(messages)
  let tokens = 0
  let unknownFiles = false
  let lastUsage: MessageUsage | undefined
  for (const [question, reply] of rounds) {
    if (!question.content && question.files.length === 0) {
      continue
    }
    tokens += textTokens(question.content) + textTokens(reply.latestReminder ?? '') + 12
    for (const file of question.files) {
      const estimate = fileTokens(file)
      if (estimate === null) {
        unknownFiles = true
      } else {
        tokens += estimate
      }
    }
    if (reply.usage) {
      lastUsage = reply.usage
    }
    const measured =
      reply.contextInputTokens ??
      (reply.usage &&
      reply.blocks.every((block) => block.type === 'text' || block.type === 'thinking')
        ? getInputTokens(reply.usage)
        : 0)
    if (Number.isFinite(measured) && measured > 0) {
      tokens = Math.max(tokens, measured)
      unknownFiles = false
    }
    for (const block of reply.blocks) {
      if (block.type === 'text') {
        tokens += textTokens(block.text)
      }
    }
  }
  return {
    tokens,
    unknownFiles,
    lastUsage,
    rejected: getContextRejection(messages),
    hasHistory: rounds.length > 0,
  }
}

export const estimateContext = (
  history: ReturnType<typeof getHistoryContext>,
  draft: Draft,
  system: string,
  thinking: boolean,
  maxTokens: number | null
) => {
  let tokens =
    history.tokens + textTokens(draft.text.trim()) + textTokens(system) + REQUEST_OVERHEAD
  let unknownFiles = history.unknownFiles
  for (const { file, isImage } of draft.attachments) {
    const estimate = fileTokens({ size: file.size, name: file.name, isImage })
    if (estimate === null) {
      unknownFiles = true
    } else {
      tokens += estimate
    }
  }
  const ratio = (tokens + (maxTokens ?? (thinking ? 65_536 : 8_192))) / CONTEXT_LIMIT
  return {
    unknownFiles,
    near: ratio >= WARN_AT,
    over: ratio >= 1,
    percent: ratio < 1 ? Math.min(99, Math.floor(ratio * 100)) : 100,
  }
}

/** 只拦截已经被服务端拒绝的同一份草稿，修改文字或附件后可以再次发送。 */
export const matchesRejectedDraft = (
  draft: Draft,
  rejected: ReturnType<typeof getContextRejection>,
  {
    thinking,
    search,
    generation,
  }: { thinking: boolean; search: boolean; generation: GenerationOptions }
) =>
  !!rejected &&
  rejected.thinking === thinking &&
  rejected.search === search &&
  rejected.generation.model === generation.model &&
  rejected.generation.readLinks === generation.readLinks &&
  (!thinking || rejected.generation.effort === generation.effort) &&
  rejected.generation.maxTokens === generation.maxTokens &&
  rejected.question.content === draft.text.trim() &&
  rejected.question.files.length === draft.attachments.length &&
  rejected.question.files.every((file, index) => file.id === draft.attachments[index]?.id)
