import { useRef, useState } from 'react'
import type { Lang } from '../lib/i18n'
import { t } from '../lib/i18n'
import {
  resizeImageToBase64,
  analyzeNutritionImage,
  photoAnalysisRemaining,
  AiVisionQuotaError,
  AiRateLimitError,
  AiParseError,
  AiNetworkError,
} from '../lib/aiVision'
import type { VisionNutritionResult } from '../lib/aiVision'

type CaptureState =
  | { kind: 'idle' }
  | { kind: 'analyzing' }
  | { kind: 'result'; data: VisionNutritionResult }
  | { kind: 'error-parse' }
  | { kind: 'error-quota' }
  | { kind: 'error-network' }

interface Props {
  lang: Lang
  onResult: (result: VisionNutritionResult) => void
  onSwitchManual: () => void
}

export function PhotoNutritionCapture({ lang, onResult, onSwitchManual }: Props) {
  const [state, setState]       = useState<CaptureState>({ kind: 'idle' })
  const [preview, setPreview]   = useState<string | null>(null)
  const fileInputRef            = useRef<HTMLInputElement>(null)

  const remaining = photoAnalysisRemaining()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset after capturing file reference — order matters on iOS
    e.target.value = ''

    setState({ kind: 'analyzing' })
    setPreview(null)

    let base64: string
    try {
      base64 = await resizeImageToBase64(file, 512)
      setPreview(`data:image/jpeg;base64,${base64}`)
    } catch {
      setState({ kind: 'error-parse' })
      return
    }

    try {
      const result = await analyzeNutritionImage(base64, lang)
      setState({ kind: 'result', data: result })
      onResult(result)
    } catch (err) {
      if (err instanceof AiVisionQuotaError) {
        setState({ kind: 'error-quota' })
      } else if (err instanceof AiRateLimitError) {
        setState({ kind: 'error-quota' })
      } else if (err instanceof AiParseError) {
        setState({ kind: 'error-parse' })
      } else if (err instanceof AiNetworkError) {
        setState({ kind: 'error-network' })
      } else {
        setState({ kind: 'error-parse' })
      }
    }
  }

  const triggerCapture = () => fileInputRef.current?.click()

  const reset = () => {
    setState({ kind: 'idle' })
    setPreview(null)
  }

  const isRTL = lang === 'he'

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (state.kind === 'idle') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '14px 0 4px',
      }}>
        <div style={{
          width: '100%', height: 1, background: 'var(--border)', margin: '0 0 6px',
        }} />

        <button
          onClick={triggerCapture}
          disabled={remaining === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 22px', borderRadius: 12, fontSize: 14, fontWeight: 700,
            background: remaining > 0 ? 'var(--surface-2)' : 'var(--surface-1)',
            color:      remaining > 0 ? 'var(--text)' : 'var(--text-3)',
            border: '1.5px solid var(--border)',
            cursor: remaining > 0 ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
          }}
        >
          <span className="icon icon-sm" style={{ color: remaining > 0 ? 'var(--accent)' : 'var(--text-3)' }}>
            photo_camera
          </span>
          {t(lang, 'photoScanBtn')}
        </button>

        {remaining < 5 && (
          <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }} dir={isRTL ? 'rtl' : 'ltr'}>
            {t(lang, 'photoRemaining')} {remaining}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    )
  }

  // ── Analyzing ─────────────────────────────────────────────────────────────
  if (state.kind === 'analyzing') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        padding: '18px 0',
      }}>
        {preview && (
          <img
            src={preview}
            alt=""
            style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, border: '1.5px solid var(--border)' }}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 13 }}>
          <span className="icon icon-sm" style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block' }}>
            progress_activity
          </span>
          {t(lang, 'photoAnalyzing')}
        </div>
      </div>
    )
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (state.kind === 'result') {
    const { data } = state
    const confidenceKey =
      data.confidence === 'high' ? 'photoConfidenceHigh'
      : data.confidence === 'low' ? 'photoConfidenceLow'
      : 'photoConfidenceMed'
    const confidenceColor =
      data.confidence === 'high' ? 'var(--positive-hi)'
      : data.confidence === 'low' ? 'var(--danger-hi)'
      : 'var(--warning)'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0 4px' }}
           dir={isRTL ? 'rtl' : 'ltr'}>

        <div style={{ width: '100%', height: 1, background: 'var(--border)', margin: '0 0 2px' }} />

        {preview && (
          <img
            src={preview}
            alt=""
            style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, border: '1.5px solid var(--border)', alignSelf: 'center' }}
          />
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
            {t(lang, 'photoIdentified')}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>
            {data.identified}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: confidenceColor,
            background: 'var(--surface-1)',
            border: `1px solid ${confidenceColor}`,
            borderRadius: 6, padding: '1px 6px',
          }}>
            {t(lang, confidenceKey)}
          </span>
        </div>

        {/* Disclaimer — always shown */}
        <div style={{
          background: 'var(--warning-fill)',
          border: '1px solid var(--warning-border)',
          borderRadius: 10, padding: '8px 12px',
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <span className="icon icon-sm" style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }}>
            info
          </span>
          <p style={{ fontSize: 11, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 }}>
            {t(lang, 'photoDisclaimer')}
          </p>
        </div>

        <button
          onClick={reset}
          style={{
            alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: 'var(--surface-2)', color: 'var(--text-2)',
            border: '1.5px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span className="icon icon-sm">photo_camera</span>
          {t(lang, 'photoRetry')}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    )
  }

  // ── Error: quota ──────────────────────────────────────────────────────────
  if (state.kind === 'error-quota') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '14px 12px 4px', textAlign: 'center',
      }} dir={isRTL ? 'rtl' : 'ltr'}>
        <div style={{ width: '100%', height: 1, background: 'var(--border)', margin: '0 0 2px' }} />
        <span className="icon" style={{ fontSize: 28, color: 'var(--warning)' }}>hourglass_empty</span>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.5, maxWidth: 280 }}>
          {t(lang, 'photoQuotaExceeded')}
        </p>
      </div>
    )
  }

  // ── Error: parse (can't identify) ─────────────────────────────────────────
  if (state.kind === 'error-parse') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '14px 12px 4px',
      }} dir={isRTL ? 'rtl' : 'ltr'}>
        <div style={{ width: '100%', height: 1, background: 'var(--border)', margin: '0 0 2px' }} />
        <span className="icon" style={{ fontSize: 28, color: 'var(--text-3)' }}>hide_image</span>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, textAlign: 'center', lineHeight: 1.6 }}>
          {t(lang, 'photoFailed')}{' '}
          <button
            onClick={onSwitchManual}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--accent)', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline',
            }}
          >
            {t(lang, 'photoSwitchManual')}
          </button>
        </p>
        <button
          onClick={triggerCapture}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
            background: 'var(--surface-2)', color: 'var(--text-2)',
            border: '1.5px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span className="icon icon-sm">photo_camera</span>
          {t(lang, 'photoRetry')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>
    )
  }

  // ── Error: network ────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      padding: '14px 12px 4px',
    }} dir={isRTL ? 'rtl' : 'ltr'}>
      <div style={{ width: '100%', height: 1, background: 'var(--border)', margin: '0 0 2px' }} />
      <span className="icon" style={{ fontSize: 28, color: 'var(--text-3)' }}>wifi_off</span>
      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0 }}>
        {t(lang, 'photoGroqUnavailable')}
      </p>
      <button
        onClick={triggerCapture}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 16px', borderRadius: 10, fontSize: 12, fontWeight: 600,
          background: 'var(--surface-2)', color: 'var(--text-2)',
          border: '1.5px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span className="icon icon-sm">photo_camera</span>
        {t(lang, 'photoRetry')}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
}
