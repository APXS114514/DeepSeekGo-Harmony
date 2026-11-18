import { useEffect, useRef } from 'react'
import { create } from 'zustand'

/**
 * 系统返回手势的层级：菜单、弹窗、面板、抽屉、编辑和收音打开时各登记一层，
 * 返回时只关闭最后打开的一层。没有可关闭的层时，鸿蒙原生按系统默认处理（退到后台）。
 */
type Layer = { close: () => void }

const layers: Layer[] = []

/** 当前可关闭的层数，变化时同步给原生，决定返回手势由谁处理。 */
export const useBackDepth = create(() => ({ depth: 0 }))

const sync = () => useBackDepth.setState({ depth: layers.length })

/** active 期间登记一层「返回即关闭」，close 总是调用最新的回调。 */
export const useBackLayer = (active: boolean, close: () => void) => {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    if (!active) {
      return
    }
    const layer: Layer = { close: () => closeRef.current() }
    layers.push(layer)
    sync()
    return () => {
      const index = layers.indexOf(layer)
      if (index >= 0) {
        layers.splice(index, 1)
      }
      sync()
    }
  }, [active])
}

/** 关闭最上面一层；没有可关闭的层时返回 false。 */
export const handleBack = (): boolean => {
  const layer = layers.at(-1)
  if (!layer) {
    return false
  }
  layer.close()
  return true
}
