import { ApiError } from './client.js'

/**
 * 接口失败的统一分类。各调用方按自己的场景给同一种情况配不同文案，
 * 例如余额不足在回答、上传、朗读里措辞不同，所以这里只归类，不生成文案。
 */
export type ApiErrorCondition =
  | 'unauthorized'
  | 'insufficientBalance'
  | 'tooLarge'
  | 'rateLimited'
  | 'serverBusy'
  | 'network'
  | 'other'

/** 按 HTTP 状态码归类；没有状态码（请求没到达服务端）时按网络问题处理 */
export const classifyStatus = (status: number | undefined): ApiErrorCondition => {
  if (status === 401) {
    return 'unauthorized'
  }
  if (status === 402) {
    return 'insufficientBalance'
  }
  if (status === 413) {
    return 'tooLarge'
  }
  if (status === 429) {
    return 'rateLimited'
  }
  if ((status ?? 0) >= 500) {
    return 'serverBusy'
  }
  return 'other'
}

export const classifyApiError = (error: unknown): ApiErrorCondition => {
  if (!(error instanceof ApiError)) {
    return 'other'
  }
  if (error.status === undefined) {
    return error.kind === 'network' ? 'network' : 'other'
  }
  return classifyStatus(error.status)
}

/** 重试可能成功的情况：网络、限流、服务端繁忙；参数或鉴权类错误重试无用 */
export const isRetryableApiError = (error: unknown): boolean => {
  const condition = classifyApiError(error)
  return (
    !(error instanceof ApiError) ||
    condition === 'network' ||
    condition === 'rateLimited' ||
    condition === 'serverBusy'
  )
}

/** 余额、附件体积与普通参数错误都不能单凭状态码归为模型上下文超限。 */
export const isContextOverflow = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  (error.kind === 'stream' ||
    error.status === 400 ||
    error.status === 413 ||
    error.status === 422) &&
  (/^(?:model_)?context_(?:length|window)_exceeded$/i.test(error.code ?? '') ||
    /\bcontext (?:length|window) (?:is )?(?:exceeded|too (?:long|large))\b/i.test(error.message) ||
    /\bmaximum context (?:length|window)\b/i.test(error.message) ||
    /\b(?:input|prompt|messages?)\b.{0,60}\b(?:longer than|exceeds?)\b.{0,45}\bcontext (?:length|window)\b/i.test(
      error.message
    ) ||
    /\binput tokens? exceed(?:s|ed)? the limit\b/i.test(error.message))

/**
 * 请求开启 `title`、智能搜索或阅读链接时，服务端要求最新一条用户消息（含附件）不超过
 * 32,768 Token，超过时整次请求返回 400「user input too long」。三者都不开启时，
 * 同样的输入按模型上下文正常回答；更早轮次的附件不计入这项检查。
 */
export const isUserInputTooLong = (error: unknown): boolean =>
  error instanceof ApiError &&
  (error.status === 400 || error.kind === 'stream') &&
  /\buser input too long\b/i.test(error.message)

/** 服务端判定附件失效的情况：本地有原件时重新上传即可自愈 */
export type FileErrorCode = 'fileIdMissing' | 'fileDataMissing' | 'invalidFileId'

/** 400 只带 message 文本，按文案前缀区分；顺序无关，互不重叠 */
const FILE_ERROR_PATTERNS: ReadonlyArray<readonly [FileErrorCode, RegExp]> = [
  ['fileIdMissing', /file_ids do not exist or are not created under your account/i],
  ['fileDataMissing', /file data not found for file_id/i],
  ['invalidFileId', /\.source\.file_id: invalid file_id/i],
]

/**
 * 只识别「附件 file_id 失效」这一类 400：服务端查不到文件、文件数据丢失、file_id 格式非法。
 * 其余错误（限流、余额、purpose 不合规等）不在这里处理，保持原有失败提示。
 */
export const getFileErrorCode = (error: unknown): FileErrorCode | null => {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null
  }
  return FILE_ERROR_PATTERNS.find(([, pattern]) => pattern.test(error.message))?.[0] ?? null
}

/** 从报错文案里取出服务端 file_id，用于只重置真正失效的附件 */
export const extractFileIds = (message: string): string[] => [
  ...new Set(message.match(/file-api-[\w-]+/g) ?? []),
]

/** 上传失败里能识别出具体原因的情况；其余统一按「上传失败」处理 */
export type UploadErrorCode = 'fileCountLimit' | 'storageLimit' | 'parseFailed'

export type UploadErrorInfo = { code: UploadErrorCode; limit?: string }

/** 服务端无法解析文件内容：图片损坏或尺寸过大、格式不受支持、加密、文档解析失败 */
const PARSE_FAILED_PATTERNS = [
  /You have uploaded an (unsupported|invalid) (file|image)/i,
  /The image is too large to process/i,
  /password-protected/i,
  /Failed to recognize the file/i,
]

/**
 * 识别 Files API 上传的 400。配额类文案带上限数值，单个 Key 与账号合计（across all sub keys）共用同一提示。
 */
export const getUploadErrorInfo = (error: unknown): UploadErrorInfo | null => {
  if (!(error instanceof ApiError) || error.status !== 400) {
    return null
  }
  const { message } = error
  const count = /User file count limit exceeded.*?limit (\d+)/i.exec(message)
  if (count) {
    return { code: 'fileCountLimit', limit: count[1] }
  }
  const storage = /User storage quota exceeded.*?limit ([\d.]+) GB/i.exec(message)
  if (storage) {
    return { code: 'storageLimit', limit: storage[1] }
  }
  if (PARSE_FAILED_PATTERNS.some((pattern) => pattern.test(message))) {
    return { code: 'parseFailed' }
  }
  return null
}
