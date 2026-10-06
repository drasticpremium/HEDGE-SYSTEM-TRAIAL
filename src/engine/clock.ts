export type ClockMode = 'real' | 'sim'

export const SESSION_START_HOUR = 8
export const SESSION_END_HOUR = 17

export function getCurrentTimestamp(mode: ClockMode, simNow?: number): number {
  return mode === 'sim' ? (simNow ?? Date.now()) : Date.now()
}

export function getUtcClockParts(timestamp: number): { hour: number; minute: number; second: number } {
  const date = new Date(timestamp)
  return { hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() }
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function isSessionOpen(timestamp: number): boolean {
  const { hour } = getUtcClockParts(timestamp)
  return hour >= SESSION_START_HOUR && hour < SESSION_END_HOUR
}
