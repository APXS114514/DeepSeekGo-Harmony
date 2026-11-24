import { createId } from '../../utils/id.js'
import type { Message, Session } from './types.js'

/** 将线性消息列表规范化为单分支，保留消息 ID、内容及时间。 */
export const normalizeSession = (session: Session): Session =>
  session.rootMessageId !== undefined
    ? session
    : {
        ...session,
        rootMessageId: session.messages[0]?.id ?? null,
        messages: session.messages.map((message, index, messages) => ({
          ...message,
          parentId: messages[index - 1]?.id ?? null,
          selectedChildId: messages[index + 1]?.id,
        })),
      }

/** 展示内容与请求上下文共用当前选中的分支路径。 */
export const getVisibleMessages = (session: Session): Message[] => {
  if (session.rootMessageId === undefined) {
    return session.messages
  }
  const byId = new Map(session.messages.map((message) => [message.id, message]))
  const path: Message[] = []
  let id = session.rootMessageId
  while (id) {
    const message = byId.get(id)
    if (!message) {
      break
    }
    path.push(message)
    byId.delete(id)
    id = message.selectedChildId ?? null
  }
  return path
}

export type MessageVersions = { ids: string[]; index: number }

/** 一次遍历收集兄弟版本；版本列表未变化时复用旧对象与索引，避免流式正文更新重绘历史消息。 */
export const buildMessageVersions = (
  session: Session,
  previous: ReadonlyMap<string, MessageVersions>
): ReadonlyMap<string, MessageVersions> => {
  const groups = new Map<string | null | undefined, string[]>()
  for (const message of session.messages) {
    const key = session.rootMessageId === undefined ? message.id : message.parentId
    const ids = groups.get(key)
    if (ids) {
      ids.push(message.id)
    } else {
      groups.set(key, [message.id])
    }
  }

  const versions = new Map<string, MessageVersions>()
  let unchanged = previous.size === session.messages.length
  for (const ids of groups.values()) {
    const cachedIds = previous.get(ids[0])?.ids
    const stableIds =
      cachedIds?.length === ids.length && ids.every((id, index) => id === cachedIds[index])
        ? cachedIds
        : ids
    ids.forEach((id, index) => {
      const cached = previous.get(id)
      const version =
        cached?.ids === stableIds && cached.index === index ? cached : { ids: stableIds, index }
      versions.set(id, version)
      if (version !== cached) {
        unchanged = false
      }
    })
  }
  return unchanged ? previous : versions
}

/** 新消息挂在指定父节点下，并选择新分支；原节点与其后续对话保持不变。 */
export const appendBranch = (
  original: Session,
  parentId: string | null,
  messages: Message[]
): Session => {
  const session = normalizeSession(original)
  const first = messages[0]
  if (!first) {
    return session
  }
  return {
    ...session,
    rootMessageId: parentId === null ? first.id : session.rootMessageId,
    messages: [
      ...session.messages.map((message) =>
        message.id === parentId ? { ...message, selectedChildId: first.id } : message
      ),
      ...messages.map((message, index) => ({
        ...message,
        parentId: messages[index - 1]?.id ?? parentId,
        selectedChildId: messages[index + 1]?.id,
      })),
    ],
  }
}

/** 仅允许切换当前路径上某一节点的兄弟版本，恢复该版本已选中的后续分支。 */
export const selectVersion = (original: Session, messageId: string): Session => {
  const session = normalizeSession(original)
  const message = session.messages.find((item) => item.id === messageId)
  if (!message || !getVisibleMessages(session).some((item) => item.parentId === message.parentId)) {
    return original
  }
  return {
    ...session,
    rootMessageId: message.parentId === null ? message.id : session.rootMessageId,
    messages: session.messages.map((item) =>
      item.id === message.parentId ? { ...item, selectedChildId: message.id } : item
    ),
  }
}

/** 移除指定父节点之下的所有子分支（用于撤回最后一轮，不留下不可达节点）。 */
export const removeSubtreeFromParent = (original: Session, parentId: string | null): Session => {
  const session = normalizeSession(original)
  if (parentId === null) {
    return {
      ...session,
      rootMessageId: null,
      messages: [],
    }
  }
  const removed = new Set<string>()
  let added = true
  while (added) {
    added = false
    for (const message of session.messages) {
      if (
        !removed.has(message.id) &&
        (message.parentId === parentId || (message.parentId && removed.has(message.parentId)))
      ) {
        removed.add(message.id)
        added = true
      }
    }
  }
  return {
    ...session,
    messages: session.messages
      .filter((message) => !removed.has(message.id))
      .map((message) =>
        message.id === parentId ? { ...message, selectedChildId: undefined } : message
      ),
  }
}

/** 截取当前路径从开头到指定消息（含），克隆为独立会话的线性消息链。 */
export const extractPathUpTo = (original: Session, targetMessageId: string): Message[] | null => {
  const path = getVisibleMessages(original)
  const index = path.findIndex((message) => message.id === targetMessageId)
  if (index < 0) {
    return null
  }
  const slice = path.slice(0, index + 1)
  const ids = slice.map(() => createId())
  return slice.map((message, i): Message => {
    const base = {
      parentId: i === 0 ? null : ids[i - 1],
      selectedChildId: ids[i + 1],
    }
    if (message.role === 'user') {
      return {
        ...message,
        ...base,
        id: ids[i],
        files: message.files.map((file) => ({ ...file })),
      }
    }
    const cloned: Message = {
      ...message,
      ...base,
      id: ids[i],
      blocks: message.blocks.map((block) => ({ ...block })),
    }
    delete cloned.suggestedQuestions
    return cloned
  })
}
