import { create } from 'zustand'

export type ComposerAction = 'voice' | 'scan'

export const useComposerAction = create<{ pending: ComposerAction | null; seq: number }>(() => ({
  pending: null,
  seq: 0,
}))

export const requestComposerAction = (action: ComposerAction) =>
  useComposerAction.setState((state) => ({ pending: action, seq: state.seq + 1 }))

export const clearComposerAction = (seq: number) =>
  useComposerAction.setState((state) =>
    state.seq === seq ? { pending: null, seq: state.seq } : state
  )
