import { create } from 'zustand'
import { translate } from '../i18n/index.js'
import { createId } from '../utils/id.js'

/**
 * 个性化：适用于所有对话的「关于我」「回复偏好」，以及跨对话记忆。
 * 只保存在本机，发送消息时拼进系统提示词。
 */

export const MAX_INSTRUCTION_LENGTH = 1500
export const MAX_MEMORY_LENGTH = 200
export const MAX_MEMORIES = 100

export type MemorySource = 'auto' | 'manual'

export type Memory = {
  id: string
  text: string
  source: MemorySource
  createdAt: number
  updatedAt: number
}

type Personalization = {
  /** 用户希望模型了解的背景信息 */
  aboutUser: string
  /** 用户希望的回复方式 */
  responseStyle: string
  /** 关闭后保留内容，但不发送 */
  instructionsEnabled: boolean
  /** 关闭后保留记忆，但不发送也不自动记录 */
  memoryEnabled: boolean
  /** 对话结束后由模型提炼新记忆 */
  autoMemory: boolean
  memories: Memory[]
}

const KEYS = {
  instructions: 'chat-demo:custom-instructions',
  memory: 'chat-demo:memory',
} as const

const readJson = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    return null
  }
}

const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 存储不可用时只在内存中生效
  }
}

const clip = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : ''

/** 记忆统一成单行，去掉首尾空白和列表符号。 */
export const normalizeMemoryText = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/^[-*•·\d.、\s]+/, '')
    .trim()
    .slice(0, MAX_MEMORY_LENGTH)

const readMemories = (value: unknown): Memory[] => {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  const memories: Memory[] = []
  for (const item of value) {
    const text = normalizeMemoryText(typeof item?.text === 'string' ? item.text : '')
    const id = typeof item?.id === 'string' && item.id ? item.id : createId()
    if (!text || seen.has(id)) {
      continue
    }
    seen.add(id)
    const createdAt = Number.isFinite(item.createdAt) ? item.createdAt : Date.now()
    memories.push({
      id,
      text,
      source: item.source === 'manual' ? 'manual' : 'auto',
      createdAt,
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : createdAt,
    })
  }
  return memories.slice(-MAX_MEMORIES)
}

const initial = (): Personalization => {
  const instructions = readJson(KEYS.instructions) as Record<string, unknown> | null
  const memory = readJson(KEYS.memory) as Record<string, unknown> | null
  return {
    aboutUser: clip(instructions?.aboutUser, MAX_INSTRUCTION_LENGTH),
    responseStyle: clip(instructions?.responseStyle, MAX_INSTRUCTION_LENGTH),
    instructionsEnabled: instructions?.enabled !== false,
    memoryEnabled: memory?.enabled !== false,
    autoMemory: memory?.auto !== false,
    memories: readMemories(memory?.items),
  }
}

export const usePersonalization = create<Personalization>(initial)

const saveInstructions = () => {
  const { aboutUser, responseStyle, instructionsEnabled } = usePersonalization.getState()
  writeJson(KEYS.instructions, { aboutUser, responseStyle, enabled: instructionsEnabled })
}

const saveMemory = () => {
  const { memoryEnabled, autoMemory, memories } = usePersonalization.getState()
  writeJson(KEYS.memory, { enabled: memoryEnabled, auto: autoMemory, items: memories })
}

export const setInstructions = (aboutUser: string, responseStyle: string) => {
  usePersonalization.setState({
    aboutUser: aboutUser.trim().slice(0, MAX_INSTRUCTION_LENGTH),
    responseStyle: responseStyle.trim().slice(0, MAX_INSTRUCTION_LENGTH),
  })
  saveInstructions()
}

export const setInstructionsEnabled = (instructionsEnabled: boolean) => {
  usePersonalization.setState({ instructionsEnabled })
  saveInstructions()
}

export const setMemoryEnabled = (memoryEnabled: boolean) => {
  usePersonalization.setState({ memoryEnabled })
  saveMemory()
}

export const setAutoMemory = (autoMemory: boolean) => {
  usePersonalization.setState({ autoMemory })
  saveMemory()
}

/** 新增一条记忆；与已有内容重复时不再添加。返回是否新增。 */
export const addMemory = (value: string, source: MemorySource = 'manual'): boolean => {
  const text = normalizeMemoryText(value)
  const { memories } = usePersonalization.getState()
  if (!text || memories.some((memory) => memory.text === text)) {
    return false
  }
  const now = Date.now()
  usePersonalization.setState({
    memories: [...memories, { id: createId(), text, source, createdAt: now, updatedAt: now }].slice(
      -MAX_MEMORIES
    ),
  })
  saveMemory()
  return true
}

export const updateMemory = (id: string, value: string) => {
  const text = normalizeMemoryText(value)
  if (!text) {
    removeMemory(id)
    return
  }
  usePersonalization.setState((state) => ({
    memories: state.memories.map((memory) =>
      memory.id === id && memory.text !== text
        ? { ...memory, text, updatedAt: Date.now() }
        : memory
    ),
  }))
  saveMemory()
}

export const removeMemory = (id: string) => {
  usePersonalization.setState((state) => ({
    memories: state.memories.filter((memory) => memory.id !== id),
  }))
  saveMemory()
}

export const clearMemories = () => {
  usePersonalization.setState({ memories: [] })
  saveMemory()
}

/** 整理记忆后整体替换；保留原条目的 id 和创建时间，便于用户辨认。 */
export const replaceMemories = (texts: string[]) => {
  const { memories } = usePersonalization.getState()
  const byText = new Map(memories.map((memory) => [memory.text, memory]))
  const now = Date.now()
  const next: Memory[] = []
  const seen = new Set<string>()
  for (const value of texts) {
    const text = normalizeMemoryText(value)
    if (!text || seen.has(text)) {
      continue
    }
    seen.add(text)
    next.push(byText.get(text) ?? { id: createId(), text, source: 'auto', createdAt: now, updatedAt: now })
  }
  usePersonalization.setState({ memories: next.slice(-MAX_MEMORIES) })
  saveMemory()
}

/** 每轮请求的系统提示词：基础身份 + 用户背景 + 回复偏好 + 记忆。 */
export const buildSystemPrompt = (base: string): string => {
  const { aboutUser, responseStyle, instructionsEnabled, memoryEnabled, memories } =
    usePersonalization.getState()
  const parts = [base]
  if (instructionsEnabled && aboutUser.trim()) {
    parts.push(`${translate('personalPromptAboutUser')}\n${aboutUser.trim()}`)
  }
  if (instructionsEnabled && responseStyle.trim()) {
    parts.push(`${translate('personalPromptResponseStyle')}\n${responseStyle.trim()}`)
  }
  if (memoryEnabled && memories.length > 0) {
    parts.push(
      `${translate('personalPromptMemory')}\n${memories.map((memory) => `- ${memory.text}`).join('\n')}`
    )
  }
  return parts.join('\n\n')
}
