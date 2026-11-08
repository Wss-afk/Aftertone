import { computed, ref, watch, type Ref } from 'vue'
import type { Track } from '../api/tracks'

export type PlaybackMode = 'sequential' | 'repeat-one' | 'shuffle'
export const PLAYBACK_MODE_KEY = 'night-signal.playback-mode'

function savedMode(): PlaybackMode {
  try {
    const value = localStorage.getItem(PLAYBACK_MODE_KEY)
    if (value === 'repeat-one' || value === 'shuffle') return value
  } catch { /* Playback remains available when browser storage is blocked. */ }
  return 'sequential'
}

interface QueueSelection { track: Track; historyPosition?: number }

export function usePlaybackQueue(tracks: Ref<Track[]>, current: Ref<Track | undefined>) {
  const mode = ref<PlaybackMode>(savedMode())
  const history = ref<number[]>([])
  const cursor = ref(-1)
  const currentIndex = computed(() => tracks.value.findIndex(track => track.id === current.value?.id))

  watch(mode, value => {
    try { localStorage.setItem(PLAYBACK_MODE_KEY, value) }
    catch { /* A mode change never depends on saving preferences. */ }
  })

  function recordSelection(id: number, historyPosition?: number) {
    if (historyPosition !== undefined && history.value[historyPosition] === id) {
      cursor.value = historyPosition
    } else if (history.value[cursor.value] !== id) {
      history.value = [...history.value.slice(0, cursor.value + 1), id]
      cursor.value = history.value.length - 1
    }
  }

  function resetHistory() { history.value = []; cursor.value = -1 }

  function historyTarget(direction: -1 | 1): QueueSelection | undefined {
    for (let position = cursor.value + direction; position >= 0 && position < history.value.length; position += direction) {
      const id = history.value[position]
      if (id === current.value?.id) continue
      const track = tracks.value.find(item => item.id === id)
      if (track) return { track, historyPosition: position }
    }
  }

  const previousHistory = computed(() => historyTarget(-1))
  const nextHistory = computed(() => historyTarget(1))
  const canPrevious = computed(() => currentIndex.value >= 0 && (mode.value === 'shuffle' ? !!previousHistory.value : currentIndex.value > 0))
  const canNext = computed(() => currentIndex.value >= 0 && (mode.value === 'shuffle'
    ? tracks.value.some(track => track.id !== current.value?.id)
    : currentIndex.value < tracks.value.length - 1))

  function step(direction: -1 | 1): QueueSelection | undefined {
    if (currentIndex.value < 0) return
    if (mode.value !== 'shuffle') {
      const track = tracks.value[currentIndex.value + direction]
      return track ? { track } : undefined
    }
    const visited = direction < 0 ? previousHistory.value : nextHistory.value
    if (visited) return visited
    if (direction < 0) return
    const candidates = tracks.value.filter(track => track.id !== current.value?.id)
    if (!candidates.length) return
    const track = candidates[Math.floor(Math.random() * candidates.length)]
    return track ? { track } : undefined
  }

  return { mode, currentIndex, canPrevious, canNext, recordSelection, step, resetHistory }
}
