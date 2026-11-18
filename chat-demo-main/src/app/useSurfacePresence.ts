import { useLayoutEffect, useRef, useState } from 'react'

/** Keep a Harmony overlay mounted and inert until its exit animation ends. */
export const useSurfacePresence = <T extends HTMLElement>(open: boolean) => {
  const ref = useRef<T>(null)
  const [retained, setRetained] = useState(false)

  useLayoutEffect(() => {
    const surface = ref.current
    if (!__HARMONY_APP__) {
      return
    }
    if (!surface) {
      setRetained(false)
      return
    }
    surface.inert = !open
    if (open) {
      setRetained(true)
      return
    }
    const animations = surface.getAnimations?.() ?? []
    if (animations.length === 0) {
      setRetained(false)
      return
    }
    let current = true
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (current) {
        setRetained(false)
      }
    })
    return () => {
      current = false
    }
  }, [open])

  return { ref, present: open || retained, closing: !open && retained }
}
