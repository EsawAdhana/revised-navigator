'use client'

import { useEffect } from 'react'

const LOCAL_DEV_API_KEY = 'hb_dev_4616b0a90405123621f12f855a5c7d5f'
const LOCAL_DEV_INGESTION_URL = 'http://localhost:8000'
const SDK_SCRIPT_ID = 'humanbehavior-sdk'
const SDK_SCRIPT_URL = 'https://unpkg.com/humanbehavior-js@0.7.0/packages/browser/dist/index.min.js'

function getHumanBehaviorConfig() {
  const apiKey =
    process.env.NEXT_PUBLIC_HUMANBEHAVIOR_API_KEY ||
    (process.env.NODE_ENV === 'development' ? LOCAL_DEV_API_KEY : '')

  const ingestionUrl =
    process.env.NEXT_PUBLIC_HUMANBEHAVIOR_INGESTION_URL ||
    (process.env.NODE_ENV === 'development' ? LOCAL_DEV_INGESTION_URL : '')

  return {
    apiKey,
    ingestionUrl,
    enabled:
      process.env.NEXT_PUBLIC_HUMANBEHAVIOR_DISABLED !== 'true' &&
      Boolean(apiKey && ingestionUrl),
  }
}

export function HumanBehaviorProvider() {
  useEffect(() => {
    const { apiKey, ingestionUrl, enabled } = getHumanBehaviorConfig()
    if (!enabled) return

    let cancelled = false

    const initialize = () => {
      if (cancelled || window.__humanBehaviorGlobalTracker) return

      // Use the class global (window.HumanBehaviorTracker) rather than the
      // window.humanbehavior wrapper: the wrapper loses `this` binding, so
      // init throws once logLevel/configureLogging is involved.
      if (!window.HumanBehaviorTracker?.init) {
        console.warn('HumanBehavior SDK loaded but did not expose window.HumanBehaviorTracker.init')
        return
      }

      window.HumanBehaviorTracker.init(apiKey, {
        ingestionUrl,
        logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
      })
    }

    if (window.HumanBehaviorTracker?.init) {
      initialize()
      return
    }

    let script = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = SDK_SCRIPT_ID
      script.src = SDK_SCRIPT_URL
      script.async = true
      document.head.appendChild(script)
    }

    script.addEventListener('load', initialize, { once: true })
    script.addEventListener('error', () => {
      console.warn('Failed to load HumanBehavior SDK')
    }, { once: true })

    return () => {
      cancelled = true
      script?.removeEventListener('load', initialize)
    }
  }, [])

  return null
}
