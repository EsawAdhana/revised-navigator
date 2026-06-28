'use client'

type HumanBehaviorTracker = {
  customEvent?: (eventName: string, properties?: Record<string, unknown>) => Promise<void>
  identifyUser?: (properties: Record<string, unknown>) => Promise<string>
}

type HumanBehaviorSdk = {
  init?: (
    apiKey: string,
    options?: Record<string, unknown>
  ) => unknown
}

declare global {
  interface Window {
    humanbehavior?: HumanBehaviorSdk
    HumanBehaviorTracker?: HumanBehaviorSdk
    __humanBehaviorGlobalTracker?: HumanBehaviorTracker
  }
}

export function getHumanBehaviorTracker(): HumanBehaviorTracker | undefined {
  if (typeof window === 'undefined') return undefined
  return window.__humanBehaviorGlobalTracker
}

export function trackHumanBehaviorEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
): Promise<void> | undefined {
  return getHumanBehaviorTracker()?.customEvent?.(eventName, properties)
}

export function identifyHumanBehaviorUser(
  properties: Record<string, unknown>
): Promise<string> | undefined {
  return getHumanBehaviorTracker()?.identifyUser?.(properties)
}
