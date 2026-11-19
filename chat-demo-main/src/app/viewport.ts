import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { getHorizontalInsets } from '../services/harmony.js'

const query = window.matchMedia('not all and (min-width: 768px)')
const KEYBOARD_RESIZE_THRESHOLD = 48

const subscribe = (onChange: () => void) => {
  if (__HARMONY_APP__) {
    window.addEventListener('resize', onChange)
    window.addEventListener('pocket-chat-insets', onChange)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('pocket-chat-insets', onChange)
    }
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const readLayout = () => {
  if (!__HARMONY_APP__) {
    return query.matches ? 'compact' : 'wide'
  }
  const availableWidth = window.innerWidth - getHorizontalInsets()
  if (availableWidth < 600) {
    return 'compact'
  }
  return availableWidth < 960 ? 'medium' : 'wide'
}

export const useResponsiveLayout = () => useSyncExternalStore(subscribe, readLayout)
export const useIsMobile = () => useSyncExternalStore(subscribe, () => readLayout() === 'compact')

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
    let restingHeight = viewport?.height ?? window.innerHeight
    let previousHeight = restingHeight
    let previousWidth = window.innerWidth
    let keyboardOpen = false
    let animationFrame = 0
    const reset = () => {
      style.removeProperty('--app-viewport-height')
      style.removeProperty('--app-viewport-top')
      style.removeProperty('--app-viewport-obscured-bottom')
      if (__HARMONY_APP__) {
        document.body.removeAttribute('data-viewport-transition')
        document.body.removeAttribute('data-soft-keyboard')
      }
    }
    const update = () => {
      // 双指缩放由浏览器处理，保持当前布局尺寸。
      if (viewport && viewport.scale !== 1) {
        return
      }
      const focused = document.activeElement?.matches(inputSelector) === true
      const height = viewport?.height ?? window.innerHeight
      const top = viewport?.offsetTop ?? 0
      if (__HARMONY_APP__) {
        const width = window.innerWidth
        const resized = width !== previousWidth
        const wasOpen = keyboardOpen
        if (resized || (!focused && !wasOpen) || height > restingHeight) {
          restingHeight = height
        }
        keyboardOpen = (focused || wasOpen) && restingHeight - height > KEYBOARD_RESIZE_THRESHOLD
        if (height !== previousHeight || resized) {
          // 用动画接住 ArkWeb 一次性上报的大跳变，逐帧上报时直接跟随系统键盘。
          const jump =
            (keyboardOpen || wasOpen) &&
            Math.abs(height - previousHeight) > KEYBOARD_RESIZE_THRESHOLD
          const inMotion =
            document.body.hasAttribute('data-viewport-transition') &&
            (frame.getAnimations?.().length ?? 0) > 0
          document.body.toggleAttribute('data-viewport-transition', !resized && (jump || inMotion))
        }
        document.body.toggleAttribute('data-soft-keyboard', keyboardOpen)
        previousHeight = height
        previousWidth = width
        // 失焦时键盘可能尚未收起，继续跟随真实的可视视口。
        const obscured = Math.max(0, window.innerHeight - height - top)
        style.setProperty('--app-viewport-obscured-bottom', `${obscured}px`)
      } else if (!focused) {
        // 普通网页在失焦后恢复全高，避免等待 Safari 的键盘 resize。
        reset()
        return
      }
      style.setProperty('--app-viewport-height', `${height}px`)
      style.setProperty('--app-viewport-top', `${top}px`)
    }
    const scheduleFrame = () => {
      cancelAnimationFrame(animationFrame)
      animationFrame = requestAnimationFrame(update)
    }
    const schedule = () => {
      // 先同步跟上键盘动画，下一帧再校准 Safari 延迟更新的视口读数。
      update()
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
    document.addEventListener('focusin', onFocusIn)
    // 等点击和焦点切换完成，避免按钮移动、或切换输入框时短暂恢复全高。
    document.addEventListener('focusout', scheduleFrame)
    return () => {
      cancelAnimationFrame(animationFrame)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', scheduleFrame)
      reset()
    }
  }, [enabled])

  return frameRef
}
