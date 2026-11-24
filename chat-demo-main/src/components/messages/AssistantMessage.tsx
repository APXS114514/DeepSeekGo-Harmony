import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo } from 'react'
import {
  IconBranchOutline16,
  IconRefreshOutline16,
  IconShareOutline16,
  IconWarningOutline16,
} from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import {
  continueReply,
  forkSessionFromMessage,
  regenerateReply,
} from '../../services/chat/store.js'
import { openCitation, useDeviceFeatures } from '../../services/harmony.js'
import { setSearch, useSettings } from '../../services/settings.js'
import { shareAnswer } from '../../services/chat/share.js'
import { openShare } from '../share/ShareDialog.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { showToast } from '../base/toastState.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { closeSearchPanel, toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { ReplyArea } from './ReplyArea.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  ephemeral = false,
  versions,
  onSelectVersion,
  onSelectSuggestion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  ephemeral?: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
  onSelectSuggestion?: (question: string) => void
}) {
  const t = useTranslate()
  const suggestionsEnabled = useSettings((state) => state.suggestedQuestions)
  const searchEnabled = useSettings((state) => state.search)
  const sharing = useDeviceFeatures((state) => state.share)
  const view = useReplyView(message, streaming)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示模板答复。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const localContext = refused ? undefined : message.localContext
  const hasLocalMeta = Boolean(
    localContext &&
    ((localContext.locationSource === 'auto' && localContext.locationLabel) ||
      localContext.structuredSource ||
      localContext.locationFallback ||
      localContext.searchRecommended ||
      (localContext.autoSearch && localContext.locationLabel))
  )
  const fallbackKey =
    localContext?.locationFallback === 'denied'
      ? 'localContextFallbackDenied'
      : localContext?.locationFallback === 'switch_off'
        ? 'localContextFallbackSwitchOff'
        : 'localContextFallbackFailed'
  const summaryEntry = `${message.id}-summary`
  return (
    <div className={styles.message} data-history-message={message.id} tabIndex={-1}>
      {refused ? null : (
        <ReplyArea
          message={message}
          view={view}
          streaming={streaming}
          hasResponse={!!responseText}
        />
      )}
      {hasLocalMeta && localContext ? (
        <div className={styles.localMeta} data-local-context>
          {localContext.locationSource === 'auto' && localContext.locationLabel ? (
            <span className={styles.localChip}>
              {t('localContextAutoLocation', { place: localContext.locationLabel })}
            </span>
          ) : null}
          {localContext.structuredSource ? (
            <span className={styles.localChip}>
              {t('localContextStructuredSource')}
              {localContext.structuredSource.url ? (
                <a
                  className={styles.localLink}
                  href={localContext.structuredSource.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => {
                    const url = localContext.structuredSource?.url
                    if (__HARMONY_APP__ && url) {
                      event.preventDefault()
                      openCitation(url)
                    }
                  }}
                >
                  {localContext.structuredSource.name}
                </a>
              ) : (
                localContext.structuredSource.name
              )}
            </span>
          ) : localContext.autoSearch && localContext.locationLabel ? (
            <span className={styles.localChip}>
              {t('localContextAutoSearch', { place: localContext.locationLabel })}
            </span>
          ) : null}
          {localContext.locationFallback ? (
            <span className={styles.localChip}>
              <span>{t(fallbackKey)}</span>
              <button
                type="button"
                className={styles.noticeAction}
                onClick={() => openSettings('general')}
              >
                {t('localContextOpenSettings')}
              </button>
            </span>
          ) : null}
          {localContext.searchRecommended === 'live_data' ? (
            <span className={styles.localChip}>
              <span>{t('localContextSearchOffLiveData')}</span>
              {!searchEnabled ? (
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => {
                    setSearch(true)
                    showToast({ key: 'localContextSearchEnabled' })
                  }}
                >
                  {t('localContextEnableSearch')}
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
      {answer ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={answer.markdown}
          loading={streaming}
          cacheKey={message.id}
          disableLink={false}
          sources={view.sources}
        />
      ) : null}
      {waiting ? (
        <div className={styles.waiting}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {notice?.presentation === 'response' ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={notice.text}
          loading={false}
          cacheKey={`${message.id}-template`}
          disableLink={false}
        />
      ) : notice ? (
        <div className={styles.notice}>
          <IconWarningOutline16 />
          <span>
            {notice.text}
            {notice.action === 'apiKey' ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openSettings('data')}
                >
                  {t('changeApiKey')}
                </button>
              </>
            ) : null}
            {notice.action === 'topUp' ? (
              <>
                {' '}
                <a
                  className={styles.noticeAction}
                  href={TOP_UP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('topUp')}
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <button
          type="button"
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          aria-expanded={panelEntry === summaryEntry}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </button>
      ) : null}
      {streaming ? null : (
        <div className={styles.bottom}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
            {copyText ? (
              <CopyButton text={copyText} drag={__HARMONY_APP__ && !!responseText} />
            ) : null}
            {__HARMONY_APP__ && sharing && responseText && !refused ? (
              <IconButton
                icon={<IconShareOutline16 />}
                tooltip={t('shareAnswer')}
                tooltipPlacement="bottom"
                onClick={() => openShare(shareAnswer(t('shareAnswer'), responseText))}
              />
            ) : null}
            {responseText && !refused ? (
              <ReadAloudButton messageId={message.id} text={responseText} />
            ) : null}
            <IconButton
              icon={<IconRefreshOutline16 />}
              tooltip={t('regenerate')}
              tooltipPlacement="bottom"
              disabled={busy || refused || message.error?.kind === 'context'}
              onClick={() => {
                stopReadAloud()
                regenerateReply(sessionId, message.id)
              }}
            />
            {!ephemeral ? (
              <IconButton
                icon={<IconBranchOutline16 />}
                tooltip={t('forkFromHere')}
                tooltipPlacement="bottom"
                disabled={busy}
                onClick={() => {
                  stopReadAloud()
                  closeSearchPanel()
                  const created = forkSessionFromMessage(sessionId, message.id)
                  if (created) {
                    showToast({ key: 'forkCreated', params: { title: created.title } })
                  }
                }}
              />
            ) : null}
          </div>
          {isLast && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
        </div>
      )}
      {suggestionsEnabled &&
      isLast &&
      !busy &&
      onSelectSuggestion &&
      message.suggestedQuestions?.length ? (
        <div className={styles.suggestions} role="group" aria-label={t('suggestedQuestions')}>
          <span aria-hidden="true">{t('suggestedQuestions')}</span>
          {message.suggestedQuestions.map((question) => (
            <button key={question} type="button" onClick={() => onSelectSuggestion(question)}>
              {question}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
})
