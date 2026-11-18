import { useState } from 'react'
import { ApiError, verifyApiKey } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import { setApiKey, setApiKeyForSession } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'

/** 输入 API Key 后先用 GET /models 校验，通过才保存 */
export const useApiKeyForm = (onSaved?: () => void) => {
  const t = useTranslate()
  const [value, updateValue] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [saveFailure, setSaveFailure] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null)
  const cause = failure?.cause
  const error = saveFailure
    ? t('apiKeySaveFailed', { code: saveFailure })
    : failure === null
      ? null
      : classifyApiError(cause) === 'unauthorized'
        ? t('apiKeyInvalid')
        : classifyApiError(cause) === 'network'
          ? t('commonNetworkErrorToast')
          : t('apiKeyVerificationFailed', {
              message:
                cause instanceof ApiError && cause.localMessage
                  ? t(cause.localMessage.key, cause.localMessage.params)
                  : cause instanceof Error
                    ? cause.message
                    : String(cause),
            })

  const setValue = (next: string) => {
    updateValue(next)
    setSaveFailure(null)
  }

  const useTemporarily = () => {
    if (saveFailure && !verifying) {
      setApiKeyForSession(value.trim())
      setValue('')
      onSaved?.()
    }
  }

  const submit = async () => {
    const apiKey = value.trim()
    if (!apiKey || verifying) {
      return
    }
    setVerifying(true)
    setSaveFailure(null)
    setFailure(null)
    try {
      await verifyApiKey(apiKey)
      const code = await setApiKey(apiKey)
      if (code !== null) {
        setSaveFailure(code)
        return
      }
      setValue('')
      onSaved?.()
    } catch (e) {
      setFailure({ cause: e })
    } finally {
      setVerifying(false)
    }
  }

  return { value, setValue, verifying, error, saveFailure, submit, useTemporarily }
}
