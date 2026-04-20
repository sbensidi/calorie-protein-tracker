import { useEffect, useRef, useState } from 'react'
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

type ScanState = 'scanning' | 'looking-up' | 'error-camera' | 'error-permission'

export function BarcodeScanner({ lang, onResult, onNotFound }: BarcodeScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const detectedRef = useRef(false)
  const [state, setState] = useState<ScanState>('scanning')

  useEffect(() => {
    detectedRef.current = false
    const reader = new BrowserMultiFormatReader()

    const init = async () => {
      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          async (result, _err) => {
            if (!result || detectedRef.current) return
            detectedRef.current = true
            controlsRef.current?.stop()
            const barcode = result.getText()
            setState('looking-up')

            try {
              const product = await lookupBarcode(barcode)
              if (product) {
                onResult(product)
              } else {
                onNotFound(barcode)
              }
            } catch {
              onNotFound(barcode)
            }
          }
        )
        controlsRef.current = controls
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
          setState('error-permission')
        } else {
          setState('error-camera')
        }
      }
    }

    init()

    return () => {
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [onResult, onNotFound])

  const isRTL = lang === 'he'

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
}
