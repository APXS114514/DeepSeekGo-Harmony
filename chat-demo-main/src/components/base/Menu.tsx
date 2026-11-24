import clsx from 'clsx'
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { useAnchoredPosition, useDismiss } from './anchored.js'
import { useBackLayer } from '../../services/backStack.js'
import { chooseDeviceMenu, triggerDeviceHaptic, useDeviceFeatures } from '../../services/harmony.js'
import { useSettings } from '../../services/settings.js'
import styles from './Menu.module.css'

export type MenuOption = {
  key: string
  label: string
  icon: ReactNode
  /** 原生沉浸光感菜单的语义图标名 */
  nativeIcon?: string
  danger?: boolean
  onSelect: () => void
}

/** 支持触发按钮、键盘、右键/长按与鸿蒙原生光感菜单的操作菜单。 */
export const Menu = ({
  options,
  children,
  controlRef,
  nativeTitle,
  disableNative = false,
  onOpenChange,
}: {
  options: MenuOption[]
  children: (props: { open: boolean; toggle: () => void }) => ReactNode
  /** 供外部打开菜单，例如 2in1 上右键或触屏长按会话条目 */
  controlRef?: Ref<{ open: () => void }>
  nativeTitle?: string
  /** 仅使用网页菜单，不接管为原生菜单弹窗（用于由调用方决定半模态的场景） */
  disableNative?: boolean
  onOpenChange?: (open: boolean) => void
}) => {
  const t = useTranslate()
  const [entry, setEntry] = useState<'first' | 'last' | null>(null)
  const [nativeOpening, setNativeOpening] = useState(false)
  const nativeOpeningRef = useRef(false)
  const mountedRef = useRef(true)
  const openNativeRef = useRef<() => void>(() => {})
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  const supportsNative = useDeviceFeatures((state) => state.immersiveUi)
  const immersiveLight = useSettings((state) => state.immersiveLight)
  const useNative = !disableNative && __HARMONY_APP__ && supportsNative && immersiveLight
  const open = entry !== null

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    onOpenChangeRef.current?.(open)
  }, [open])

  openNativeRef.current = () => {
    if (nativeOpeningRef.current) {
      return
    }
    nativeOpeningRef.current = true
    setNativeOpening(true)
    triggerDeviceHaptic('menu')
    void chooseDeviceMenu({
      ...(nativeTitle ? { title: nativeTitle } : {}),
      options: options.map((option) => ({
        key: option.key,
        label: option.label,
        ...(option.nativeIcon ? { icon: option.nativeIcon } : {}),
        ...(option.danger ? { danger: true } : {}),
      })),
      cancel: t('cancel'),
    }).then((selected) => {
      nativeOpeningRef.current = false
      if (!mountedRef.current) {
        return
      }
      setNativeOpening(false)
      if (selected === 'unavailable') {
        setEntry('first')
      } else if (selected !== 'cancelled') {
        options.find((option) => option.key === selected)?.onSelect()
      }
    })
  }

  useImperativeHandle(
    controlRef,
    () => ({
      open: () => {
        if (useNative) {
          openNativeRef.current()
        } else {
          setEntry('first')
        }
      },
    }),
    [useNative]
  )
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
      triggerDeviceHaptic('menu')
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
      trigger.getAttribute('aria-busy') === 'true' ||
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
        {children({
          open: open || nativeOpening,
          toggle: () => {
            if (open) {
              setEntry(null)
            } else if (useNative) {
              openNativeRef.current()
            } else {
              setEntry('first')
            }
          },
        })}
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
