// 与 DeepSeek Chat Demo 一致，按多图请求的长边上限生成上传副本。
const MAX_IMAGE_EDGE = 4096

const readImage = async (blob: Blob) => {
  const image = new Image()
  const url = URL.createObjectURL(blob)
  try {
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const isUploadImageOversized = async (blob: Blob): Promise<boolean> => {
  const { naturalWidth, naturalHeight } = await readImage(blob)
  return Math.max(naturalWidth, naturalHeight) > MAX_IMAGE_EDGE
}

/** 按比例缩小上传副本，超限动图只保留一帧。 */
export const resizeUploadImage = async (file: File, signal: AbortSignal): Promise<File> => {
  signal.throwIfAborted()
  const image = await readImage(file)
  signal.throwIfAborted()
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight)
  if (longestEdge <= MAX_IMAGE_EDGE) {
    return file
  }

  const scale = MAX_IMAGE_EDGE / longestEdge
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  try {
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Cannot resize image')
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const type = file.type === 'image/jpeg' || file.type === 'image/webp' ? file.type : 'image/png'
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Cannot encode image'))),
        type,
        1
      )
    })
    signal.throwIfAborted()
    // 浏览器可能回退到 PNG，文件后缀以实际编码为准。
    const extension = blob.type === 'image/jpeg' ? 'jpg' : blob.type.slice('image/'.length)
    const name = file.name.replace(/\.[^.]*$/, '') + '.' + extension
    return new File([blob], name, { type: blob.type, lastModified: file.lastModified })
  } finally {
    canvas.width = canvas.height = 0
  }
}
