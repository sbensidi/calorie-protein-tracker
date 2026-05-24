import { useEffect } from 'react'

/**
 * Locks body scroll while `active` is true.
 *
 * Sets overflow:hidden on <html> (not position:fixed on body) so that
 * position:fixed children (modals, backdrops) remain anchored to the
 * viewport instead of being shifted by the body's top offset on iOS Safari.
 */
export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return
    const scrollY = window.scrollY
    const html = document.documentElement
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    return () => {
      html.style.overflow = ''
      html.style.overscrollBehavior = ''
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior })
    }
  }, [active])
}
