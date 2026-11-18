import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { getHorizontalInsets } from '../services/harmony.js'

const query = window.matchMedia('not all and (min-width: 768px)')

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
    if (!enabled) {
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
    let animationFrame = 0
    const reset = () => {
      style.removeProperty('--app-viewport-height')
      style.removeProperty('--app-viewport-top')
      style.removeProperty('--app-viewport-obscured-bottom')
    }
    const update = () => {
      // 双指缩放由浏览器处理，保持当前布局尺寸。
      if (viewport && viewport.scale !== 1) {
        return
      }
      // 失焦后直接恢复 CSS 的全高布局，不等 Safari 收键盘后的 resize。
      if (!document.activeElement?.matches(inputSelector)) {
        reset()
        return
      }
      style.setProperty('--app-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
      style.setProperty('--app-viewport-top', `${viewport?.offsetTop ?? 0}px`)
      if (__HARMONY_APP__ && viewport) {
        const obscured = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        style.setProperty('--app-viewport-obscured-bottom', `${obscured}px`)
      }
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
