import { useEffect } from 'react'

/**
 * Locks body scroll while `active` is true.
 * Uses position:fixed to prevent iOS rubber-band scrolling behind modals.
 */
export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return
    const scrollY = window.scrollY
    const { style } = document.body
    style.position = 'fixed'
    style.top      = `-${scrollY}px`
    style.left     = '0'
    style.right    = '0'
    style.overflow = 'hidden'
    return () => {
      style.position = ''
      style.top      = ''
      style.left     = ''
      style.right    = ''
      style.overflow = ''
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior })
    }
  }, [active])
}
