import clsx from 'clsx'
import {
  useImperativeHandle,
  useLayoutEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismiss } from './anchored.js'
import { useBackLayer } from '../../services/backStack.js'
import styles from './Menu.module.css'

export type MenuOption = {
  key: string
  label: string
  icon: ReactNode
  danger?: boolean
  onSelect: () => void
}

/** 支持触发按钮、键盘和外部请求打开的操作菜单。 */
export const Menu = ({
  options,
  children,
  controlRef,
}: {
  options: MenuOption[]
  children: (props: { open: boolean; toggle: () => void }) => ReactNode
  /** 供外部打开菜单，例如 2in1 上右键会话条目 */
  controlRef?: Ref<{ open: () => void }>
}) => {
  const [entry, setEntry] = useState<'first' | 'last' | null>(null)
  const open = entry !== null
  useImperativeHandle(controlRef, () => ({ open: () => setEntry('first') }), [])
  // 左侧对齐并再左移 5px，让菜单文字与触发元素图标对齐
  const { anchorRef, floatingRef, position } = useAnchoredPosition<HTMLSpanElement, HTMLDivElement>(
    open,
    { align: 'start', alignOffset: -5, offset: 4 }
  )
  const close = (restoreFocus: boolean) => {
    setEntry(null)
    if (restoreFocus) {
      anchorRef.current?.querySelector('button')?.focus({ preventScroll: true })
    }
  }
  useDismiss(open, [anchorRef, floatingRef], (reason) => close(reason === 'escape'), {
    captureEscape: true,
  })
  useBackLayer(open, () => close(true))

  useLayoutEffect(() => {
    if (entry) {
      const items = floatingRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
      const index = entry === 'last' ? (items?.length ?? 0) - 1 : 0
      items?.[index]?.focus({ preventScroll: true })
    }
  }, [entry, floatingRef])

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const trigger = event.target
    if (
      open ||
      !(trigger instanceof HTMLButtonElement) ||
      trigger.getAttribute('aria-haspopup') !== 'menu' ||
      (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')
    ) {
      return
    }
    event.preventDefault()
    setEntry(event.key === 'ArrowDown' ? 'first' : 'last')
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      // 浮层挂在 body 末尾，先回到触发按钮再继续页面的 Tab 顺序。
      close(true)
      return
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    )
    const current = items.findIndex((item) => item === event.target)
    let next: number
    switch (event.key) {
      case 'ArrowDown':
        next = (current + 1) % items.length
        break
      case 'ArrowUp':
        next = (current + items.length - 1) % items.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = items.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    items[next]?.focus({ preventScroll: true })
  }

  return (
    <>
      <span ref={anchorRef} className={styles.anchor} onKeyDown={onTriggerKeyDown}>
        {children({ open, toggle: () => setEntry(open ? null : 'first') })}
      </span>
      {open
        ? createPortal(
            <div
              ref={floatingRef}
              className={styles.menu}
              style={position ?? undefined}
              role="menu"
              onKeyDown={onMenuKeyDown}
            >
              {options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  className={clsx(styles.option, option.danger && styles.danger)}
                  onClick={() => {
                    close(true)
                    option.onSelect()
                  }}
                >
                  <span className={styles.icon}>{option.icon}</span>
                  {option.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
