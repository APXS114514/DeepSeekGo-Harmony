import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { getFoldBounds, getHorizontalInsets } from '../services/harmony.js'

const query = window.matchMedia('not all and (min-width: 768px)')
const KEYBOARD_RESIZE_THRESHOLD = 48
const KEYBOARD_MOTION_MS = 180
/** 跟随视觉视口移动的容器：聊天框架和弹窗遮罩。 */
const MOTION_SELECTOR = '[data-viewport-motion]'

type Layout = 'compact' | 'medium' | 'wide'

const computeLayout = (): Layout => {
  if (!__HARMONY_APP__) {
    return query.matches ? 'compact' : 'wide'
  }
  const viewport = window.visualViewport
  const scale = viewport?.scale ?? 1
  const availableWidth =
    (scale > 1.01 && viewport ? viewport.width : window.innerWidth) - getHorizontalInsets() / scale
  if (availableWidth < 600) {
    return 'compact'
  }
  return availableWidth < 960 ? 'medium' : 'wide'
}

/*
 * 布局档位只在窗口、视口或原生边距变化时重算。useSyncExternalStore 会在每次渲染和提交时读取快照，
 * 若直接读 innerWidth 和 visualViewport，React 刚改完 DOM 时就会强制同步计算样式和布局，
 * 提示气泡、消息和设置页等组件越多，切换页面时的卡顿越明显。
 */
let layout: Layout | null = null
const layoutListeners = new Set<() => void>()
const refreshLayout = () => {
  const next = computeLayout()
  if (next !== layout) {
    layout = next
    for (const listener of layoutListeners) {
      listener()
    }
  }
}
let lastViewportWidth = window.visualViewport?.width
let lastViewportScale = window.visualViewport?.scale
const onVisualResize = () => {
  const viewport = window.visualViewport
  // 键盘只改变视口高度，宽度和缩放不变时不必重算档位。
  if (viewport && (viewport.width !== lastViewportWidth || viewport.scale !== lastViewportScale)) {
    lastViewportWidth = viewport.width
    lastViewportScale = viewport.scale
    refreshLayout()
  }
}
if (__HARMONY_APP__) {
  window.addEventListener('resize', refreshLayout)
  window.addEventListener('pocket-chat-insets', refreshLayout)
  window.visualViewport?.addEventListener('resize', onVisualResize)
} else {
  query.addEventListener('change', refreshLayout)
}

const subscribe = (onChange: () => void) => {
  layoutListeners.add(onChange)
  return () => {
    layoutListeners.delete(onChange)
  }
}

const readLayout = () => (layout ??= computeLayout())

export const useResponsiveLayout = () => useSyncExternalStore(subscribe, readLayout)
export const useIsMobile = () => useSyncExternalStore(subscribe, () => readLayout() === 'compact')

const subscribeToHoverLayout = (onChange: () => void) => {
  window.addEventListener('pocket-chat-hover-layout', onChange)
  return () => window.removeEventListener('pocket-chat-hover-layout', onChange)
}

const readHoverLayout = () => document.body.hasAttribute('data-fold-hover')

export const useFoldHover = () => useSyncExternalStore(subscribeToHoverLayout, readHoverLayout)

const applyFoldLayout = (top: number, height: number, zoomed: boolean) => {
  const fold = getFoldBounds()
  // If the keyboard or viewport pan leaves insufficient room below the crease,
  // the regular layout keeps the composer visible until that pane is usable again.
  const split = !zoomed && fold && fold.upper - top >= 128 && top + height - fold.lower >= 96
  const changed = readHoverLayout() !== Boolean(split)
  if (split) {
    document.body.style.setProperty('--fold-upper', `${fold.upper - top}px`)
    document.body.style.setProperty('--fold-gap', `${fold.lower - fold.upper}px`)
  } else {
    document.body.style.removeProperty('--fold-upper')
    document.body.style.removeProperty('--fold-gap')
  }
  document.body.toggleAttribute('data-fold-hover', Boolean(split))
  if (changed) {
    window.dispatchEvent(new Event('pocket-chat-hover-layout'))
  }
}

const preventPageScroll = (event: TouchEvent) => {
  if (event.touches.length !== 1) {
    return
  }
  for (
    let element = event.target instanceof Element ? event.target : null;
    element && element !== document.body;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element)
    const scrollsY =
      /auto|scroll/.test(style.overflowY) && element.scrollHeight > element.clientHeight
    const scrollsX =
      /auto|scroll/.test(style.overflowX) && element.scrollWidth > element.clientWidth
    if (scrollsY || scrollsX) {
      return
    }
  }
  event.preventDefault()
}

/** 阻止移动端整页滚动，保留内部可滚动区域的滚动和双指缩放。 */
export const usePreventPageScroll = (enabled: boolean) => {
  useEffect(() => {
    // ArkWeb 的固定视口和 CSS 滚动边界允许触摸直接在滚动层处理。
    if (!enabled || (__HARMONY_APP__ && CSS.supports('overscroll-behavior-y', 'contain'))) {
      return
    }
    document.addEventListener('touchmove', preventPageScroll, { passive: false })
    return () => document.removeEventListener('touchmove', preventPageScroll)
  }, [enabled])
}

/** 移动端页面跟随视觉视口，键盘弹出后顶栏和输入框仍留在可见区域。 */
export const useMobileViewport = (enabled: boolean) => {
  const frameRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!enabled || !frame) {
      return
    }
    const viewport = window.visualViewport
    const style = __HARMONY_APP__ ? document.body.style : frame.style
    const inputSelector = 'textarea, input:not([type="file"])'
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let restingHeight = viewport?.height ?? window.innerHeight
    let previousHeight = restingHeight
    let previousTop = viewport?.offsetTop ?? 0
    let previousWidth = window.innerWidth
    let keyboardOpen = false
    let previousScale = 1
    let animationFrame = 0
    let motionEnd = 0
    let motionTimer = 0
    // 视口变量写在 body 上，整页元素都会继承。只在数值变化时写入，避免同一帧重复重算样式。
    const written = new Map<string, string>()
    const write = (name: string, value: string) => {
      if (written.get(name) !== value) {
        written.set(name, value)
        style.setProperty(name, value)
      }
    }
    const clear = (name: string) => {
      if (written.delete(name)) {
        style.removeProperty(name)
      }
    }
    // 过渡时长只写到跟随视口的框架和弹窗自身，不经过继承，过渡期间子元素无需逐帧重算样式。
    const setMotionDuration = (duration: string | null) => {
      for (const element of document.querySelectorAll<HTMLElement>(MOTION_SELECTOR)) {
        if (duration === null) {
          element.style.removeProperty('transition-duration')
        } else {
          element.style.transitionDuration = duration
        }
      }
    }
    const stopMotion = () => {
      if (motionEnd) {
        clearTimeout(motionTimer)
        motionEnd = 0
        document.body.removeAttribute('data-viewport-transition')
        setMotionDuration(null)
      }
    }
    const reset = () => {
      clear('--app-viewport-height')
      clear('--app-viewport-top')
      clear('--app-viewport-obscured-bottom')
      if (__HARMONY_APP__) {
        stopMotion()
        clear('--app-viewport-bottom')
        clear('--app-viewport-left')
        clear('--app-viewport-width')
        clear('--app-page-scale')
        document.body.removeAttribute('data-page-zoom')
        document.body.removeAttribute('data-soft-keyboard')
        applyFoldLayout(0, 0, false)
      }
    }
    const update = () => {
      // 网页版的双指缩放由浏览器管理，鸿蒙版还需要同步原生顶栏和安全区。
      if (!__HARMONY_APP__ && viewport && viewport.scale !== 1) {
        return
      }
      // 先读完所有几何量再写样式。写后再读会在同一帧里强制多算一次整页样式。
      const focused = document.activeElement?.matches(inputSelector) === true
      const height = viewport?.height ?? window.innerHeight
      const top = viewport?.offsetTop ?? 0
      if (__HARMONY_APP__) {
        const scale = viewport?.scale ?? 1
        const zoomed = scale > 1.01 && !!viewport
        const visualHeight = zoomed ? height * scale : height
        const width = window.innerWidth
        const layoutHeight = window.innerHeight
        const left = viewport?.offsetLeft ?? 0
        const visualWidth = viewport?.width ?? width
        const windowResized = width !== previousWidth
        const resized = windowResized || scale !== previousScale
        const wasOpen = keyboardOpen
        if (windowResized || (!focused && !wasOpen) || visualHeight > restingHeight) {
          restingHeight = visualHeight
        }
        keyboardOpen =
          (focused || wasOpen) && restingHeight - visualHeight > KEYBOARD_RESIZE_THRESHOLD
        if (resized || reduceMotion.matches) {
          stopMotion()
        } else if (visualHeight !== previousHeight || top !== previousTop) {
          const now = performance.now()
          const jump =
            (keyboardOpen || wasOpen) &&
            Math.abs(visualHeight - previousHeight) > KEYBOARD_RESIZE_THRESHOLD
          if (!motionEnd && jump) {
            // ArkWeb 一次性上报大幅变化时补间，后续修正沿用同一个结束时间。
            motionEnd = now + KEYBOARD_MOTION_MS
            document.body.setAttribute('data-viewport-transition', '')
            motionTimer = window.setTimeout(stopMotion, KEYBOARD_MOTION_MS)
          }
          if (motionEnd) {
            setMotionDuration(`${Math.max(0, motionEnd - now)}ms`)
          }
        }
        document.body.toggleAttribute('data-soft-keyboard', keyboardOpen)
        previousHeight = visualHeight
        previousTop = top
        previousWidth = width
        previousScale = scale
        // 失焦时键盘可能尚未收起，继续跟随真实的可视视口。
        write('--app-viewport-bottom', `${layoutHeight - height - top}px`)
        const obscured = Math.max(0, layoutHeight - visualHeight - (zoomed ? 0 : top))
        write('--app-viewport-obscured-bottom', `${obscured}px`)
        document.body.toggleAttribute('data-page-zoom', zoomed)
        applyFoldLayout(top, height, zoomed)
        if (zoomed) {
          write('--app-page-scale', String(scale))
          write('--app-viewport-left', `${left}px`)
          write('--app-viewport-width', `${visualWidth}px`)
        } else {
          clear('--app-page-scale')
          clear('--app-viewport-left')
          clear('--app-viewport-width')
        }
      } else if (!focused) {
        // 普通网页在失焦后恢复全高，避免等待 Safari 的键盘 resize。
        reset()
        return
      }
      write('--app-viewport-height', `${height}px`)
      write('--app-viewport-top', `${top}px`)
    }
    const scheduleFrame = () => {
      if (!animationFrame) {
        animationFrame = requestAnimationFrame(() => {
          animationFrame = 0
          update()
        })
      }
    }
    const schedule = () => {
      // Safari 需要立即响应并在下一帧校准，ArkWeb 的 resize 和 scroll 可合并为一次更新。
      if (!__HARMONY_APP__) {
        update()
      }
      scheduleFrame()
    }
    const onFocusIn = () => {
      if (document.activeElement?.matches(inputSelector)) {
        schedule()
      }
    }

    update()
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('pocket-chat-fold', schedule)
    document.addEventListener('focusin', onFocusIn)
    // 等点击和焦点切换完成，避免按钮移动、或切换输入框时短暂恢复全高。
    document.addEventListener('focusout', scheduleFrame)
    return () => {
      cancelAnimationFrame(animationFrame)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('pocket-chat-fold', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', scheduleFrame)
      reset()
    }
  }, [enabled])

  return frameRef
}
