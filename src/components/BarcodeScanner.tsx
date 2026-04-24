import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import { lookupBarcode } from '../lib/barcodeApi'
import type { BarcodeProduct } from '../lib/barcodeApi'

interface BarcodeScannerProps {
  lang: Lang
  onResult: (product: BarcodeProduct) => void
  onNotFound: (barcode: string) => void
}

export interface BarcodeScannerHandle {
  reset: () => void
  stop:  () => void
}

type ScanState = 'checking' | 'idle' | 'scanning' | 'looking-up' | 'error-camera' | 'error-permission'

export const BarcodeScanner = forwardRef<BarcodeScannerHandle, BarcodeScannerProps>(
function BarcodeScanner({ lang, onResult, onNotFound }, ref) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const detectedRef = useRef(false)
  const [state, setState] = useState<ScanState>('checking')

  useImperativeHandle(ref, () => ({
    reset: () => {
      controlsRef.current?.stop()
      controlsRef.current = null
      detectedRef.current = false
      if (streamRef.current) setState('scanning')
      else setState('idle')
    },
    stop: () => {
      controlsRef.current?.stop()
      controlsRef.current = null
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      detectedRef.current = false
      setState('idle')
    },
  }))

  // On mount: try getUserMedia immediately without a gesture.
  // On iOS this succeeds silently if permission is already granted (no dialog),
  // and fails silently if it's not yet granted (no dialog either) — so it's
  // safe to call from useEffect. If it fails we fall back to the idle button,
  // which calls getUserMedia from a click handler (gesture → OS dialog).
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream
        setState('scanning')
      })
      .catch(() => {
        // Not yet granted — require a user tap before requesting.
        setState('idle')
      })
  }, []) // runs once on mount; component stays mounted across mode switches

  // Called directly from a click handler — user gesture triggers the OS dialog.
  const startCamera = () => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        streamRef.current = stream
        setState('scanning')
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : ''
        setState(
          msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
            ? 'error-permission'
            : 'error-camera'
        )
      })
  }

  // Start ZXing decoding once we have a stream.
  useEffect(() => {
    if (state !== 'scanning' || !streamRef.current) return

    detectedRef.current = false
    const reader = new BrowserMultiFormatReader()
    const stream = streamRef.current
    let cancelled = false  // guard against stale async callbacks

    const init = async () => {
      try {
        const controls = await reader.decodeFromStream(
          stream,
          videoRef.current!,
          async (result, _err) => {
            if (!result || detectedRef.current) return
            detectedRef.current = true
            controlsRef.current?.stop()
            const barcode = result.getText()
            setState('looking-up')
            try {
              const product = await lookupBarcode(barcode)
              if (product) onResult(product)
              else onNotFound(barcode)
            } catch {
              onNotFound(barcode)
            }
          }
        )
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
      } catch (e: unknown) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : ''
        setState(
          msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
            ? 'error-permission'
            : 'error-camera'
        )
      }
    }

    init()

    // Do NOT stop the stream on cleanup — the component stays mounted and
    // hidden when the user switches to manual mode. Keeping the stream alive
    // means no re-permission prompt when they switch back to scan.
    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [state, onResult, onNotFound])

  // Stop stream only when the component is truly unmounted (e.g. form closed).
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  const isRTL = lang === 'he'

  if (state === 'checking') {
    return (
      <div className="scanner-error">
        <span className="icon icon-sm" style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block', color: 'var(--text-3)' }}>
          progress_activity
        </span>
      </div>
    )
  }

  if (state === 'idle') {
    return (
      <div className="scanner-error" style={{ gap: 14 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: 'rgba(59,130,246,0.12)', border: '1.5px solid rgba(59,130,246,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="icon" style={{ fontSize: 32, color: 'var(--blue)' }}>barcode_scanner</span>
        </div>
        <button
          onClick={startCamera}
          style={{
            padding: '12px 28px', borderRadius: 12, fontSize: 14, fontWeight: 700,
            background: 'var(--blue)', color: '#fff', border: 'none',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span className="icon icon-sm">photo_camera</span>
          {lang === 'he' ? 'הפעל מצלמה' : 'Activate camera'}
        </button>
      </div>
    )
  }

  if (state === 'error-permission') {
    return (
      <div className="scanner-error">
        <span className="icon" style={{ fontSize: 36, color: 'var(--text-3)', marginBottom: 10 }}>photo_camera</span>
        <p style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center' }}>{t(lang, 'cameraPermission')}</p>
      </div>
    )
  }

  if (state === 'error-camera') {
    return (
      <div className="scanner-error">
        <span className="icon" style={{ fontSize: 36, color: 'var(--text-3)', marginBottom: 10 }}>videocam_off</span>
        <p style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center' }}>{t(lang, 'cameraError')}</p>
      </div>
    )
  }

  return (
    <div className="scanner-wrap">
      <div className="scanner-vf">
        <video ref={videoRef} className="scanner-video" muted playsInline autoPlay />
        <div className="scanner-frame">
          <span className="sc-corner sc-tl" />
          <span className="sc-corner sc-tr" />
          <span className="sc-corner sc-bl" />
          <span className="sc-corner sc-br" />
          {state === 'scanning' && <span className="sc-line" />}
        </div>
        <div className="scanner-vignette" />
      </div>

      <p className="scanner-hint" dir={isRTL ? 'rtl' : 'ltr'}>
        {state === 'looking-up'
          ? <>
              <span className="icon icon-sm" style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block', marginInlineEnd: 6 }}>
                progress_activity
              </span>
              {t(lang, 'lookingUp')}
            </>
          : t(lang, 'scanHint')
        }
      </p>
    </div>
  )
})
