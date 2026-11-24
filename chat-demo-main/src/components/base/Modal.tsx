import clsx from 'clsx'
import {
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from './icons.js'
import { IconButton } from './IconButton.js'
import { useBackLayer } from '../../services/backStack.js'
import styles from './Modal.module.css'

/** 当前打开的弹窗，后打开的在末尾；叠放时 Esc 只关闭最上层 */
const openModals: object[] = []
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]'
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const useModalOpen = () => useSyncExternalStore(subscribe, () => openModals.length > 0)

/** 遮罩 + 居中卡片，带独立返回动作的弹窗可用 Esc 返回上一层。 */
export const Modal = ({
  title,
  children,
  footer,
  closable = false,
  className,
  overlayClassName,
  mainClassName,
  overlayRef,
  closing = false,
  onClose,
  onBack = onClose,
}: {
  title: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** 标题栏右侧显示关闭按钮 */
  closable?: boolean
  className?: string
  overlayClassName?: string
  /** 内容区的 class */
  mainClassName?: string
  overlayRef?: Ref<HTMLDivElement>
  closing?: boolean
  onClose: () => void
  onBack?: () => void
}) => {
  const t = useTranslate()
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  )
  const onCloseRef = useRef(onClose)
  onCloseRef.current = closing ? () => {} : onClose
  const onBackRef = useRef(onBack)
  onBackRef.current = closing ? () => {} : onBack
  useBackLayer(!closing, () => onBackRef.current())
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }
    const target = previousFocus.current
    const token = {}
    const focusable = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (item) =>
          item.tabIndex >= 0 && !item.closest('[inert], [hidden]') && item.getClientRects().length
      )
    openModals.push(token)
    listeners.forEach((listener) => listener())
    if (!dialog.contains(document.activeElement)) {
      ;(focusable()[0] ?? dialog).focus({ preventScroll: true })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || openModals.at(-1) !== token) {
        return
      }
      if (event.key === 'Escape') {
        onBackRef.current()
        return
      }
      if (event.key === 'Tab') {
        const items = focusable()
        const active = document.activeElement
        const edge = event.shiftKey ? items[0] : items.at(-1)
        if (!items.includes(active as HTMLElement) || active === edge) {
          event.preventDefault()
          const next = event.shiftKey ? items.at(-1) : items[0]
          ;(next ?? dialog).focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      const wasTop = openModals.at(-1) === token
      openModals.splice(openModals.indexOf(token), 1)
      listeners.forEach((listener) => listener())
      document.removeEventListener('keydown', onKeyDown)
      if (
        wasTop &&
        target?.isConnected &&
        (dialog.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        target.focus({ preventScroll: true })
      }
    }
  }, [])

  return createPortal(
    <div
      ref={overlayRef}
      className={clsx(styles.overlay, overlayClassName)}
      data-viewport-motion=""
      data-closing={closing ? '' : undefined}
      onMouseDown={(event) => event.target === event.currentTarget && onCloseRef.current()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={clsx(styles.content, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          {closable ? (
            <IconButton
              className={styles.close}
              tone="primary"
              icon={<IconCloseOutline16 />}
              aria-label={t('close')}
              onClick={onClose}
            />
          ) : null}
        </div>
        {children ? <div className={clsx(styles.main, mainClassName)}>{children}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
