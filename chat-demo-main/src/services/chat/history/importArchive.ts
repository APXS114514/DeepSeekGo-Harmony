import * as db from '../db.js'
import type { Session } from '../types.js'
import { BackupError, fail } from './errors.js'
import type { SessionIndexEntry } from './format.js'
import { INDEX_PATH, MANIFEST_PATH, USER_PATH, parseSessionPath, sessionFilesDir } from './paths.js'
import { checkManifest, readSessionFile, readSessionIndex } from './schema.js'
import { toLocalSession } from './toLocal.js'
import {
  ArchiveError,
  isZipFile,
  openArchive,
  readEntry,
  skipEntry,
  type ArchiveEntry,
  type OpenArchive,
} from './zipReader.js'

const SESSION_BATCH_COUNT = 32
const SESSION_BATCH_BYTES = 2 * 1024 * 1024
const IMAGE_BATCH_COUNT = 16
const IMAGE_BATCH_BYTES = 4 * 1024 * 1024

/** 从原件字节补充图片 MIME；无法识别时为空字符串，图片身份仍由归档的 is_image 决定。 */
const imageType = (bytes: Uint8Array): string => {
  const startsWith = (...prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte)
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 12))
  if (startsWith(0xff, 0xd8, 0xff)) {
    return 'image/jpeg'
  }
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return 'image/png'
  }
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return 'image/gif'
  }
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (startsWith(0x42, 0x4d)) {
    return 'image/bmp'
  }
  if (startsWith(0x49, 0x49, 0x2a, 0) || startsWith(0x4d, 0x4d, 0, 0x2a)) {
    return 'image/tiff'
  }
  if (header.slice(4, 8) === 'ftyp' && ['avif', 'avis'].includes(header.slice(8, 12))) {
    return 'image/avif'
  }
  return ''
}

const readJson = async (entry: ArchiveEntry): Promise<unknown> => {
  const decoder = new TextDecoder()
  let text = ''
  for await (const chunk of entry.stream) {
    text += decoder.decode(chunk, { stream: true })
  }
  text += decoder.decode()
  try {
    return JSON.parse(text)
  } catch {
    return fail('backupInvalidJson')
  }
}

/**
 * 检查 ZIP 格式、首个 manifest 条目及格式版本。
 * 校验失败时保留正在生成的回答和现有暂存数据。
 */
export const checkArchiveFormat = async (file: File): Promise<OpenArchive> => {
  if (!(await isZipFile(file))) {
    fail('backupUnrecognized')
  }
  try {
    const archive = await openArchive(file)
    for await (const entry of archive.entries()) {
      if (entry.path !== MANIFEST_PATH) {
        fail('backupUnrecognized')
      }
      checkManifest(await readJson(entry))
      return archive
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  return fail('backupUnrecognized')
}

/**
 * 流式导入：manifest → user（不导入）→ 全部会话 JSON → index → 全部图片。
 * 也支持会话与图片交错排列、index 位于末尾的条目顺序。
 * 分批暂存会话和图片，全部读完后给引用原件的会话回填 MIME。
 * 调用方负责提交或清理暂存；进度包含会话、图片和归档元数据。
 */
export const importArchive = async (
  archive: OpenArchive,
  onProgress?: (percent: number) => void
): Promise<void> => {
  const imported = new Set<string>()
  const images = new Map<string, string>()
  const sessionsByFile = new Map<string, Set<string>>()
  // 同一张图出现在多个会话目录时，暂存批次与已写入的原件一起去重。
  const stored = new Map<string, string>()
  let index: SessionIndexEntry[] | undefined
  let currentSessionId: string | undefined
  let processed = 0
  let progress = 0

  let sessionBatch: Session[] = []
  let sessionBatchBytes = 0
  const flushSessions = async () => {
    await db.addStagingSessions(sessionBatch)
    sessionBatch = []
    sessionBatchBytes = 0
  }

  let imageBatch: db.StoredFile[] = []
  let imageBatchBytes = 0
  const flushImages = async () => {
    await db.saveStagingFiles(imageBatch)
    imageBatch = []
    imageBatchBytes = 0
  }

  const saveImage = async (entry: ArchiveEntry, id: string) => {
    if (stored.has(id)) {
      await skipEntry(entry)
      return
    }
    if (imageBatchBytes + entry.size > IMAGE_BATCH_BYTES) {
      await flushImages()
    }
    const blob = await readEntry(entry, imageType)
    imageBatch.push({ id, blob })
    imageBatchBytes += blob.size
    stored.set(id, blob.type)
    if (imageBatch.length >= IMAGE_BATCH_COUNT || imageBatchBytes >= IMAGE_BATCH_BYTES) {
      await flushImages()
    }
  }

  onProgress?.(0)
  try {
    for await (const entry of archive.entries()) {
      const { path } = entry
      const sessionId = parseSessionPath(path)
      if (processed === 0) {
        // 进入暂存前已校验 manifest，继续校验条目大小和 CRC。
        await skipEntry(entry)
      } else if (path === USER_PATH && !index && imported.size === 0) {
        // 账号信息（已脱敏）不导入；文件可能缺失。
        await skipEntry(entry)
      } else if (sessionId !== null && !index) {
        if (sessionBatchBytes + entry.size > SESSION_BATCH_BYTES) {
          await flushSessions()
        }
        const local = toLocalSession(readSessionFile(await readJson(entry)))
        if (local.session.id !== sessionId || imported.has(sessionId)) {
          fail('backupIncomplete')
        }
        imported.add(sessionId)
        currentSessionId = sessionId
        for (const [imagePath, id] of local.images) {
          images.set(imagePath, id)
        }
        for (const message of local.session.messages) {
          if (message.role === 'user') {
            for (const file of message.files) {
              let sessions = sessionsByFile.get(file.id)
              if (!sessions) {
                sessions = new Set()
                sessionsByFile.set(file.id, sessions)
              }
              sessions.add(sessionId)
            }
          }
        }
        sessionBatch.push(local.session)
        sessionBatchBytes += entry.size
        if (sessionBatch.length >= SESSION_BATCH_COUNT || sessionBatchBytes >= SESSION_BATCH_BYTES) {
          await flushSessions()
        }
      } else if (path === INDEX_PATH && !index) {
        index = readSessionIndex(await readJson(entry))
      } else if (
        index
          ? imported.has(/^chat_sessions\/([^/]+)_files\//.exec(path)?.[1] ?? '')
          : currentSessionId && path.startsWith(sessionFilesDir(currentSessionId))
      ) {
        // 没有被引用的条目不保存，引用了但缺失的图片只展示文件名。
        const id = images.get(path)
        await (id === undefined ? skipEntry(entry) : saveImage(entry, id))
      } else {
        fail('backupIncomplete')
      }
      processed++
      const percent = Math.min(99, Math.floor((processed * 100) / archive.entryCount))
      if (percent > progress) {
        progress = percent
        onProgress?.(percent)
      }
    }
  } catch (error) {
    throw error instanceof ArchiveError ? new BackupError('backupIncomplete') : error
  }
  // index 只列出成功写出的会话，与会话文件一一对应。
  const listed = new Set(index?.map((entry) => entry.id))
  if (
    !index ||
    listed.size !== index.length ||
    listed.size !== imported.size ||
    [...imported].some((id) => !listed.has(id))
  ) {
    fail('backupIncomplete')
  }
  await flushSessions()
  await flushImages()
  const affectedSessions = new Set<string>()
  for (const [fileId, type] of stored) {
    if (type) {
      for (const sessionId of sessionsByFile.get(fileId) ?? []) {
        affectedSessions.add(sessionId)
      }
    }
  }
  await db.updateStagingFileTypes(stored, affectedSessions)
  onProgress?.(100)
}
