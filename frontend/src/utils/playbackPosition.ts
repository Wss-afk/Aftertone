export const PLAYBACK_POSITION_KEY = 'night-signal.playback-position'

export interface PlaybackPosition {
  trackId: number
  createdAt: string
  time: number
}

export function readPlaybackPosition(): PlaybackPosition | undefined {
  try {
    const position: Partial<PlaybackPosition> | null = JSON.parse(localStorage.getItem(PLAYBACK_POSITION_KEY) ?? 'null')
    if (typeof position?.trackId === 'number' && Number.isSafeInteger(position.trackId) && position.trackId > 0
      && typeof position.createdAt === 'string' && position.createdAt.length > 0
      && typeof position.time === 'number' && Number.isFinite(position.time) && position.time >= 0) {
      return { trackId: position.trackId, createdAt: position.createdAt, time: position.time }
    }
  } catch { /* Playback also works without readable browser storage. */ }
}

export function writePlaybackPosition(position: PlaybackPosition) {
  try { localStorage.setItem(PLAYBACK_POSITION_KEY, JSON.stringify(position)) }
  catch { /* Playback also works without writable browser storage. */ }
}

export function forgetPlaybackPosition(trackId: number, createdAt: string) {
  const position = readPlaybackPosition()
  if (position?.trackId !== trackId || position.createdAt !== createdAt) return
  try { localStorage.removeItem(PLAYBACK_POSITION_KEY) }
  catch { /* A stale position will be ignored when the library loads. */ }
}
