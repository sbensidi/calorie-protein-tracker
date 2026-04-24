import { useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: string
  message: string
  type: ToastType
  action?: ToastAction
  durationMs?: number
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((
    message: string,
    type: ToastType = 'info',
    options?: { action?: ToastAction; durationMs?: number },
  ) => {
    const id = crypto.randomUUID()
    const durationMs = options?.durationMs ?? 4000
    setToasts(prev => [...prev, { id, message, type, action: options?.action, durationMs }])
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, durationMs)
    // Return a cancel function (used by undo)
    return () => {
      clearTimeout(timer)
      setToasts(prev => prev.filter(t => t.id !== id))
    }
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, showToast, dismissToast }
}
