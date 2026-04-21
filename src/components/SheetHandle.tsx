/**
 * SheetHandle — the sticky top bar for every bottom sheet.
 *
 * Contains:
 *  • drag handle pill
 *  • optional close (X) button
 *  • subtle bottom border (matches app header)
 *  • gradient fade that appears when the sheet content is scrolled
 *
 * Usage:
 *   const { scrollRef, scrolledDown, onScroll } = useSheetScroll()
 *   …
 *   <SheetHandle scrolledDown={scrolledDown} onClose={…} />
 *   <div ref={scrollRef} onScroll={onScroll} style={{ overflowY: 'auto', flex: 1 }}>
 *     {content}
 *   </div>
 */

interface SheetHandleProps {
  scrolledDown: boolean
  onClose?: () => void
}

export function SheetHandle({ scrolledDown, onClose }: SheetHandleProps) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Bar itself */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        alignItems: 'center',
        padding: '12px 0 10px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />

        {onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute', insetInlineEnd: 12,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', padding: 4, display: 'flex',
            }}
          >
            <span className="icon icon-sm">close</span>
          </button>
        )}
      </div>

      {/* Gradient fade — appears when scrolled */}
      <div style={{
        position: 'absolute',
        top: '100%', left: 0, right: 0,
        height: 24,
        background: 'linear-gradient(to bottom, var(--bg), transparent)',
        pointerEvents: 'none',
        opacity: scrolledDown ? 1 : 0,
        transition: 'opacity 0.35s ease',
        zIndex: 1,
      }} />
    </div>
  )
}
