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

interface HistoryEntry { id: number; source?: Track; queued: boolean }

function shuffle(ids: number[]) {
  for (let i = ids.length - 1; i > 0; i--) {
    const other = Math.floor(Math.random() * (i + 1))
    const value = ids[i]!
    ids[i] = ids[other]!
    ids[other] = value
  }
  return ids
}

export function usePlaybackQueue(tracks: Ref<Track[]>, current: Ref<Track | undefined>, source: Ref<Track | undefined>, library: Ref<Track[]>) {
  const mode = ref<PlaybackMode>(savedMode())
  const history = ref<HistoryEntry[]>([])
  const cursor = ref(-1)
  const queuedIds = ref<number[]>([])
  const sourceOrder = ref<number[]>()
  const manualActive = ref(false)
  const currentIndex = computed(() => tracks.value.findIndex(track => track.id === source.value?.id))
  const libraryById = computed(() => new Map(library.value.map(track => [track.id, track])))
  const sourceById = computed(() => new Map(tracks.value.map(track => [track.id, track])))
  const queuedTracks = computed(() => queuedIds.value.flatMap(id => libraryById.value.get(id) ?? []))
  const hasQueuedTracks = computed(() => queuedTracks.value.length > 0)

  watch(mode, value => {
    if (sourceOrder.value !== undefined) {
      const remaining = new Set(sourceOrder.value)
      const ids = tracks.value.filter(track => remaining.has(track.id)).map(track => track.id)
      sourceOrder.value = value === 'shuffle' ? shuffle(ids) : ids
    }
    try { localStorage.setItem(PLAYBACK_MODE_KEY, value) }
    catch { /* A mode change never depends on saving preferences. */ }
  })

  function recordSelection(track: Track, queued = false, historyPosition?: number) {
    if (historyPosition !== undefined) {
      cursor.value = historyPosition
      source.value = history.value[historyPosition]?.source
    } else {
      if (!queued) source.value = track
      const previous = history.value[cursor.value]
      if (previous?.id !== track.id || previous.queued !== queued || previous.source?.id !== source.value?.id) {
        history.value = [...history.value.slice(0, cursor.value + 1), { id: track.id, source: source.value, queued }]
        cursor.value = history.value.length - 1
      }
    }
    manualActive.value = queued
  }

  function resetQueue() { queuedIds.value = []; sourceOrder.value = undefined }
  function resetHistory() { history.value = []; cursor.value = -1 }

  function historyTarget(direction: -1 | 1) {
    for (let position = cursor.value + direction; position >= 0 && position < history.value.length; position += direction) {
      const entry = history.value[position]
      if (!entry || entry.id === current.value?.id) continue
      const track = (entry.queued ? libraryById.value : sourceById.value).get(entry.id)
      if (track) return { track, entry, position }
    }
  }

  const previousHistory = computed(() => historyTarget(-1))
  const nextHistory = computed(() => historyTarget(1))
  const sourceTracks = computed(() => {
    if (sourceOrder.value !== undefined) return sourceOrder.value.flatMap(id => sourceById.value.get(id) ?? [])
    if (mode.value === 'shuffle') return tracks.value.filter(track => track.id !== current.value?.id)
    return currentIndex.value < 0 ? [] : tracks.value.slice(currentIndex.value + 1)
  })

  function prepareUpcoming() {
    if (mode.value !== 'shuffle' || (sourceTracks.value.length > 0 && sourceOrder.value !== undefined)) return
    const excluded = new Set([...queuedIds.value, current.value?.id])
    const visited = [...new Set(history.value.slice(cursor.value + 1)
      .filter(entry => !entry.queued && sourceById.value.has(entry.id) && !excluded.has(entry.id))
      .map(entry => entry.id))]
    for (const id of visited) excluded.add(id)
    const candidates = shuffle(tracks.value.filter(track => !excluded.has(track.id)).map(track => track.id))
    sourceOrder.value = [...visited, ...candidates]
  }

  function enqueueNext(track: Track) {
    if (!libraryById.value.has(track.id)) return
    if (mode.value === 'shuffle') prepareUpcoming()
    sourceOrder.value = sourceTracks.value.filter(item => item.id !== track.id).map(item => item.id)
    queuedIds.value = [track.id, ...queuedIds.value.filter(id => id !== track.id && libraryById.value.has(id))]
  }

  function moveTrack(id: number, direction: -1 | 1, queued: boolean) {
    const ids = (queued ? queuedTracks.value : sourceTracks.value).map(track => track.id)
    const index = ids.indexOf(id)
    const destination = index + direction
    if (index < 0 || destination < 0 || destination >= ids.length) return
    ids[index] = ids[destination]!
    ids[destination] = id
    if (queued) queuedIds.value = ids
    else sourceOrder.value = ids
  }

  function removeQueued(id: number) { queuedIds.value = queuedIds.value.filter(value => value !== id) }

  const canPrevious = computed(() => !!current.value && (manualActive.value || mode.value === 'shuffle'
    ? !!previousHistory.value : currentIndex.value > 0 || sourceOrder.value !== undefined && !!previousHistory.value))
  const canNext = computed(() => !!current.value && (hasQueuedTracks.value
    || sourceTracks.value.length > 0 || mode.value === 'shuffle' && tracks.value.some(track => track.id !== current.value?.id)))

  function step(direction: -1 | 1): Track | undefined {
    if (!current.value) return
    if (direction > 0 && hasQueuedTracks.value) {
      const track = queuedTracks.value[0]!
      removeQueued(track.id)
      recordSelection(track, true)
      return track
    }
    const visited = direction < 0 ? previousHistory.value : nextHistory.value
    const useHistory = direction < 0 ? mode.value === 'shuffle' || manualActive.value || sourceOrder.value !== undefined
      : sourceOrder.value === undefined && mode.value === 'shuffle'
    if (visited && useHistory) {
      if (direction < 0) {
        const id = current.value.id
        if (manualActive.value) queuedIds.value = [id, ...queuedIds.value.filter(value => value !== id)]
        else if (sourceOrder.value !== undefined && !queuedIds.value.includes(id)) {
          sourceOrder.value = [id, ...sourceOrder.value.filter(value => value !== id)]
        }
      }
      recordSelection(visited.track, visited.entry.queued, visited.position)
      return visited.track
    }
    let track: Track | undefined
    if (direction < 0) {
      if (mode.value === 'shuffle' || currentIndex.value <= 0) return
      track = tracks.value[currentIndex.value - 1]
      sourceOrder.value = undefined
    } else {
      if (mode.value === 'shuffle' && !sourceTracks.value.length) sourceOrder.value = undefined
      track = sourceTracks.value[0]
      if (mode.value === 'shuffle' && sourceOrder.value === undefined) {
        const candidates = sourceTracks.value
        track = candidates[Math.floor(Math.random() * candidates.length)]
      }
      if (track && sourceOrder.value !== undefined) {
        const selectedId = track.id
        sourceOrder.value = sourceOrder.value.filter(id => id !== selectedId)
      }
    }
    if (track) {
      recordSelection(track)
      return track
    }
  }

  return {
    mode, currentIndex, canPrevious, canNext, recordSelection, step, resetHistory, resetQueue,
    queuedTracks, sourceTracks, hasQueuedTracks, manualActive, enqueueNext, moveTrack, removeQueued, prepareUpcoming,
  }
}
