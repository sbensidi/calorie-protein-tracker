import { useRef, useState, useCallback } from 'react'

/** Tracks whether a sheet's scroll container has scrolled past the top. */
export function useSheetScroll() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrolledDown, setScrolledDown] = useState(false)

  const onScroll = useCallback(() => {
    setScrolledDown((scrollRef.current?.scrollTop ?? 0) > 4)
  }, [])

  return { scrollRef, scrolledDown, onScroll }
}
