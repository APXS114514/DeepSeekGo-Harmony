import clsx from 'clsx'
import { useImperativeHandle, useState, type ReactNode, type Ref } from 'react'
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

/** 点击触发，向下展开；点外部或 Esc 关闭 */
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
  const [open, setOpen] = useState(false)
  useImperativeHandle(controlRef, () => ({ open: () => setOpen(true) }), [])
  const close = () => setOpen(false)
  // 左侧对齐并再左移 5px，让菜单文字与触发元素图标对齐
  const { anchorRef, floatingRef, position } = useAnchoredPosition<HTMLSpanElement, HTMLDivElement>(
    open,
    { align: 'start', alignOffset: -5, offset: 4 }
  )
  useDismiss(open, [anchorRef, floatingRef], close)
  useBackLayer(open, close)

  return (
    <>
      <span ref={anchorRef} className={styles.anchor}>
        {children({ open, toggle: () => setOpen((value) => !value) })}
      </span>
      {open
        ? createPortal(
            <div
              ref={floatingRef}
              className={styles.menu}
              style={position ?? undefined}
              role="menu"
            >
              {options.map((option) => (
                <div
                  key={option.key}
                  role="menuitem"
                  className={clsx(styles.option, option.danger && styles.danger)}
                  onClick={() => {
                    setOpen(false)
                    option.onSelect()
                  }}
                >
                  <span className={styles.icon}>{option.icon}</span>
                  {option.label}
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
