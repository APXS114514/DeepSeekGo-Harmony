import { create } from 'zustand'
import { translate } from '../../i18n/index.js'
import { createId } from '../../utils/id.js'
import { isUploadImageOversized } from '../../utils/resizeUploadImage.js'
import { ApiError, streamMessage } from '../api/client.js'
import type { ChatModel, CreateMessageRequest } from '../api/types.js'
import {
  extractFileIds,
  getFileErrorCode,
  isContextOverflow,
  isRetryableApiError,
  isUserInputTooLong,
} from '../api/errors.js'
import { cancelUpload, describeUploadError, uploadAttachment, useUploads } from '../attachments.js'
import { triggerDeviceHaptic, useDeviceFeatures } from '../harmony.js'
import {
  getProactiveChartSystemPrompt,
  prepareTurnLocalContext,
  type ReplyLocalContext,
} from '../localInfo.js'
import { DEFAULT_GENERATION, useSettings } from '../settings.js'
import {
  appendBranch,
  extractPathUpTo,
  getVisibleMessages,
  normalizeSession,
  removeSubtreeFromParent,
  selectVersion,
} from './branches.js'
import * as db from './db.js'
import {
  clearAllDrafts,
  clearDraft,
  clearSentDraft,
  getDraft,
  hasDraft,
  makeMessageDraft,
  prepareDraftMessage,
  restoreRecalledDraft,
  restoreSentDraft,
  transferDraft,
  type Draft,
} from './drafts.js'
import { expandBranchGroup, stripBranchSuffix } from './sessionGroups.js'
import {
  CHAT_SYSTEM_PROMPT,
  getInputTokens,
  getContextRejection,
  matchesRejectedDraft,
} from './context.js'
import { createLatestReminder } from './latestReminder.js'
import {
  applyEvent,
  canContinueReply,
  getContextRounds,
  getReplyText,
  settleReply,
  toRequestMessages,
} from './reply.js'
import { requestSuggestedQuestions } from './suggestedQuestions.js'
import { rememberFromTurn } from '../memory.js'
import { buildSystemPrompt, snapshotMemories } from '../personalization.js'
import {
  toSessionSummary,
  type AssistantMessage,
  type FileAttachment,
  type HistoryImportMode,
  type Message,
  type Session,
  type SessionSummary,
  type UserMessage,
} from './types.js'

/** deepseek-flash 同时支持深度思考与图片输入 */
const FLASH_MODEL: ChatModel = 'deepseek-flash'
/** 保留最近打开的详情；当前会话、生成中及尚未成功保存的会话不淘汰。 */
const SESSION_CACHE_LIMIT = 5
/** 服务端判定 file_id 失效后，重新补传并重发的最多次数（不含首次请求） */
const FILE_RETRY_LIMIT = 2
/** 退避基数，第 n 次重试等待 2^n 倍；连续失败达到上限就放弃，把原始报错展示出来 */
const FILE_RETRY_BASE_DELAY = 1000

const serverTools = (search: boolean, readLinks: boolean): CreateMessageRequest['tools'] => {
  const tools: CreateMessageRequest['tools'] = []
  if (readLinks) {
    tools.push({ type: 'deepseek_read_url', name: 'deepseek_read_url' })
  }
  if (search) {
    tools.push({ type: 'deepseek_web_search', name: 'deepseek_web_search' })
  }
  return tools
}

const replyDoneListeners = new Set<(session: Session, reply: AssistantMessage) => void>()

/** 订阅「回答已完成」，鸿蒙版据此在后台时发系统通知。 */
export const onReplyDone = (listener: (session: Session, reply: AssistantMessage) => void) => {
  replyDoneListeners.add(listener)
  return () => {
    replyDoneListeners.delete(listener)
  }
}

/** 允许自动补标题的请求；手动重命名后取消本轮标题写入，包含主动清空标题的情况。 */
const titleRequests = new Set<AbortController>()

type ChatState = {
  ready: boolean
  initError: boolean
  /** 历史导入或全部删除期间锁定交互，提交成功前仍展示原有记录。 */
  importingHistory: false | HistoryImportMode
  /** 仅列表元数据，按 updatedAt 降序；流式消息更新不会改变此数组。 */
  sessions: SessionSummary[]
  sessionCache: Record<string, Session>
  sessionLoadErrors: Record<string, boolean>
  sessionSaveErrors: Record<string, boolean>
  /** null 表示新对话（欢迎页） */
  activeId: string | null
  /** 正在生成回复的会话 */
  streaming: Record<string, AbortController>
  /** 新对话页的无痕开关：打开时下一条消息创建无痕会话 */
  incognito: boolean
}

export const useChatStore = create<ChatState>(() => ({
  ready: false,
  initError: false,
  importingHistory: false,
  sessions: [],
  sessionCache: {},
  sessionLoadErrors: {},
  sessionSaveErrors: {},
  activeId: null,
  streaming: {},
  incognito: false,
}))

const { getState: get, setState: set } = useChatStore

const sortSessions = (sessions: SessionSummary[]) =>
  [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

const getSession = (id: string) => {
  const cache = get().sessionCache
  return Object.hasOwn(cache, id) ? cache[id] : undefined
}

const getStreamController = (id: string) => {
  const streams = get().streaming
  return Object.hasOwn(streams, id) ? streams[id] : undefined
}

const sameSummary = (a: SessionSummary, b: SessionSummary) =>
  a.title === b.title &&
  a.createdAt === b.createdAt &&
  a.updatedAt === b.updatedAt &&
  a.branchGroupId === b.branchGroupId &&
  a.branchParentId === b.branchParentId &&
  a.branchNumber === b.branchNumber

const sessionAccess = new Map<string, number>()
const unsavedSessions = new Set<string>()
/** 保存失败时保留原件，重试成功后才释放。 */
const pendingFiles = new Map<string, db.StoredFile[]>()
const deletingSessions = new Set<string>()
const recallingSessions = new Set<string>()
const deletionTasks = new Set<Promise<boolean>>()
const streamFlushes = new Map<string, () => void>()
let accessSequence = 0
let historyEpoch = 0
let initTask: Promise<void> | undefined
const sessionLoads = new Map<string, { promise: Promise<void> }>()

const loadAttachment = async (sessionId: string, id: string) =>
  pendingFiles.get(sessionId)?.find((file) => file.id === id)?.blob ?? db.loadFile(id)

const touchSession = (id: string) => sessionAccess.set(id, ++accessSequence)

const trimSessionCache = () => {
  const state = get()
  const ids = Object.keys(state.sessionCache)
  if (ids.length <= SESSION_CACHE_LIMIT) {
    return
  }
  const removable = ids
    .filter(
      (id) =>
        id !== state.activeId &&
        !Object.hasOwn(state.streaming, id) &&
        !unsavedSessions.has(id) &&
        !deletingSessions.has(id)
    )
    .sort((a, b) => (sessionAccess.get(a) ?? 0) - (sessionAccess.get(b) ?? 0))
  const evicted = new Set(removable.slice(0, ids.length - SESSION_CACHE_LIMIT))
  for (const id of evicted) {
    sessionAccess.delete(id)
  }
  if (evicted.size > 0) {
    set({
      sessionCache: Object.fromEntries(
        Object.entries(state.sessionCache).filter(([id]) => !evicted.has(id))
      ),
    })
  }
}

const updateSession = (id: string, update: (session: Session) => Session) =>
  set((state) => {
    const previous = Object.hasOwn(state.sessionCache, id) ? state.sessionCache[id] : undefined
    if (!previous) {
      return state
    }
    const session = update(previous)
    if (session === previous) {
      return state
    }
    return {
      sessionCache: { ...state.sessionCache, [id]: session },
      sessions:
        sameSummary(previous, session) || session.ephemeral
          ? state.sessions
          : sortSessions(
              state.sessions.map((summary) =>
                summary.id === id ? toSessionSummary(session) : summary
              )
            ),
    }
  })

const updateReply = (sessionId: string, reply: AssistantMessage) =>
  updateSession(sessionId, (session) => ({
    ...session,
    messages: session.messages.map((message) =>
      message.id === reply.id
        ? { ...reply, parentId: message.parentId, selectedChildId: message.selectedChildId }
        : message
    ),
  }))

const persist = (sessionId: string) => {
  const session = getSession(sessionId)
  if (!session || session.ephemeral) {
    return undefined
  }
  unsavedSessions.add(sessionId)
  if (deletingSessions.has(sessionId)) {
    return undefined
  }
  const epoch = historyEpoch
  const files = pendingFiles.get(sessionId)
  return db
    .saveSession(session, files)
    .then(() => {
      if (epoch !== historyEpoch || !getSession(sessionId)) {
        return
      }
      if (pendingFiles.get(sessionId) === files) {
        pendingFiles.delete(sessionId)
      }
      if (getSession(sessionId) === session) {
        unsavedSessions.delete(sessionId)
        set((state) => ({
          sessionSaveErrors: Object.fromEntries(
            Object.entries(state.sessionSaveErrors).filter(([id]) => id !== sessionId)
          ),
        }))
        trimSessionCache()
      }
    })
    .catch((error: unknown) => {
      db.reportStorageError('save session')(error)
      if (epoch === historyEpoch && getSession(sessionId)) {
        set((state) => ({
          sessionSaveErrors: { ...state.sessionSaveErrors, [sessionId]: true },
        }))
      }
    })
}

export const retrySaveSessions = () => {
  if (!get().importingHistory) {
    unsavedSessions.forEach(persist)
  }
}

/** 离开前先合并尚未绘制的增量；隐藏期间浏览器可能暂停动画帧。 */
export const bindChatPersistence = () => {
  const save = () => {
    if (get().importingHistory === 'replace') {
      return
    }
    for (const [id, flush] of streamFlushes) {
      flush()
      persist(id)
    }
    for (const id of unsavedSessions) {
      if (!streamFlushes.has(id)) {
        persist(id)
      }
    }
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      save()
    } else if (get().importingHistory !== 'replace') {
      streamFlushes.forEach((flush) => flush())
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', save)
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', save)
  }
}

/** 按当前开关创建回复：深度思考对应 thinking，智能搜索控制 deepseek_web_search。 */
const createReply = (): AssistantMessage => {
  const { thinking, search, generation } = useSettings.getState()
  return {
    id: createId(),
    role: 'assistant',
    createdAt: Date.now(),
    model: generation.model,
    thinking,
    search,
    generation,
    prefix: true,
    status: 'pending',
    blocks: [],
  }
}

/** 仍在生成中的回复（页面关闭或导出时未结束）按「已停止」处理 */
const settleInterrupted = (session: Session): Session => {
  if (
    !session.messages.some(
      (m) => m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming')
    )
  ) {
    return session
  }
  return {
    ...session,
    messages: session.messages.map((m) =>
      m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming')
        ? settleReply(m, 'stopped', session.updatedAt)
        : m
    ),
  }
}

export const initChat = (): Promise<void> => {
  if (get().ready) {
    return Promise.resolve()
  }
  if (initTask) {
    return initTask
  }
  const epoch = historyEpoch
  set({ initError: false })
  initTask = (async () => {
    try {
      const summaries = await db.loadSessionSummaries()
      if (epoch === historyEpoch) {
        set({ ready: true, sessions: sortSessions(summaries) })
      }
    } catch (error) {
      if (epoch === historyEpoch) {
        set({ initError: true })
        db.reportStorageError('read local sessions')(error)
      }
    } finally {
      if (epoch === historyEpoch) {
        initTask = undefined
      }
    }
  })()
  return initTask
}

/** 同一会话合并并发读取；切换只改变 activeId，旧请求不会把界面切回去。 */
const ensureSessionLoaded = (id: string): Promise<void> => {
  if (getSession(id)) {
    return Promise.resolve()
  }
  const pending = sessionLoads.get(id)
  if (pending) {
    return pending.promise
  }
  const epoch = historyEpoch
  set((state) => ({ sessionLoadErrors: { ...state.sessionLoadErrors, [id]: false } }))
  const load = { promise: Promise.resolve() }
  sessionLoads.set(id, load)
  load.promise = (async () => {
    try {
      const stored = await db.loadSession(id)
      if (epoch !== historyEpoch || sessionLoads.get(id) !== load) {
        return
      }
      const summary = get().sessions.find((session) => session.id === id)
      if (!summary) {
        return
      }
      if (!stored) {
        throw new Error(`Session ${id} is missing from local storage`)
      }
      const settled = settleInterrupted(normalizeSession(stored))
      // 读取期间可能已在列表重命名，保留最新元数据，不能让旧读取覆盖它。
      const session = sameSummary(settled, summary) ? settled : { ...settled, ...summary }
      touchSession(id)
      set((state) => ({ sessionCache: { ...state.sessionCache, [id]: session } }))
      if (session !== stored) {
        persist(id)
      }
      trimSessionCache()
    } catch (error) {
      if (epoch === historyEpoch && sessionLoads.get(id) === load) {
        set((state) => ({ sessionLoadErrors: { ...state.sessionLoadErrors, [id]: true } }))
        db.reportStorageError('read session')(error)
      }
    } finally {
      if (sessionLoads.get(id) === load) {
        sessionLoads.delete(id)
      }
    }
  })()
  return load.promise
}

/** 等所有回复的收尾（落盘）完成 */
const waitForIdle = (sessionId?: string) =>
  new Promise<void>((resolve) => {
    const isIdle = (state: ChatState) =>
      sessionId === undefined
        ? Object.keys(state.streaming).length === 0
        : !Object.hasOwn(state.streaming, sessionId)
    if (isIdle(get())) {
      resolve()
      return
    }
    const unsubscribe = useChatStore.subscribe((state) => {
      if (isIdle(state)) {
        unsubscribe()
        resolve()
      }
    })
  })

/**
 * 先写入暂存，再原子合并或替换历史。替换前结束生成并释放旧会话状态。
 */
export const updateHistory = async (
  write: () => Promise<void>,
  mode: HistoryImportMode
): Promise<number> => {
  if (get().importingHistory) {
    throw new Error('History replacement is already in progress')
  }
  set({ importingHistory: mode })
  try {
    // 已开始的单条删除先同步到内存，避免本次替换失败后列表残留已被删除的记录。
    await Promise.all(deletionTasks)
    if (mode === 'replace') {
      for (const controller of Object.values(get().streaming)) {
        controller.abort()
      }
      historyEpoch += 1
      initTask = undefined
      sessionLoads.clear()
      await waitForIdle()
    } else {
      await initChat()
      if (!get().ready) {
        throw new Error('Existing chat history could not be loaded')
      }
    }
    await db.clearStaging()
    let summaries: SessionSummary[]
    try {
      await write()
      const { sessions, sessionCache } = get()
      const existingIds = new Set([...sessions.map(({ id }) => id), ...Object.keys(sessionCache)])
      summaries = await db.commitStaging(mode, existingIds)
    } catch (error) {
      await db.clearStaging().catch(db.reportStorageError('clear unfinished history replacement'))
      throw error
    }
    if (mode === 'merge') {
      set((state) => ({ sessions: sortSessions([...state.sessions, ...summaries]) }))
      return summaries.length
    }
    sessionAccess.clear()
    unsavedSessions.clear()
    pendingFiles.clear()
    clearAllDrafts()
    set({
      ready: true,
      initError: false,
      sessions: sortSessions(summaries),
      sessionCache: {},
      sessionLoadErrors: {},
      sessionSaveErrors: {},
      activeId: null,
    })
    return summaries.length
  } finally {
    set({ importingHistory: false })
    retrySaveSessions()
    const { activeId, ready } = get()
    // 替换失败时恢复被取消的详情读取，原有记录继续可用。
    if (activeId !== null) {
      void ensureSessionLoaded(activeId)
    } else if (!ready) {
      void initChat()
    }
  }
}

/** 离开无痕对话后立即丢弃：停止生成，移出内存，释放附件原件和草稿。 */
const discardEphemeral = () => {
  const { sessionCache, activeId } = get()
  const discarded = Object.values(sessionCache).filter(
    (session) => session.ephemeral && session.id !== activeId
  )
  if (discarded.length === 0) {
    return
  }
  const ids = new Set(discarded.map((session) => session.id))
  for (const session of discarded) {
    getStreamController(session.id)?.abort()
    sessionAccess.delete(session.id)
    clearDraft(session.id)
    db.forgetFilesInMemory(
      session.messages.flatMap((message) =>
        message.role === 'user' ? message.files.map((file) => file.id) : []
      )
    )
  }
  set((state) => ({
    sessionCache: Object.fromEntries(
      Object.entries(state.sessionCache).filter(([id]) => !ids.has(id))
    ),
  }))
}

export const isEphemeralActive = () => getSession(get().activeId ?? '')?.ephemeral === true

/** 切换新对话页的无痕开关；只影响下一次新建的对话。 */
export const setIncognito = (incognito: boolean) => {
  if (!get().importingHistory) {
    set({ incognito })
  }
}

export const newChat = () => {
  if (!get().importingHistory) {
    set({ activeId: null })
    discardEphemeral()
    trimSessionCache()
  }
}

const createEmptySession = (now: number, incognito: boolean): Session => ({
  id: createId(),
  title: '',
  createdAt: now,
  updatedAt: now,
  messages: [],
  rootMessageId: null,
  ...(incognito ? { ephemeral: true as const } : {}),
})

const openEmptySession = (session: Session) => {
  touchSession(session.id)
  set((state) => ({
    sessions: session.ephemeral ? state.sessions : [toSessionSummary(session), ...state.sessions],
    sessionCache: { ...state.sessionCache, [session.id]: session },
    activeId: session.id,
  }))
}

/** 将当前草稿交给空白对话。已有新对话草稿时保留它，另开一个会话接收。 */
export const carryDraftToNewChat = async (sessionId: string): Promise<boolean> => {
  const session = getSession(sessionId)
  const canMove = () =>
    get().activeId === sessionId &&
    !get().importingHistory &&
    !deletingSessions.has(sessionId) &&
    !getStreamController(sessionId)
  if (!session || !canMove()) {
    return false
  }
  const source = getDraft(sessionId)
  let draft = source
  if (!hasDraft(source)) {
    const question = getContextRejection(getVisibleMessages(session))?.question
    if (!question) {
      return false
    }
    const epoch = historyEpoch
    const apiKey = useSettings.getState().apiKey
    const files = await Promise.all(
      question.files.map(async (metadata) => ({
        metadata,
        blob: await loadAttachment(sessionId, metadata.id),
      }))
    ).catch(() => null)
    if (
      !files ||
      !files.every((file): file is { metadata: FileAttachment; blob: Blob } => !!file.blob) ||
      !canMove() ||
      epoch !== historyEpoch ||
      getDraft(sessionId) !== source ||
      getContextRejection(getVisibleMessages(getSession(sessionId) ?? session))?.question !==
        question ||
      useSettings.getState().apiKey !== apiKey ||
      (!apiKey && files.some(({ metadata }) => !metadata.serverId))
    ) {
      return false
    }
    draft = makeMessageDraft(question.content, files, apiKey ?? '')
  }
  const incognito = session.ephemeral === true
  const empty = hasDraft(getDraft(null)) ? createEmptySession(Date.now(), incognito) : null
  transferDraft(sessionId, empty?.id ?? null, draft)
  if (empty) {
    openEmptySession(empty)
    persist(empty.id)
    discardEphemeral()
    trimSessionCache()
  } else {
    set({ incognito })
    newChat()
  }
  return true
}

export const selectSession = (id: string) => {
  const summary = get().sessions.find((session) => session.id === id)
  if (!get().importingHistory && summary) {
    if (summary.branchGroupId) {
      expandBranchGroup(summary.branchGroupId)
    }
    touchSession(id)
    // 打开已保存的对话即退出无痕模式。
    set({ activeId: id, incognito: false })
    discardEphemeral()
    void ensureSessionLoaded(id)
    trimSessionCache()
  }
}

export const renameSession = (id: string, title: string) => {
  if (get().importingHistory || deletingSessions.has(id)) {
    return
  }
  const controller = getStreamController(id)
  if (controller) {
    titleRequests.delete(controller)
  }
  if (getSession(id)) {
    updateSession(id, (session) => ({ ...session, title }))
    persist(id)
  } else {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id ? { ...session, title } : session
      ),
    }))
    void db.renameSession(id, title).catch(db.reportStorageError('rename session'))
  }
}

/**
 * 删除会话；本地原件仅在没有其他会话引用时清理。远端文件不删：导入、编辑、重新生成都会复用同一个附件，
 * 同一服务端文件可能被多个会话引用，不维护引用计数。
 */
export const removeSession = (id: string): Promise<boolean> => {
  const task = removeSessionData(id).finally(() => deletionTasks.delete(task))
  deletionTasks.add(task)
  return task
}

const removeSessionData = async (id: string): Promise<boolean> => {
  if (get().importingHistory || deletingSessions.has(id)) {
    return false
  }
  const epoch = historyEpoch
  deletingSessions.add(id)
  try {
    getStreamController(id)?.abort()
    // 等本会话的流收尾，避免删除之后又被收尾保存写回来。
    await waitForIdle(id)
    if (epoch !== historyEpoch) {
      return false
    }
    await db.deleteSession(id)
    if (epoch !== historyEpoch) {
      return true
    }
    sessionLoads.delete(id)
    sessionAccess.delete(id)
    unsavedSessions.delete(id)
    pendingFiles.delete(id)
    clearDraft(id)
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== id),
      sessionCache: Object.fromEntries(
        Object.entries(state.sessionCache).filter(([key]) => key !== id)
      ),
      sessionLoadErrors: Object.fromEntries(
        Object.entries(state.sessionLoadErrors).filter(([key]) => key !== id)
      ),
      sessionSaveErrors: Object.fromEntries(
        Object.entries(state.sessionSaveErrors).filter(([key]) => key !== id)
      ),
      activeId: state.activeId === id ? null : state.activeId,
    }))
    return true
  } catch (error) {
    db.reportStorageError('delete session')(error)
    return false
  } finally {
    deletingSessions.delete(id)
    // 删除失败时保留会话，并保存停止生成后的最新状态。
    if (getSession(id)) {
      if (get().importingHistory) {
        unsavedSessions.add(id)
      } else {
        persist(id)
      }
    }
  }
}

export const stopReply = (sessionId: string) => getStreamController(sessionId)?.abort()

/**
 * 撤回最后一条提问及对应回答：正在生成时先停止生成，
 * 将提问文字与附件恢复为可编辑草稿，并从本机对话与后续请求上下文中移除该轮。
 */
export const recallLastTurn = async (
  sessionId: string
): Promise<{ ok: boolean; missingFiles?: boolean }> => {
  if (
    get().importingHistory ||
    deletingSessions.has(sessionId) ||
    recallingSessions.has(sessionId) ||
    !getSession(sessionId)
  ) {
    return { ok: false }
  }
  const epoch = historyEpoch
  recallingSessions.add(sessionId)
  try {
    if (getStreamController(sessionId)) {
      stopReply(sessionId)
      await waitForIdle(sessionId)
    }
    if (epoch !== historyEpoch || get().importingHistory || deletingSessions.has(sessionId)) {
      return { ok: false }
    }
    const current = getSession(sessionId)
    if (!current || getStreamController(sessionId)) {
      return { ok: false }
    }
    const path = getVisibleMessages(current)
    const last = path.at(-1)
    const questionIndex =
      last?.role === 'assistant' ? path.length - 2 : last?.role === 'user' ? path.length - 1 : -1
    const question = questionIndex >= 0 ? path[questionIndex] : undefined
    if (question?.role !== 'user') {
      return { ok: false }
    }
    const parentId = path[questionIndex - 1]?.id ?? null
    const loadedFiles = (
      await Promise.all(
        question.files.map(async (metadata) => {
          const blob = await loadAttachment(sessionId, metadata.id).catch(() => undefined)
          return blob ? { metadata, blob } : null
        })
      )
    ).filter((item): item is { metadata: FileAttachment; blob: Blob } => item !== null)
    const missingFiles = loadedFiles.length < question.files.length
    if (
      epoch !== historyEpoch ||
      get().importingHistory ||
      deletingSessions.has(sessionId) ||
      getStreamController(sessionId)
    ) {
      return { ok: false }
    }
    const latest = getSession(sessionId)
    if (!latest || getVisibleMessages(latest)[questionIndex]?.id !== question.id) {
      return { ok: false }
    }
    const recalledDraft = makeMessageDraft(
      question.content,
      loadedFiles,
      useSettings.getState().apiKey ?? ''
    )
    updateSession(sessionId, (session) => ({
      ...removeSubtreeFromParent(session, parentId),
      updatedAt: Date.now(),
    }))
    restoreRecalledDraft(sessionId, recalledDraft)
    persist(sessionId)
    return { ok: true, missingFiles }
  } finally {
    recallingSessions.delete(sessionId)
  }
}

/**
 * 从选中的回答创建独立分支对话，带上当前路径中从开头到该回答的记录。
 * 原对话与派生出的所有分支归入同一分支对话组并自动展开。
 */
export const forkSessionFromMessage = (
  sessionId: string,
  messageId: string
): { id: string; title: string } | null => {
  if (get().importingHistory || deletingSessions.has(sessionId) || getStreamController(sessionId)) {
    return null
  }
  const source = getSession(sessionId)
  if (!source || source.ephemeral) {
    return null
  }
  const messages = extractPathUpTo(source, messageId)
  if (!messages || messages.at(-1)?.role !== 'assistant') {
    return null
  }
  const groupId = source.branchGroupId ?? source.id
  const state = get()
  const groupMembers = state.sessions.filter(
    (item) => item.branchGroupId === groupId || item.id === source.id
  )
  const root =
    groupMembers.find((item) => item.id === groupId && !item.branchParentId) ??
    groupMembers.find((item) => !item.branchParentId)
  const rawBaseTitle = root?.title || stripBranchSuffix(source.title)
  const baseTitle = rawBaseTitle || translate('untitledChat')
  const existingTitles = new Set(groupMembers.map((item) => item.title))
  let branchNumber = Math.max(0, ...groupMembers.map((item) => item.branchNumber ?? 0)) + 1
  let title = translate('branchSessionTitle', { title: baseTitle, index: branchNumber })
  while (existingTitles.has(title)) {
    branchNumber += 1
    title = translate('branchSessionTitle', { title: baseTitle, index: branchNumber })
  }

  const now = Date.now()
  const branched: Session = {
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages,
    rootMessageId: messages[0]?.id ?? null,
    branchGroupId: groupId,
    branchParentId: source.id,
    branchNumber,
    ...(source.memorySnapshot ? { memorySnapshot: source.memorySnapshot } : {}),
  }

  const referencedFileIds = new Set(
    messages.flatMap((message) =>
      message.role === 'user' ? message.files.map((file) => file.id) : []
    )
  )
  const sourcePending = pendingFiles.get(source.id)
  if (sourcePending && referencedFileIds.size > 0) {
    const inherited = sourcePending.filter((file) => referencedFileIds.has(file.id))
    if (inherited.length > 0) {
      pendingFiles.set(branched.id, inherited)
    }
  }

  if (!source.branchGroupId) {
    updateSession(source.id, (current) => ({ ...current, branchGroupId: groupId }))
    persist(source.id)
  }

  touchSession(branched.id)
  expandBranchGroup(groupId)
  set((current) => ({
    sessions: sortSessions([toSessionSummary(branched), ...current.sessions]),
    sessionCache: { ...current.sessionCache, [branched.id]: branched },
    activeId: branched.id,
    incognito: false,
  }))
  persist(branched.id)
  discardEphemeral()
  trimSessionCache()
  return { id: branched.id, title: branched.title }
}

/**
 * 提交指定会话的最新草稿；null 表示新建会话。
 * 同步接收成功才清空草稿，附件原件由会话接管；保存失败仍通过保存入口重试。
 */
export const sendMessage = (targetSessionId: string | null) => {
  if (get().importingHistory || !get().ready) {
    return false
  }
  const draft = getDraft(targetSessionId)
  const prepared = prepareDraftMessage(draft, useUploads.getState().tasks)
  if (!prepared) {
    return false
  }
  const { text, files } = prepared
  const now = Date.now()
  let sessionId = targetSessionId
  if (
    sessionId !== null &&
    (deletingSessions.has(sessionId) || getStreamController(sessionId) || !getSession(sessionId))
  ) {
    return false
  }
  if (sessionId === null) {
    const session = createEmptySession(now, get().incognito)
    sessionId = session.id
    openEmptySession(session)
  }
  const current = getSession(sessionId)
  if (!current) {
    return false
  }
  const history = getVisibleMessages(current)
  if (matchesRejectedDraft(draft, getContextRejection(history), useSettings.getState())) {
    return false
  }
  const question: UserMessage = {
    id: createId(),
    role: 'user',
    content: text,
    files: files.map(({ id, serverId, imageSizeChecked, name, size, isImage, mimeType }) => ({
      id,
      serverId,
      imageSizeChecked,
      name,
      size,
      isImage,
      mimeType,
    })),
    createdAt: now,
  }
  const reply = createReply()
  updateSession(sessionId, (session) => ({
    ...appendBranch(session, history.at(-1)?.id ?? null, [question, reply]),
    updatedAt: now,
  }))
  if (files.length > 0 && current.ephemeral) {
    db.keepFilesInMemory(files.map(({ id, blob }) => ({ id, blob })))
  } else if (files.length > 0) {
    pendingFiles.set(sessionId, [
      ...(pendingFiles.get(sessionId) ?? []),
      ...files.map(({ id, blob }) => ({ id, blob })),
    ])
  }
  persist(sessionId)
  clearSentDraft(targetSessionId)
  void streamReply(sessionId, reply, { history, question, draft })
  return true
}

/** 重新生成当前路径上的回答：在原问题下新增版本，不覆盖旧回答和后续对话。 */
export const regenerateReply = (sessionId: string, messageId?: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return
  }
  const path = getVisibleMessages(session)
  const index =
    messageId === undefined ? path.length - 1 : path.findIndex((m) => m.id === messageId)
  const question = path[index - 1]
  if (question?.role !== 'user' || path[index]?.role !== 'assistant') {
    return
  }
  const history = path.slice(0, index - 1)
  const reply = createReply()
  updateSession(sessionId, (s) => ({
    ...appendBranch(s, question.id, [reply]),
    updatedAt: Date.now(),
  }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history, question })
}

/** 编辑提问后新增同父版本，保留原文件；旧问题的所有回答与后续对话仍可切回。 */
export const editMessage = (sessionId: string, messageId: string, content: string): boolean => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return false
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return false
  }
  const path = getVisibleMessages(session)
  const index = path.findIndex((message) => message.id === messageId)
  const previous = path[index]
  const text = content.trim()
  if (previous?.role !== 'user' || (!text && previous.files.length === 0)) {
    return false
  }
  const question: UserMessage = {
    id: createId(),
    role: 'user',
    content: text,
    files: previous.files,
    createdAt: Date.now(),
  }
  const reply = createReply()
  updateSession(sessionId, (s) => ({
    ...appendBranch(s, path[index - 1]?.id ?? null, [question, reply]),
    updatedAt: Date.now(),
  }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, index), question })
  return true
}

export const selectMessageVersion = (sessionId: string, messageId: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  if (getStreamController(sessionId)) {
    return
  }
  updateSession(sessionId, (session) => selectVersion(session, messageId))
  persist(sessionId)
}

/** 继续最后一条未完成的回答：保留原消息与开关，仅将新流的内容追加到原块之后。 */
export const continueReply = (sessionId: string, messageId: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return
  }
  const path = getVisibleMessages(session)
  const question = path.at(-2)
  const previous = path.at(-1)
  if (
    question?.role !== 'user' ||
    previous?.role !== 'assistant' ||
    previous.id !== messageId ||
    !canContinueReply(previous)
  ) {
    return
  }
  const { thinking, search } = useSettings.getState()
  const reply: AssistantMessage = {
    ...previous,
    // 未记录请求配置的回复，续写时使用默认模型和当前开关。
    model: previous.model ?? FLASH_MODEL,
    thinking: previous.thinking ?? thinking,
    search: previous.search ?? search,
    status: 'pending',
    stopReason: undefined,
    stopDetails: undefined,
    error: undefined,
  }
  updateReply(sessionId, reply)
  updateSession(sessionId, (s) => ({ ...s, updatedAt: Date.now() }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, -2), question, prefix: previous })
}

/** 附件补传失败后重试：保留原回答位置，重新补传并请求 */
export const retryUpload = (sessionId: string, messageId: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return
  }
  const path = getVisibleMessages(session)
  const index = path.findIndex((message) => message.id === messageId)
  const question = path[index - 1]
  const previous = path[index]
  if (
    question?.role !== 'user' ||
    previous?.role !== 'assistant' ||
    previous.error?.kind !== 'upload'
  ) {
    return
  }
  const reply: AssistantMessage = { ...previous, status: 'pending', error: undefined }
  updateReply(sessionId, reply)
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, index - 1), question })
}

type Request = {
  history: Message[]
  question: UserMessage
  prefix?: AssistantMessage
  draft?: Draft
}

/** 将已检查或补传得到的 ID 写回同一附件的所有引用，超限旧 ID 用 null 清除。 */
const saveServerIds = (sessionId: string, serverIds: ReadonlyMap<string, string | null>) => {
  if (serverIds.size === 0) {
    return
  }
  updateSession(sessionId, (session) => ({
    ...session,
    messages: session.messages.map((message) =>
      message.role === 'user' && message.files.some((file) => serverIds.has(file.id))
        ? {
            ...message,
            files: message.files.map((file) => {
              const serverId = serverIds.get(file.id)
              return serverId === undefined
                ? file
                : {
                    ...file,
                    serverId,
                    imageSizeChecked: (file.isImage && serverId !== null) || undefined,
                  }
            }),
          }
        : message
    ),
  }))
  persist(sessionId)
}

/** 只检查本次进入上下文的旧图。没有可读原件时仍可复用旧 ID。 */
const checkLegacyImageIds = async (sessionId: string, request: Request, signal: AbortSignal) => {
  const files = [
    ...request.question.files,
    ...getContextRounds(request.history).flatMap(([user]) => user.files),
  ]
  const unchecked = new Map<string, string>()
  for (const file of files) {
    if (file.isImage && file.serverId && !file.imageSizeChecked) {
      unchecked.set(file.id, file.serverId)
    }
  }
  const checked = new Map<string, string | null>()
  for (const [id, serverId] of unchecked) {
    signal.throwIfAborted()
    const oversized = await loadAttachment(sessionId, id)
      .then((blob) => blob && isUploadImageOversized(blob))
      .catch(() => undefined)
    if (oversized !== undefined) {
      checked.set(id, oversized ? null : serverId)
    }
  }
  return checked
}

/**
 * 附件的服务端 id：已有直接用；正在上传的等待同一任务；否则读取本地原件补传。
 * 本地也没有原件（导入的文档附件只有元数据）时返回 null，该附件只展示、不进入请求。
 */
const ensureServerId = async (
  sessionId: string,
  apiKey: string,
  file: FileAttachment
): Promise<string | null> => {
  if (file.serverId) {
    return file.serverId
  }
  const task = useUploads.getState().tasks[file.id]
  if (task?.status === 'done' && (!file.isImage || task.imageSizeChecked)) {
    return task.serverId
  }
  const blob = await loadAttachment(sessionId, file.id)
  if (!blob) {
    return null
  }
  return uploadAttachment(apiKey, file.id, blob, file.name, file.isImage)
}

/** 用会话里的最新消息替换请求快照：重传前会重置附件的 serverId，快照必须跟着更新 */
const refreshRequest = (sessionId: string, request: Request): Request => {
  const session = getSession(sessionId)
  if (!session) {
    return request
  }
  const byId = new Map(session.messages.map((message) => [message.id, message]))
  const pick = <T extends Message>(message: T): T =>
    (byId.get(message.id) as T | undefined) ?? message
  return {
    history: request.history.map(pick),
    question: pick(request.question),
    prefix: request.prefix,
  }
}

/**
 * 发送前补齐附件的 serverId。
 * - 本轮提问的附件并行补齐，任一失败则整体失败，已成功的照常写回，重试时复用成功结果；
 * - 历史轮次（仅进入上下文的）中没有 serverId 的附件，多为导入的图片：从最新的消息往前逐张补传，
 *   失败静默跳过，该附件不进入本次请求，下次发送时再试。
 */
const prepareFiles = async (sessionId: string, request: Request, signal: AbortSignal) => {
  const epoch = historyEpoch
  // 服务端判定 file_id 失效时会清掉会话里的 serverId，先用最新消息替换请求快照，
  // 否则快照里仍是旧 id，补传会直接复用它。
  request = refreshRequest(sessionId, request)
  const apiKey = useSettings.getState().apiKey ?? ''
  const serverIds = new Map<string, string>()
  // 停止生成立即生效；上传本身不取消（输入框与其他消息可能共用同一任务），完成后照常写回 serverId
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const checked = await Promise.race([checkLegacyImageIds(sessionId, request, signal), aborted])
  signal.throwIfAborted()
  if (checked.size > 0) {
    const tasks = useUploads.getState().tasks
    for (const [id, serverId] of checked) {
      if (serverId === null && tasks[id]?.status === 'done' && !tasks[id].imageSizeChecked) {
        cancelUpload(id)
      }
    }
    saveServerIds(sessionId, checked)
    request = refreshRequest(sessionId, request)
  }
  const uploads = Promise.allSettled(
    request.question.files.map(async (file) => {
      const serverId = await ensureServerId(sessionId, apiKey, file)
      if (serverId && serverId !== file.serverId) {
        serverIds.set(file.id, serverId)
      }
    })
  )
  void uploads.then(() => {
    if (epoch === historyEpoch) {
      saveServerIds(sessionId, serverIds)
    }
  })
  const results = await Promise.race([uploads, aborted])
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) {
    throw failed.reason
  }

  const pending = new Map<string, FileAttachment>()
  for (const [user] of getContextRounds(request.history).toReversed()) {
    for (const file of user.files) {
      if (!file.serverId && !serverIds.has(file.id) && !pending.has(file.id)) {
        pending.set(file.id, file)
      }
    }
  }
  for (const file of pending.values()) {
    signal.throwIfAborted()
    try {
      const serverId = await Promise.race([ensureServerId(sessionId, apiKey, file), aborted])
      if (serverId) {
        serverIds.set(file.id, serverId)
        saveServerIds(sessionId, new Map([[file.id, serverId]]))
      }
    } catch {
      signal.throwIfAborted()
    }
  }

  // 用补齐后的会话重新取历史与提问，保证请求里都是 serverId
  const session = getSession(sessionId)
  const resolve = <T extends Message>(message: T): T =>
    (session?.messages.find((m) => m.id === message.id) as T | undefined) ?? message
  return {
    history: request.history.map(resolve),
    question: resolve(request.question),
    prefix: request.prefix,
  }
}

/** 本次请求实际会用到的服务端 file_id */
const collectServerFileIds = (request: Request): Set<string> => {
  const ids = new Set<string>()
  const add = (files: FileAttachment[]) => {
    for (const file of files) {
      if (file.serverId) {
        ids.add(file.serverId)
      }
    }
  }
  add(request.question.files)
  for (const [user] of getContextRounds(request.history)) {
    add(user.files)
  }
  return ids
}

/**
 * 服务端判定 file_id 失效时，清掉对应附件的 serverId 并丢弃旧的上传任务，
 * 下一次补齐会重新读取本地原件上传。报错里点名了 file_id 就只重置这些，
 * 没点名（如 invalid file_id）则重置本次请求用到的全部附件。
 */
const reuploadInvalidatedFiles = (sessionId: string, request: Request, error: unknown): boolean => {
  if (!(error instanceof ApiError) || !getFileErrorCode(error)) {
    return false
  }
  const mentioned = extractFileIds(error.message)
  // 重试时原始快照里还是上一轮已被清掉的 serverId，先换成会话里的最新消息
  const targets =
    mentioned.length > 0
      ? new Set(mentioned)
      : collectServerFileIds(refreshRequest(sessionId, request))
  const session = getSession(sessionId)
  if (targets.size === 0 || !session) {
    return false
  }
  const localIds: string[] = []
  const messages = session.messages.map((message) => {
    if (message.role !== 'user') {
      return message
    }
    let changed = false
    const files = message.files.map((file) => {
      if (!file.serverId || !targets.has(file.serverId)) {
        return file
      }
      localIds.push(file.id)
      changed = true
      return { ...file, serverId: null, imageSizeChecked: undefined }
    })
    return changed ? { ...message, files } : message
  })
  if (localIds.length === 0) {
    return false
  }
  updateSession(sessionId, (current) => ({ ...current, messages }))
  // 上传任务里可能还留着同一个失效的 serverId，清掉后 ensureServerId 才会重新上传
  localIds.forEach(cancelUpload)
  persist(sessionId)
  return true
}

/** 重传前的退避等待；停止生成时立即返回，由调用方按已停止收尾 */
const waitForRetry = (attempt: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    function onAbort() {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(
      () => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      },
      FILE_RETRY_BASE_DELAY * 2 ** attempt
    )
    signal.addEventListener('abort', onAbort, { once: true })
  })

const suggestQuestions = (sessionId: string, question: string, reply: AssistantMessage) => {
  const { apiKey, locale, suggestedQuestions } = useSettings.getState()
  if (
    !suggestedQuestions ||
    !apiKey ||
    reply.status !== 'done' ||
    reply.stopReason !== 'end_turn' ||
    reply.blocks.some((block) => block.type === 'text' && block.isTemplate) ||
    document.visibilityState !== 'visible'
  ) {
    return
  }
  const answer = getReplyText(reply).trim()
  if (!answer) {
    return
  }

  const currentReply = () => {
    const state = get()
    const session = getSession(sessionId)
    if (
      state.activeId !== sessionId ||
      state.importingHistory ||
      getStreamController(sessionId) ||
      !session
    ) {
      return undefined
    }
    const last = getVisibleMessages(session).at(-1)
    return last?.role === 'assistant' && last.id === reply.id ? last : undefined
  }
  if (!currentReply()) {
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  const stopOnSettings = useSettings.subscribe((state) => {
    if (!state.suggestedQuestions || state.apiKey !== apiKey) {
      controller.abort()
    }
  })
  const stopOnChat = useChatStore.subscribe((state, previous) => {
    if (
      state.activeId !== sessionId ||
      state.importingHistory ||
      state.streaming[sessionId] ||
      (state.sessionCache[sessionId] !== previous.sessionCache[sessionId] && !currentReply())
    ) {
      controller.abort()
    }
  })
  void requestSuggestedQuestions(apiKey, locale, question, answer, controller.signal)
    .then((questions) => {
      const latest = currentReply()
      if (!controller.signal.aborted && latest && questions.length > 0) {
        updateReply(sessionId, { ...latest, suggestedQuestions: questions })
        persist(sessionId)
      }
    })
    .catch(() => {
      // 建议生成失败不改变回答状态，也不显示聊天报错。
    })
    .finally(() => {
      clearTimeout(timeout)
      stopOnSettings()
      stopOnChat()
    })
}

/**
 * 请求并消费流：先补齐附件的 serverId，再发请求；流式增量按动画帧刷新内存，完成、失败或停止后落盘。
 * 补传失败时回复记为 upload 错误，可重试。
 * 服务端判定 file_id 失效时重新补传后重发，退避重试且次数有上限，超过则按原始报错收尾。
 */
const streamReply = async (sessionId: string, initial: AssistantMessage, request: Request) => {
  const generation = initial.generation ?? {
    ...DEFAULT_GENERATION,
    model: initial.model ?? FLASH_MODEL,
  }
  const controller = new AbortController()
  if (!getSession(sessionId)?.title) {
    titleRequests.add(controller)
  }
  set((state) => ({ streaming: { ...state.streaming, [sessionId]: controller } }))
  let reply = initial
  let frame = 0
  const flush = () => {
    cancelAnimationFrame(frame)
    frame = 0
    updateReply(sessionId, reply)
  }
  streamFlushes.set(sessionId, flush)

  try {
    const session = getSession(sessionId)
    const memory = session?.ephemeral ? false : (session?.memorySnapshot ?? snapshotMemories())
    if (memory && !session?.memorySnapshot) {
      updateSession(sessionId, (current) =>
        current.memorySnapshot ? current : { ...current, memorySnapshot: memory }
      )
    }
    const initialSettings = useSettings.getState()
    const system = buildSystemPrompt(CHAT_SYSTEM_PROMPT, {
      memory,
      extra: initialSettings.proactiveCharts
        ? getProactiveChartSystemPrompt(initialSettings.locale)
        : undefined,
    })
    /** 阅读链接按本轮设置开启；长输入回退时可在本次发送中关闭 */
    let readLinks = generation.readLinks
    /** 本轮提问是否含链接；含链接时不能为长输入关闭阅读链接 */
    let questionHasLink = false
    /** 首次发送前解析按需定位与本地结构化信息，重试和续写沿用同一份结果。 */
    let resolvedLocal:
      | { locationOverride: string | null; autoSearch: boolean; localContext?: ReplyLocalContext }
      | undefined
    for (let attempt = 0; ; attempt += 1) {
      /** 附件补齐前出错属于上传失败，请求还没有发出 */
      let preparing = true
      let receivedContent = false
      try {
        const prepared = await prepareFiles(sessionId, request, controller.signal)
        preparing = false
        if (!resolvedLocal) {
          if (prepared.prefix) {
            resolvedLocal = {
              locationOverride: null,
              autoSearch: false,
              localContext: prepared.prefix.localContext,
            }
          } else {
            const settings = useSettings.getState()
            resolvedLocal = await prepareTurnLocalContext({
              text: prepared.question.content,
              files: prepared.question.files,
              locale: settings.locale,
              manualLocation: __HARMONY_APP__ ? null : settings.location,
              autoLocation: settings.autoLocation,
              autoLocalInfo: settings.autoLocalInfo,
              proactiveCharts: settings.proactiveCharts,
              deviceLocationSupported: useDeviceFeatures.getState().location,
              searchAlreadyOn: Boolean(initial.search),
              signal: controller.signal,
            })
          }
        }
        // 附件就绪后获取本轮信息；续写沿用原回答快照，重新生成的快照独立保存。
        const latestReminder = prepared.prefix
          ? prepared.prefix.latestReminder
          : createLatestReminder({
              ...useSettings.getState(),
              locationOverride: resolvedLocal.locationOverride,
            })
        const messages = toRequestMessages(
          prepared.history,
          prepared.question,
          prepared.prefix,
          initial.thinking ?? false,
          latestReminder,
          readLinks,
          resolvedLocal.localContext?.turnContext
        )
        questionHasLink = /https?:\/\//i.test(prepared.question.content)
        const effectiveSearch = Boolean(initial.search || resolvedLocal.autoSearch)
        const preferredModel = prepared.prefix?.model ?? generation.model
        // 附件和联网工具使用 Flash。阅读链接开启时，纯文本请求仍可选 Pro。
        const needsFlash =
          effectiveSearch ||
          (readLinks && questionHasLink) ||
          messages.some((message) =>
            message.role === 'user'
              ? Array.isArray(message.content) &&
                message.content.some((block) => block.type !== 'text')
              : message.role === 'assistant' &&
                message.content.some((block) => block.type === 'server_tool_use')
          )
        const model = needsFlash ? FLASH_MODEL : preferredModel
        reply = {
          ...reply,
          model,
          latestReminder,
          ...(resolvedLocal.localContext ? { localContext: resolvedLocal.localContext } : {}),
        }
        updateReply(sessionId, reply)
        persist(sessionId)
        const events = streamMessage(
          useSettings.getState().apiKey ?? '',
          {
            model,
            system,
            messages,
            thinking: { type: initial.thinking ? 'enabled' : 'disabled' },
            ...(initial.thinking && generation.effort
              ? { output_config: { effort: generation.effort } }
              : {}),
            ...(generation.maxTokens ? { max_tokens: generation.maxTokens } : {}),
            tools: serverTools(effectiveSearch, readLinks && model === FLASH_MODEL),
            ...(titleRequests.has(controller) ? { title: { enabled: true } } : {}),
          },
          controller.signal
        )
        const blockIndexes = new Map<number, number>()
        let firstTextHapticSent = false
        const activeThinkingBlocks = new Set<number>()
        for await (const event of events) {
          receivedContent ||= event.type === 'content_block_start'
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
              activeThinkingBlocks.add(event.index)
            } else if (
              !firstTextHapticSent &&
              event.delta.type === 'text_delta' &&
              event.delta.text &&
              get().activeId === sessionId
            ) {
              firstTextHapticSent = true
              triggerDeviceHaptic('reply-first-token')
            }
          } else if (
            event.type === 'content_block_stop' &&
            activeThinkingBlocks.delete(event.index) &&
            get().activeId === sessionId
          ) {
            triggerDeviceHaptic('thinking-done')
          }
          if (
            event.type === 'message_delta' &&
            (event.delta.stop_reason === 'end_turn' || event.delta.stop_reason === 'max_tokens') &&
            event.delta.title?.trim() &&
            titleRequests.has(controller) &&
            !controller.signal.aborted &&
            get().importingHistory !== 'replace'
          ) {
            const title = event.delta.title.trim()
            updateSession(sessionId, (session) => (session.title ? session : { ...session, title }))
            titleRequests.delete(controller)
          }
          reply = applyEvent(reply, event, Date.now(), blockIndexes)
          if (reply.stopReason === 'context_window_exceeded') {
            throw new ApiError('stream', '', undefined, 'context_window_exceeded')
          }
          if (event.type === 'message_start' && event.message.usage && !request.prefix) {
            reply = { ...reply, contextInputTokens: getInputTokens(event.message.usage) }
          }
          if (document.visibilityState !== 'hidden') {
            frame ||= requestAnimationFrame(flush)
          }
        }
        reply = settleReply(reply, 'done', Date.now())
        break
      } catch (error) {
        if (controller.signal.aborted) {
          reply = settleReply(reply, 'stopped', Date.now())
          break
        }
        if (preparing) {
          reply = settleReply(reply, 'error', Date.now(), {
            kind: 'upload',
            message: '',
            localMessage: describeUploadError(error),
            retryable: isRetryableApiError(error),
          })
          break
        }
        // 长输入不能同时生成标题、自动搜索或启用阅读链接：本轮去掉标题与自动本地搜索，
        // 提问不含链接时也关闭阅读链接，重发一次。这次重发不占用附件补传的重试次数。
        const dropReadLinks = readLinks && !questionHasLink
        const dropAutoSearch = resolvedLocal?.autoSearch === true
        if (
          !receivedContent &&
          (titleRequests.has(controller) || dropReadLinks || dropAutoSearch) &&
          isUserInputTooLong(error)
        ) {
          titleRequests.delete(controller)
          readLinks &&= !dropReadLinks
          if (dropAutoSearch && resolvedLocal) {
            resolvedLocal = {
              ...resolvedLocal,
              autoSearch: false,
              localContext: resolvedLocal.localContext
                ? { ...resolvedLocal.localContext, autoSearch: false }
                : undefined,
            }
          }
          attempt -= 1
          continue
        }
        // 附件失效：重新补传后重发。收到过内容块（含丢弃的客户端工具）后不自动重发。
        if (
          attempt < FILE_RETRY_LIMIT &&
          !receivedContent &&
          reuploadInvalidatedFiles(sessionId, request, error)
        ) {
          await waitForRetry(attempt, controller.signal)
          if (controller.signal.aborted) {
            reply = settleReply(reply, 'stopped', Date.now())
            break
          }
          continue
        }
        if (isContextOverflow(error)) {
          reply = settleReply(reply, 'error', Date.now(), {
            kind: 'context',
            message: '',
            status: error.status,
          })
        } else if (error instanceof ApiError && error.kind === 'interrupted' && reply.stopReason) {
          // 已收到 message_delta 的结束原因，只是缺了结尾的 message_stop
          reply = settleReply(reply, 'done', Date.now())
        } else if (error instanceof ApiError) {
          reply = settleReply(reply, 'error', Date.now(), {
            kind: error.kind,
            message: error.message,
            status: error.status,
            // 仍超过时只剩智能搜索或提问中的链接，提示用户按需关闭，服务端原文保留在 message。
            localMessage: isUserInputTooLong(error)
              ? { key: 'replyInputTooLongForTools' }
              : error.localMessage,
          })
        } else {
          reply = settleReply(reply, 'error', Date.now(), {
            kind: 'protocol',
            message: error instanceof Error ? error.message : String(error),
          })
        }
        break
      }
    }
  } finally {
    titleRequests.delete(controller)
    streamFlushes.delete(sessionId)
    cancelAnimationFrame(frame)
    updateReply(sessionId, reply)
    if (
      reply.error?.kind === 'context' &&
      request.draft &&
      get().importingHistory !== 'replace' &&
      !deletingSessions.has(sessionId) &&
      getSession(sessionId)
    ) {
      restoreSentDraft(sessionId, request.draft)
    }
    try {
      const saved = persist(sessionId)
      if (__HARMONY_APP__ && document.visibilityState === 'hidden' && saved) {
        await saved
      }
      const finished = getSession(sessionId)
      if (
        reply.status === 'done' &&
        finished &&
        !controller.signal.aborted &&
        get().importingHistory !== 'replace'
      ) {
        // 先同步交给原生发布，再通知它生成结束。点击通知时可读到已保存的最终回答。
        replyDoneListeners.forEach((listener) => listener(finished, reply))
        if (!finished.ephemeral) {
          rememberFromTurn(request.question.content, getReplyText(reply))
        }
      }
    } finally {
      set((state) =>
        state.streaming[sessionId] === controller
          ? {
              streaming: Object.fromEntries(
                Object.entries(state.streaming).filter(([id]) => id !== sessionId)
              ),
            }
          : state
      )
      if (!controller.signal.aborted) {
        suggestQuestions(sessionId, request.question.content, reply)
      }
    }
  }
}
