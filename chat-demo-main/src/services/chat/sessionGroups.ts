import { create } from 'zustand'
import { translate } from '../../i18n/index.js'
import { monthKey } from '../../utils/format.js'
import type { SessionSummary } from './types.js'

const DAY = 86_400_000
const COLLAPSED_GROUPS_KEY = 'chat-demo:collapsed-branch-groups'

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0)

/** 去除分支标题末尾的序号后缀，供原对话被删除后回退显示组名。 */
export const stripBranchSuffix = (title: string) => title.replace(/(?:（\d+）|\s+\(\d+\))$/, '')

const readCollapsedGroups = (): Record<string, true> => {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_GROUPS_KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) {
      return {}
    }
    const map: Record<string, true> = {}
    for (const id of raw) {
      if (typeof id === 'string' && id) {
        map[id] = true
      }
    }
    return map
  } catch {
    return {}
  }
}

const writeCollapsedGroups = (collapsed: Record<string, true>) => {
  try {
    localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(Object.keys(collapsed)))
  } catch {
    // 忽略存储受限
  }
}

export const useBranchGroupState = create<{ collapsed: Record<string, true> }>(() => ({
  collapsed: readCollapsedGroups(),
}))

export const toggleBranchGroup = (groupId: string) => {
  useBranchGroupState.setState((state) => {
    const next: Record<string, true> = state.collapsed[groupId]
      ? Object.fromEntries(Object.entries(state.collapsed).filter(([id]) => id !== groupId))
      : { ...state.collapsed, [groupId]: true }
    writeCollapsedGroups(next)
    return { collapsed: next }
  })
}

export const expandBranchGroup = (groupId: string) => {
  if (!useBranchGroupState.getState().collapsed[groupId]) {
    return
  }
  useBranchGroupState.setState((state) => {
    const next: Record<string, true> = Object.fromEntries(
      Object.entries(state.collapsed).filter(([id]) => id !== groupId)
    )
    writeCollapsedGroups(next)
    return { collapsed: next }
  })
}

export type SidebarEntry =
  | { kind: 'single'; session: SessionSummary; sortTime: number }
  | {
      kind: 'branch-group'
      groupId: string
      title: string
      sessions: SessionSummary[]
      sortTime: number
    }

const sortGroupMembers = (members: SessionSummary[]) =>
  [...members].sort((a, b) => {
    const aRoot = a.branchParentId ? 1 : 0
    const bRoot = b.branchParentId ? 1 : 0
    if (aRoot !== bRoot) {
      return aRoot - bRoot
    }
    const aNum = a.branchNumber ?? Number.MAX_SAFE_INTEGER
    const bNum = b.branchNumber ?? Number.MAX_SAFE_INTEGER
    if (aNum !== bNum) {
      return aNum - bNum
    }
    return a.createdAt - b.createdAt
  })

/** 按分支对话组聚合，再按今天 / 昨天 / 7 天内 / 30 天内 / 按月分组。 */
export const groupSessions = (sessions: SessionSummary[], now: number, t = translate) => {
  const byGroup = new Map<string, SessionSummary[]>()
  for (const session of sessions) {
    if (session.branchGroupId) {
      const list = byGroup.get(session.branchGroupId)
      if (list) {
        list.push(session)
      } else {
        byGroup.set(session.branchGroupId, [session])
      }
    }
  }

  const seenGroups = new Set<string>()
  const entries: SidebarEntry[] = []
  for (const session of sessions) {
    const groupId = session.branchGroupId
    if (!groupId) {
      entries.push({ kind: 'single', session, sortTime: session.updatedAt })
      continue
    }
    if (seenGroups.has(groupId)) {
      continue
    }
    seenGroups.add(groupId)
    const members = byGroup.get(groupId) ?? [session]
    if (members.length < 2) {
      entries.push({ kind: 'single', session: members[0], sortTime: members[0].updatedAt })
      continue
    }
    const ordered = sortGroupMembers(members)
    const root = ordered.find((item) => !item.branchParentId)
    const rawTitle = root?.title || stripBranchSuffix(ordered[0].title)
    const title = rawTitle || t('untitledChat')
    const sortTime = Math.max(...members.map((item) => item.updatedAt))
    entries.push({ kind: 'branch-group', groupId, title, sessions: ordered, sortTime })
  }

  const groups: { key: string; label: string; entries: SidebarEntry[] }[] = []
  for (const entry of entries) {
    const diff = Math.floor((now - startOfDay(entry.sortTime)) / DAY)
    const key =
      diff <= 0
        ? 'sessionHistoryTimelineLabelToday'
        : diff <= 1
          ? 'sessionHistoryTimelineLabelYesterday'
          : diff < 7
            ? 'sessionHistoryTimelineLabel7days'
            : diff < 30
              ? 'sessionHistoryTimelineLabel30days'
              : null
    const groupKey = key ?? monthKey(entry.sortTime) ?? ''
    const last = groups.at(-1)
    if (last?.key === groupKey) {
      last.entries.push(entry)
    } else {
      groups.push({ key: groupKey, label: key ? t(key) : groupKey, entries: [entry] })
    }
  }
  return groups
}
