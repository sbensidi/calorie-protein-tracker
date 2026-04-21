import { useEffect } from 'react'

/**
 * Locks document.body scroll while `active` is true.
 * Restores the previous overflow value on cleanup.
 */
export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [active])
}
