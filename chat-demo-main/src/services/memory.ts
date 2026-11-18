import { showToast } from '../components/base/toastState.js'
import { streamMessage } from './api/client.js'
import {
  addMemory,
  MAX_MEMORIES,
  removeMemory,
  replaceMemories,
  updateMemory,
  usePersonalization,
} from './personalization.js'
import { useSettings } from './settings.js'

/**
 * 跨对话记忆的提炼与整理。都用 deepseek-flash、不开思考和工具，只取文本结果。
 * 失败时静默放弃，不影响正常对话。
 */

const MODEL = 'deepseek-flash'
const MAX_QUESTION = 4000
const MAX_ANSWER = 1500
const MAX_ADDS_PER_TURN = 3
/** 疑似密钥、密码或证件号的内容一律不记。 */
const SENSITIVE =
  /sk-[A-Za-z0-9]{12,}|api[_\s-]?key|密码|口令|password|身份证|银行卡|\b\d{15,19}\b/i

const EXTRACT_PROMPT = `你负责维护用户的长期记忆，供以后的对话参考。
阅读「已有记忆」和本轮对话，只提炼关于用户本人、以后仍然有用的稳定信息，例如身份与职业、长期目标、正在进行的项目、偏好与习惯、明确要求记住的事。
不要记录：一次性的问题或任务、助手说的内容、常识、对话的临时细节，以及密码、密钥、证件号、银行卡等敏感信息。
用户明确要求忘记某事时删除对应记忆；新信息与已有记忆冲突时更新那一条，不要重复添加。
每条记忆写成一句以「用户」开头的简短陈述，不超过 60 字，使用用户所用的语言。
只输出 JSON，不要其他文字，格式：
{"add":["新记忆"],"update":[{"index":1,"text":"更新后的内容"}],"remove":[2]}
没有变化时输出 {"add":[],"update":[],"remove":[]}`

const CONSOLIDATE_PROMPT = `你负责整理用户的长期记忆列表：合并重复或相近的条目，删除互相矛盾中较旧的一条和已经没有价值的条目，把啰嗦的条目改写得简洁。
不要编造新信息，不要丢掉仍然有用的事实，每条以「用户」开头、不超过 60 字，使用原来的语言。
只输出 JSON，不要其他文字，格式：{"memories":["……","……"]}`

const collectText = async (system: string, content: string, signal?: AbortSignal) => {
  const apiKey = useSettings.getState().apiKey
  if (!apiKey) {
    throw new Error('NO_API_KEY')
  }
  let text = ''
  for await (const event of streamMessage(
    apiKey,
    {
      model: MODEL,
      system,
      messages: [{ role: 'user', content }],
      thinking: { type: 'disabled' },
      tools: [],
      safety_check: { level: 'high' },
    },
    signal ?? new AbortController().signal
  )) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text
    }
  }
  return text
}

/** 模型偶尔会包一层代码块或前后多几句话，只取第一个完整的 JSON 对象。 */
export const parseJsonObject = (text: string): Record<string, unknown> | null => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return null
  }
  try {
    const value = JSON.parse(text.slice(start, end + 1))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

const isSafe = (text: unknown): text is string =>
  typeof text === 'string' && text.trim() !== '' && !SENSITIVE.test(text)

const listMemories = (texts: string[]) =>
  texts.length > 0 ? texts.map((text, index) => `${index + 1}. ${text}`).join('\n') : '（无）'

/**
 * 按模型返回的增删改更新记忆，序号对应发起请求时的快照。返回是否有变化。
 * 快照之后被用户删掉的条目自动跳过。
 */
export const applyMemoryChanges = (
  snapshot: { id: string; text: string }[],
  result: Record<string, unknown>
): boolean => {
  let changed = false
  const pick = (index: unknown) =>
    Number.isInteger(index) ? snapshot[(index as number) - 1] : undefined
  const exists = (id: string) =>
    usePersonalization.getState().memories.some((memory) => memory.id === id)

  for (const item of Array.isArray(result.update) ? result.update : []) {
    const target = pick(item?.index)
    if (target && exists(target.id) && isSafe(item.text) && item.text.trim() !== target.text) {
      updateMemory(target.id, item.text)
      changed = true
    }
  }
  for (const index of Array.isArray(result.remove) ? result.remove : []) {
    const target = pick(index)
    if (target && exists(target.id)) {
      removeMemory(target.id)
      changed = true
    }
  }
  const adds = (Array.isArray(result.add) ? result.add : []).filter(isSafe)
  for (const text of adds.slice(0, MAX_ADDS_PER_TURN)) {
    if (usePersonalization.getState().memories.length >= MAX_MEMORIES) {
      break
    }
    changed = addMemory(text, 'auto') || changed
  }
  return changed
}

let queue: Promise<void> = Promise.resolve()

/** 一轮回答完成后在后台提炼记忆；多轮排队依次处理，避免并发改写同一份列表。 */
export const rememberFromTurn = (question: string, answer: string) => {
  const { memoryEnabled, autoMemory } = usePersonalization.getState()
  if (!memoryEnabled || !autoMemory || question.trim().length < 4) {
    return
  }
  queue = queue.then(async () => {
    const state = usePersonalization.getState()
    if (!state.memoryEnabled || !state.autoMemory || !useSettings.getState().apiKey) {
      return
    }
    const snapshot = state.memories.map(({ id, text }) => ({ id, text }))
    try {
      const output = await collectText(
        EXTRACT_PROMPT,
        `已有记忆：\n${listMemories(snapshot.map((memory) => memory.text))}\n\n` +
          `用户：\n${question.slice(0, MAX_QUESTION)}\n\n` +
          `助手（节选）：\n${answer.slice(0, MAX_ANSWER)}`
      )
      const result = parseJsonObject(output)
      if (result && applyMemoryChanges(snapshot, result)) {
        showToast({ key: 'memoryUpdated' })
      }
    } catch {
      // 记忆是附加功能，失败不打扰用户
    }
  })
}

/** 整理全部记忆：合并重复、去掉过时内容。成功返回整理后的条数，结果无效时抛错。 */
export const consolidateMemories = (signal?: AbortSignal): Promise<number> => {
  // 与自动提炼共用队列，整理期间不会有新记忆被覆盖掉。
  const run = queue.then(() => consolidate(signal))
  queue = run.then(
    () => {},
    () => {}
  )
  return run
}

const consolidate = async (signal?: AbortSignal): Promise<number> => {
  const { memories } = usePersonalization.getState()
  if (memories.length === 0) {
    return 0
  }
  const output = await collectText(
    CONSOLIDATE_PROMPT,
    listMemories(memories.map((memory) => memory.text)),
    signal
  )
  const list = parseJsonObject(output)?.memories
  const texts = Array.isArray(list) ? list.filter(isSafe) : []
  if (texts.length === 0) {
    throw new Error('EMPTY_RESULT')
  }
  replaceMemories(texts)
  return usePersonalization.getState().memories.length
}
