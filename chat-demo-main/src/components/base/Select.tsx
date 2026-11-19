import clsx from 'clsx'
import { useId, useLayoutEffect, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPosition, useDismiss } from './anchored.js'
import { useBackLayer } from '../../services/backStack.js'
import { IconCheckOutline16, IconChevronDownOutline14 } from './icons.js'
import styles from './Select.module.css'

export type SelectOption<T extends string> = { value: T; label: string; lang?: string }

/**
 * 胶囊形选择器：触发器高 36px、圆角 18px、浅灰底，下拉菜单选中项右侧打勾；
 * 点外部或 Esc 关闭。value 不匹配任何选项时触发器显示 placeholder。
 */
export const Select = <T extends string>({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  className,
  disabled = false,
}: {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
  disabled?: boolean
}) => {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const current = options.find((option) => option.value === value)
  // 菜单贴右侧展开，最多 320px 高，超出在菜单内滚动
  const { anchorRef, floatingRef, position } = useAnchoredPosition<
    HTMLButtonElement,
    HTMLDivElement
  >(open, { align: 'end', maxHeight: 320, minSpace: 160 })
  // Esc 只关菜单，不让外层弹窗一起关闭
  const close = (restore: boolean) => {
    setOpen(false)
    if (restore) {
      anchorRef.current?.focus({ preventScroll: true })
    }
  }
  useDismiss(open, [anchorRef, floatingRef], (reason) => close(reason === 'escape'), {
    captureEscape: true,
  })
  useBackLayer(open, () => close(true))
  useLayoutEffect(() => {
    if (open) {
      const list = floatingRef.current
      const item =
        list?.querySelector<HTMLButtonElement>('[aria-selected=true]') ??
        list?.querySelector<HTMLButtonElement>('[role=option]')
      item?.focus({ preventScroll: true })
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [floatingRef, open])
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      close(true)
      return
    }
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=option]')]
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % items.length
            : event.key === 'ArrowUp'
              ? (current + items.length - 1) % items.length
              : -1
    if (next >= 0) {
      event.preventDefault()
      items[next]?.focus()
    }
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        className={clsx(styles.trigger, open && styles.open, className)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {current ? (
          <span lang={current.lang}>{current.label}</span>
        ) : (
          <span className={styles.placeholder}>{placeholder}</span>
        )}
        <span className={styles.arrow}>
          <IconChevronDownOutline14 />
        </span>
      </button>
      {open && !disabled
        ? createPortal(
            <div
              ref={floatingRef}
              className={styles.menu}
              style={position ?? undefined}
              id={listId}
              role="listbox"
              onKeyDown={navigate}
              aria-label={ariaLabel}
            >
              {options.map((option) => (
                <button
                  type="button"
                  tabIndex={-1}
                  key={option.value}
                  role="option"
                  lang={option.lang}
                  aria-selected={option.value === value}
                  className={styles.option}
                  onClick={() => {
                    close(true)
                    onChange(option.value)
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === value ? <IconCheckOutline16 /> : null}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
