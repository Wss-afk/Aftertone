<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { deleteTrack, listTracks, renameTrack, setTrackFavorite, type Track } from './api/tracks'
import { addToPlaylist, createPlaylist, removeFromPlaylist, renamePlaylist, type Playlist } from './api/playlists'
import TrackList from './components/TrackList.vue'
import UploadPanel from './components/UploadPanel.vue'
import DeleteTrackDialog from './components/DeleteTrackDialog.vue'
import RenameTrackDialog from './components/RenameTrackDialog.vue'
import StorageStatusPanel from './components/StorageStatusPanel.vue'
import { getStorageStatus, type StorageStatus } from './api/storage'
import { usePlaybackQueue } from './composables/usePlaybackQueue'
import PlayerControls from './components/PlayerControls.vue'
import PlaybackModeButton from './components/PlaybackModeButton.vue'
import TrackArtwork from './components/TrackArtwork.vue'
import FavoriteButton from './components/FavoriteButton.vue'
import PlaylistDialog from './components/PlaylistDialog.vue'
import { usePlaylists } from './composables/usePlaylists'
import { forgetPlaybackPosition, readPlaybackPosition, writePlaybackPosition } from './utils/playbackPosition'
import PlaybackQueuePanel from './components/PlaybackQueuePanel.vue'
import ThemeSelect from './components/ThemeSelect.vue'
import VolumeControls from './components/VolumeControls.vue'
import NowPlayingView from './components/NowPlayingView.vue'

type LibraryView = 'library' | 'favorites' | number
type PlaylistPrompt = { kind: 'create' } | { kind: 'rename'; playlist: Playlist } | { kind: 'add'; track: Track } | { kind: 'delete'; playlist: Playlist }
const appName = 'Aftertone'

const tracks = ref<Track[]>([])
const loading = ref(true)
const listError = ref('')
const playerError = ref('')
const current = ref<Track>()
const queueSource = ref<Track>()
const queueOpen = ref(false)
const nowPlayingOpen = ref(false)
watch(current, track => { if (!track) nowPlayingOpen.value = false })
const audio = ref<HTMLAudioElement>()
const playing = ref(false)
const buffering = ref(false)
const playbackTime = ref(0)
const duration = ref(0)
let positionToRestore = readPlaybackPosition()
let lastSavedPosition = positionToRestore
let pendingSeek: { time: number; restartAtEnd?: boolean } | undefined
let persistProgress = false
const volume = ref(1)
const muted = ref(false)
let audibleVolume = 1
const pendingDelete = ref<Track>()
const deleting = ref(false)
const deleteError = ref('')
const pendingRename = ref<Track>()
const renaming = ref(false)
const renameError = ref('')
const notice = ref('')
const capacity = ref<StorageStatus>()
const capacityLoading = ref(true)
const capacityError = ref('')
const searchQuery = ref('')
const searchInput = ref<HTMLInputElement>()
const view = ref<LibraryView>('library')
const queueScope = ref<LibraryView>('library')
const playlistPrompt = ref<PlaylistPrompt>()
const {
  playlists, loading: playlistsLoading, loadError: playlistsLoadError, busy: playlistBusy,
  error: playlistError, refresh: refreshPlaylists, save: savePlaylist, remove: removePlaylist,
} = usePlaylists()
const selectedPlaylist = computed(() => playlists.value.find(playlist => playlist.id === view.value))
watch(selectedPlaylist, (playlist, previous) => {
  if (!playlist && previous?.id === view.value) changeView('library')
})
const queuePlaylist = computed(() => playlists.value.find(playlist => playlist.id === queueScope.value))
const playlistPosition = ref<number>()
watch(() => queuePlaylist.value?.entries.find(entry => entry.trackId === queueSource.value?.id)?.position, position => {
  if (position !== undefined) playlistPosition.value = position
}, { flush: 'sync' })
const favoriting = ref(new Set<number>())
const favoriteError = ref('')
const favoriteTracks = computed(() => tracks.value.filter(track => track.favorite))
const tracksById = computed(() => new Map(tracks.value.map(track => [track.id, track])))
const viewTracks = computed(() => {
  if (view.value === 'library') return tracks.value
  if (view.value === 'favorites') return favoriteTracks.value
  return (selectedPlaylist.value?.entries ?? []).flatMap(({ trackId }) => tracksById.value.get(trackId) ?? [])
})
const queueTracks = computed(() => {
  if (queueScope.value === 'library') return tracks.value
  if (queueScope.value === 'favorites') return tracks.value.filter(track => track.favorite || track.id === queueSource.value?.id)
  const entries = (queuePlaylist.value?.entries ?? []).filter(entry => tracksById.value.has(entry.trackId))
  const queue = entries.flatMap(({ trackId }) => tracksById.value.get(trackId) ?? [])
  const playingTrack = queueSource.value
  if (playingTrack && tracksById.value.has(playingTrack.id) && !entries.some(entry => entry.trackId === playingTrack.id)) {
    // Preserve the removed song's slot until the next selection, using stable membership positions.
    const next = entries.findIndex(entry => entry.position > (playlistPosition.value ?? Infinity))
    queue.splice(next < 0 ? queue.length : next, 0, playingTrack)
  }
  return queue
})
const viewTitle = computed(() => view.value === 'favorites' ? '我喜欢的音乐' : selectedPlaylist.value?.name ?? '我的曲库')
const normalizeSearch = (value: string) => value.normalize('NFKC').toLowerCase().trim()
const searchTerms = computed(() => normalizeSearch(searchQuery.value).split(/\s+/u).filter(Boolean))
const searching = computed(() => searchTerms.value.length > 0)
const visibleTracks = computed(() => searching.value ? viewTracks.value.filter(track => {
  const information = normalizeSearch(`${track.title} ${track.artist || '未知歌手'}`)
  return searchTerms.value.every(term => information.includes(term))
}) : viewTracks.value)
let capacityRequest = 0
let playRequest = 0
let listRequest = 0
const {
  mode: playbackMode, currentIndex, canPrevious, canNext, recordSelection, step, resetHistory, resetQueue,
  queuedTracks, sourceTracks, hasQueuedTracks, manualActive, enqueueNext, moveTrack, removeQueued, prepareUpcoming,
} = usePlaybackQueue(queueTracks, current, queueSource, tracks)
const queueTitle = computed(() => queueScope.value === 'favorites' ? '我喜欢的音乐'
  : typeof queueScope.value === 'number' ? queuePlaylist.value?.name ?? '原歌单' : '我的曲库')
watch([queueOpen, playbackMode, current, queueTracks], () => { if (queueOpen.value) prepareUpcoming() })
const libraryNote = computed(() => {
  if (!tracks.value.length) return '你的音乐保存在这台电脑上。'
  if (queuePlaylist.value && current.value) return `正在播放歌单「${queuePlaylist.value.name}」。切换页面和搜索不会改变当前播放队列。`
  if (typeof queueScope.value === 'number' && current.value) return '当前歌曲可继续播放。重新点歌后按所选列表播放。'
  if (queueScope.value === 'favorites' && current.value) {
    const mode = playbackMode.value === 'shuffle' ? '随机播放' : playbackMode.value === 'repeat-one' ? '单曲循环' : '顺序播放'
    return `正在按“我喜欢的音乐”${mode}。切换页面和搜索不会改变当前播放队列。`
  }
  if (view.value === 'favorites') return '点歌后按收藏列表播放；取消收藏不会打断正在播放的歌曲。'
  if (selectedPlaylist.value) return '从这里点歌后，按歌单顺序播放。'
  if (playbackMode.value === 'shuffle') return searching.value ? '搜索只筛选列表，随机播放仍从完整曲库选歌。' : '随机播放会避开当前歌曲，上一首返回播放历史。'
  if (playbackMode.value === 'repeat-one') return searching.value ? '搜索只筛选列表，当前歌曲会单曲循环。' : '单曲循环当前歌曲，手动切歌仍按最近上传顺序。'
  return searching.value ? '搜索只筛选列表，播放队列仍按最近上传排列。' : '从上到下，就是今晚的播放顺序。'
})

function changeView(value: LibraryView) {
  view.value = value
  searchQuery.value = ''
  notice.value = ''
  favoriteError.value = ''
  playlistError.value = ''
}

function refreshVisible() {
  void refresh()
  void refreshPlaylists()
}

function openPlaylistPrompt(prompt: PlaylistPrompt) {
  if (playlistBusy.value || pendingRename.value || pendingDelete.value) return
  playlistError.value = ''
  notice.value = ''
  playlistPrompt.value = prompt
}

async function savePlaylistName(name: string) {
  const prompt = playlistPrompt.value
  if (prompt?.kind !== 'create' && prompt?.kind !== 'rename') return
  const saved = await savePlaylist(() => prompt.kind === 'create' ? createPlaylist(name) : renamePlaylist(prompt.playlist.id, name))
  if (!saved) return
  playlistPrompt.value = undefined
  if (prompt.kind === 'create') changeView(saved.id)
  notice.value = prompt.kind === 'create' ? `已新建歌单「${saved.name}」。` : `已改名为「${saved.name}」。`
}

async function addTrackToPlaylist(id: number) {
  const prompt = playlistPrompt.value
  if (prompt?.kind !== 'add') return
  const saved = await savePlaylist(() => addToPlaylist(id, prompt.track.id))
  if (!saved) return
  playlistPrompt.value = undefined
  notice.value = `已将「${prompt.track.title}」加入「${saved.name}」。`
}

async function removeTrackFromPlaylist(track: Track) {
  const playlist = selectedPlaylist.value
  if (!playlist) return
  notice.value = ''
  const saved = await savePlaylist(() => removeFromPlaylist(playlist.id, track.id))
  if (!saved) return
  notice.value = `已从「${saved.name}」移出「${track.title}」。`
  if (view.value === playlist.id) {
    await nextTick()
    if (document.activeElement === document.body) searchInput.value?.focus()
  }
}

async function confirmPlaylistDeletion() {
  const prompt = playlistPrompt.value
  if (prompt?.kind !== 'delete') return
  const { id, name } = prompt.playlist
  const wasViewingPlaylist = view.value === id
  if (await removePlaylist(id) === undefined) return
  playlistPrompt.value = undefined
  if (view.value === id) changeView('library')
  notice.value = `已删除歌单「${name}」。`
  if (wasViewingPlaylist && view.value === 'library') {
    await nextTick()
    searchInput.value?.focus()
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchInput.value?.focus()
}

async function refresh() {
  const request = ++listRequest
  loading.value = true
  listError.value = ''
  favoriteError.value = ''
  try {
    const result = await listTracks()
    if (request === listRequest) {
      tracks.value = result.map(track => favoriting.value.has(track.id)
        ? { ...track, favorite: tracks.value.find(item => item.id === track.id)?.favorite ?? track.favorite } : track)
      const updated = tracks.value.find(track => track.id === current.value?.id)
      if (current.value && updated) current.value = { ...current.value, favorite: updated.favorite }
      restorePlaybackPosition()
    }
  }
  catch (error) { if (request === listRequest) listError.value = error instanceof Error ? error.message : '曲库加载失败，请重试。' }
  finally { if (request === listRequest) loading.value = false }
}

async function toggleFavorite(track: Track) {
  if (favoriting.value.has(track.id) || deleting.value || renaming.value || pendingDelete.value || pendingRename.value) return
  favoriting.value.add(track.id)
  favoriteError.value = ''
  notice.value = ''
  ++listRequest
  loading.value = false
  try {
    const updated = await setTrackFavorite(track.id, !track.favorite)
    ++listRequest // Ignore refreshes that began before this save completed.
    loading.value = false
    tracks.value = tracks.value.map(item => item.id === updated.id ? { ...item, favorite: updated.favorite } : item)
    if (current.value?.id === updated.id) current.value = { ...current.value, favorite: updated.favorite }
    notice.value = updated.favorite ? `已收藏「${track.title}」。` : `已取消「${track.title}」的收藏，歌曲仍保留在曲库。`
  } catch (error) {
    favoriteError.value = error instanceof Error ? error.message : '收藏状态保存失败，请重试。'
  } finally { favoriting.value.delete(track.id) }
}

function selectFromView(track: Track) {
  if (queueScope.value !== view.value) {
    resetHistory()
    playlistPosition.value = undefined
  }
  queueScope.value = view.value
  resetQueue()
  recordSelection(track)
  void select(track)
}

function playNext(track: Track) {
  if (!current.value) { selectFromView(track); return }
  enqueueNext(track)
  notice.value = `「${track.title}」将下一首播放。`
}

async function refreshCapacity() {
  const request = ++capacityRequest
  capacityLoading.value = true
  capacityError.value = ''
  try { const value = await getStorageStatus(); if (request === capacityRequest) capacity.value = value }
  catch (error) { if (request === capacityRequest) capacityError.value = error instanceof Error ? error.message : '容量信息暂不可用，请重试。' }
  finally { if (request === capacityRequest) capacityLoading.value = false }
}

async function select(track: Track) {
  const request = ++playRequest
  playerError.value = ''
  positionToRestore = undefined
  persistProgress = true
  if (current.value?.id !== track.id) {
    pendingSeek = undefined
    playbackTime.value = 0
    duration.value = 0
    rememberPosition(track, 0, true)
  }
  current.value = track
  await nextTick()
  if (request !== playRequest || !audio.value) return
  if (audio.value.error) audio.value.load()
  try { await audio.value.play() }
  catch {
    if (request === playRequest) {
      playing.value = false
      buffering.value = false
      playerError.value = '暂时无法播放，请检查连接后重试。'
    }
  }
}

function restorePlaybackPosition() {
  const position = positionToRestore
  positionToRestore = undefined
  if (!position) return
  const track = tracksById.value.get(position.trackId)
  if (track?.createdAt !== position.createdAt) {
    forgetPlaybackPosition(position.trackId, position.createdAt)
    return
  }
  current.value = track
  pendingSeek = { time: position.time, restartAtEnd: true }
  recordSelection(track)
}

function currentAudio() {
  const element = audio.value
  if (!element || !current.value || element.getAttribute('src') !== current.value.audioUrl) return
  if (!element.currentSrc || element.currentSrc === element.src) return element
}

function rememberPosition(track: Track, time: number, exact: boolean) {
  if (!Number.isFinite(time) || time < 0) return
  if (lastSavedPosition?.trackId === track.id && lastSavedPosition.createdAt === track.createdAt) {
    const difference = Math.abs(lastSavedPosition.time - time)
    if (exact ? difference === 0 : difference < 1) return
  }
  lastSavedPosition = { trackId: track.id, createdAt: track.createdAt, time }
  writePlaybackPosition(lastSavedPosition)
}

function updateTime(exact = false) {
  const element = currentAudio()
  if (!element || pendingSeek !== undefined) return
  const value = element.currentTime
  playbackTime.value = Number.isFinite(value) ? Math.max(0, value) : 0
  if (persistProgress && current.value && element.readyState >= 1 && !element.error) {
    rememberPosition(current.value, value, exact)
  }
}

function savePositionOnExit() { updateTime(true) }

function savePositionWhenHidden() {
  if (document.visibilityState === 'hidden') savePositionOnExit()
}

function updateMetadata() {
  const element = currentAudio()
  if (!element) return
  const value = element.duration
  duration.value = Number.isFinite(value) && value > 0 ? value : 0
  if (pendingSeek !== undefined && element.readyState >= 1 && duration.value > 0) {
    // A track already played to its end starts from the beginning on the next visit.
    element.currentTime = pendingSeek.restartAtEnd && pendingSeek.time >= duration.value
      ? 0 : Math.min(pendingSeek.time, duration.value)
    pendingSeek = undefined
  }
  updateTime()
}

function seekTo(value: number) {
  const element = currentAudio()
  if (!element || !Number.isFinite(value) || duration.value <= 0) return
  persistProgress = true
  element.currentTime = Math.max(0, Math.min(duration.value, value))
  updateTime(true)
}

async function togglePlayback() {
  if (!current.value || !audio.value) return
  if (!audio.value.paused && !audio.value.ended) {
    ++playRequest
    audio.value.pause()
    playing.value = false
    buffering.value = false
    updateTime(true)
  } else await select(current.value)
}

function keyboardPlayback(event: KeyboardEvent) {
  if ((event.code !== 'Space' && event.key !== ' ') || event.defaultPrevented || event.isComposing
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !current.value) return
  const target = event.target instanceof Element ? event.target : document.activeElement
  const modal = document.querySelector('dialog[open]')
  if (modal && modal.id !== 'now-playing-view' || target?.closest('input:not([type="range"]),textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"])')) return
  const control = target?.closest('button,a,[role="button"],[role="menuitem"]')
  if (control && !control.matches('.track-button[aria-current="true"]')) return
  event.preventDefault()
  if (!event.repeat) void togglePlayback()
}

function setVolume(value: number) {
  if (!audio.value || !Number.isFinite(value)) return
  audio.value.volume = Math.max(0, Math.min(1, value))
  if (value > 0) audio.value.muted = false
  syncVolume()
}

function toggleMute() {
  const element = audio.value
  if (!element) return
  if (element.muted || element.volume === 0) {
    element.muted = false
    if (element.volume === 0) element.volume = audibleVolume
  } else element.muted = true
  syncVolume()
}
function syncVolume() {
  if (!audio.value) return
  volume.value = audio.value.volume
  muted.value = audio.value.muted
  if (volume.value > 0) audibleVolume = volume.value
}

function adjacent(direction: -1 | 1) {
  const target = step(direction)
  if (!target) return
  if (target.id === current.value?.id && audio.value) {
    audio.value.currentTime = 0
    playbackTime.value = 0
  }
  void select(target)
}

function ended() {
  playing.value = false
  buffering.value = false
  if (!persistProgress || !current.value) return
  if (playbackMode.value === 'repeat-one' && !hasQueuedTracks.value) {
    if (currentIndex.value < 0 && !manualActive.value) return
    if (audio.value) audio.value.currentTime = 0
    playbackTime.value = 0
    void select(current.value)
  } else adjacent(1)
}

function audioFailed() {
  if (!current.value) return
  buffering.value = false
  playing.value = false
  playerError.value = '音频加载失败，请检查后端与文件，然后重试。'
}

function requestDelete(track: Track) {
  if (deleting.value || pendingRename.value || favoriting.value.has(track.id)) return
  pendingDelete.value = track
  deleteError.value = ''
  notice.value = ''
}

function requestRename(track: Track) {
  if (renaming.value || pendingDelete.value || favoriting.value.has(track.id)) return
  pendingRename.value = track
  renameError.value = ''
  notice.value = ''
}

async function saveRename(title: string, artist: string, album: string, cover?: File, removeCover = false) {
  const track = pendingRename.value
  if (!track || renaming.value) return
  renaming.value = true
  renameError.value = ''
  try {
    const updated = await renameTrack(track.id, title, artist, album, cover, removeCover)
    ++listRequest // A refresh started before this save must not restore the old title.
    loading.value = false
    listError.value = ''
    tracks.value = tracks.value.map(item => item.id === updated.id ? updated : item)
    if (current.value?.id === updated.id) current.value = { ...current.value, title: updated.title, artist: updated.artist, album: updated.album, coverUrl: updated.coverUrl, durationSeconds: updated.durationSeconds, favorite: updated.favorite }
    pendingRename.value = undefined
    notice.value = `已更新「${updated.title}」的歌曲信息。`
  } catch (error) {
    renameError.value = error instanceof Error ? error.message : '歌曲信息保存失败，请重试。'
  } finally { renaming.value = false }
}

async function confirmDelete() {
  const track = pendingDelete.value
  if (!track || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  const snapshot = current.value?.id === track.id ? {
    track: current.value,
    seek: pendingSeek ?? { time: audio.value?.currentTime ?? 0 },
    wasPlaying: !!audio.value && !audio.value.paused,
  } : undefined
  const request = snapshot ? ++playRequest : playRequest
  if (snapshot) {
    pendingSeek = undefined
    current.value = undefined
    playing.value = false
    buffering.value = false
    playerError.value = ''
    audio.value?.pause()
    audio.value?.removeAttribute('src')
    audio.value?.load() // Release the stream before Windows removes this one file.
    playbackTime.value = 0
    duration.value = 0
  }
  try {
    await deleteTrack(track.id)
    forgetPlaybackPosition(track.id, track.createdAt)
    ++listRequest // Ignore a list response that started before this deletion completed.
    loading.value = false
    tracks.value = tracks.value.filter(item => item.id !== track.id)
    listError.value = ''
    pendingDelete.value = undefined
    notice.value = `已删除「${track.title}」。`
    void refreshCapacity()
    void refreshPlaylists()
  } catch (error) {
    deleteError.value = error instanceof Error ? error.message : '删除失败，请重试。'
    if (snapshot && request === playRequest && !current.value) {
      pendingSeek = snapshot.seek
      current.value = snapshot.track
      await nextTick()
      const element = audio.value
      if (element && request === playRequest) {
        if (element.readyState >= 1) updateMetadata()
        if (snapshot.wasPlaying) {
          try { await element.play() }
          catch { if (request === playRequest) playerError.value = '歌曲已保留，暂时无法恢复播放，请重试。' }
        }
      }
    }
  } finally { deleting.value = false }
}

onMounted(() => {
  refreshVisible()
  void refreshCapacity()
  window.addEventListener('focus', refreshCapacity)
  window.addEventListener('keydown', keyboardPlayback)
  window.addEventListener('pagehide', savePositionOnExit)
  document.addEventListener('visibilitychange', savePositionWhenHidden)
})
onBeforeUnmount(() => {
  savePositionOnExit()
  ++listRequest
  window.removeEventListener('focus', refreshCapacity)
  window.removeEventListener('keydown', keyboardPlayback)
  window.removeEventListener('pagehide', savePositionOnExit)
  document.removeEventListener('visibilitychange', savePositionWhenHidden)
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="/" :aria-label="`${appName} 首页`">
        <span class="brand-mark" aria-hidden="true">◒</span>
        <span lang="en"><span class="brand-name">{{ appName }}</span><small>LOCAL MUSIC</small></span>
      </a>
      <nav class="library-navigation" aria-label="音乐导航">
        <button class="nav-item" :class="{ active: view === 'library' }" :aria-current="view === 'library' ? 'page' : undefined" @click="changeView('library')"><span aria-hidden="true">▤</span> 我的曲库 <span class="nav-dot" v-if="view === 'library'"></span></button>
        <button class="nav-item" :class="{ active: view === 'favorites' }" :aria-current="view === 'favorites' ? 'page' : undefined" @click="changeView('favorites')"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20.7 4.9a5.3 5.3 0 0 0-7.5 0L12 6.1l-1.2-1.2a5.3 5.3 0 0 0-7.5 7.5L12 21l8.7-8.6a5.3 5.3 0 0 0 0-7.5Z" /></svg> 我喜欢的音乐 <span class="favorite-count" aria-hidden="true">{{ favoriteTracks.length }}</span></button>
      </nav>
      <section class="playlist-navigation" aria-labelledby="playlist-navigation-title">
        <div class="playlist-navigation-heading">
          <h2 id="playlist-navigation-title">歌单</h2>
          <button type="button" class="text-button playlist-create" :disabled="playlistBusy || playlistsLoading" @click="openPlaylistPrompt({ kind: 'create' })">＋ 新建歌单</button>
        </div>
        <p v-if="playlistsLoadError" class="playlist-load-error" role="status">{{ playlistsLoadError }} <button type="button" @click="refreshPlaylists">重试</button></p>
        <p v-else-if="playlistsLoading && !playlists.length" class="playlist-load-error">正在读取歌单…</p>
        <nav v-if="playlists.length" aria-label="歌单列表">
          <button v-for="playlist in playlists" :key="playlist.id" type="button" class="nav-item playlist-nav-item" :class="{ active: view === playlist.id }" :aria-current="view === playlist.id ? 'page' : undefined" :title="playlist.name" @click="changeView(playlist.id)">
            <span class="playlist-nav-name">{{ playlist.name }}</span><span class="favorite-count" aria-hidden="true">{{ playlist.entries.filter(entry => tracksById.has(entry.trackId)).length }}</span>
          </button>
        </nav>
      </section>
      <div class="sidebar-bottom"><span class="connection-dot"></span> 本机曲库<small>让每一次聆听，都有归处。</small></div>
    </aside>

    <main>
      <section class="library" aria-labelledby="library-title">
        <header class="library-heading">
          <div class="library-title-group">
            <h1 id="library-title">{{ viewTitle }}</h1>
            <div class="library-count"><strong>{{ viewTracks.length }}</strong><span>{{ view === 'favorites' ? '首收藏' : '首歌曲' }}</span></div>
          </div>
          <ThemeSelect />
        </header>
        <UploadPanel v-show="view === 'library'" :blocked="capacity?.uploadAllowed === false" @uploaded="refresh" @storage-change="refreshCapacity" />
        <form class="library-search" role="search" aria-label="曲库搜索" @submit.prevent>
          <label class="visually-hidden" for="track-search">搜索歌名或歌手</label>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
          <input id="track-search" ref="searchInput" v-model="searchQuery" type="search" :placeholder="view === 'favorites' ? '搜索收藏的歌名或歌手' : '搜索歌名或歌手'" autocomplete="off" aria-controls="track-results" aria-describedby="search-summary" @keydown.esc.prevent="clearSearch" />
          <button v-if="searchQuery" type="button" class="search-clear" aria-label="清空搜索" title="清空搜索" @click="clearSearch">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </form>
        <p id="search-summary" class="search-summary" :class="{ 'visually-hidden': !searching && !listError && (!loading || tracks.length > 0) }" role="status">{{ listError ? '曲库读取失败，请重试。' : loading && !tracks.length ? '正在读取曲库…' : searching ? `找到 ${visibleTracks.length} 首，共 ${viewTracks.length} 首` : view === 'favorites' ? `已收藏 ${favoriteTracks.length} 首歌曲` : `共 ${viewTracks.length} 首歌曲` }}</p>
        <div class="list-heading">
          <h2>{{ searching ? '搜索结果' : view === 'favorites' ? '已收藏' : selectedPlaylist ? '歌单曲目' : '最近上传' }}</h2>
          <div class="playlist-view-actions">
            <button v-if="selectedPlaylist" type="button" class="text-button" :disabled="playlistBusy" @click="openPlaylistPrompt({ kind: 'rename', playlist: selectedPlaylist })">修改歌单名称</button>
            <button v-if="selectedPlaylist" type="button" class="text-button playlist-delete" :disabled="playlistBusy" aria-haspopup="dialog" @click="openPlaylistPrompt({ kind: 'delete', playlist: selectedPlaylist })">删除歌单</button>
            <button class="text-button" @click="refreshVisible" :disabled="loading">{{ loading ? '加载中…' : '刷新曲库 ↻' }}</button>
          </div>
        </div>
        <div id="track-results">
        <p v-if="listError" class="state error" role="alert">{{ listError }} <button @click="refresh">重试</button></p>
        <p v-else-if="loading && !tracks.length" class="state" role="status">正在连接你的曲库…</p>
        <div v-else-if="view === 'favorites' && !favoriteTracks.length" class="empty-state favorites-empty"><span aria-hidden="true">♡</span><h3>还没有收藏的音乐</h3><p>在歌曲旁点亮爱心，就能在这里找到它。</p><button type="button" class="search-reset" @click="changeView('library')">去曲库选歌</button></div>
        <div v-else-if="selectedPlaylist && !viewTracks.length" class="empty-state favorites-empty"><span aria-hidden="true">♫</span><h3>这个歌单还是空的</h3><p>从曲库选一首歌，再用底部播放器的「加入歌单」。</p><button type="button" class="search-reset" @click="changeView('library')">去曲库选歌</button></div>
        <div v-else-if="!tracks.length" class="empty-state"><span aria-hidden="true">♫</span><h3>第一首，留给你喜欢的歌。</h3><p>上传第一首音频，然后从曲库开始播放。</p></div>
        <div v-else-if="!visibleTracks.length" class="empty-state search-empty"><span aria-hidden="true">⌕</span><h3>没有匹配的歌曲</h3><p>{{ view === 'favorites' ? '换个歌名或歌手试试，或者清空搜索查看全部收藏。' : selectedPlaylist ? '换个歌名或歌手试试，或者清空搜索查看整个歌单。' : '换个歌名或歌手试试，或者清空搜索查看全部曲库。' }}</p><button type="button" class="search-reset" @click="clearSearch">{{ view === 'favorites' ? '查看全部收藏' : '查看全部歌曲' }}</button></div>
        <TrackList v-else :tracks="visibleTracks" :label="searching ? '搜索结果' : view === 'library' ? '最近上传的歌曲' : viewTitle" :current-id="current?.id" :playing="playing" :deleting="deleting || renaming || playlistBusy" :favoriting="favoriting" :in-playlist="!!selectedPlaylist"
          @select="selectFromView" @delete="requestDelete" @rename="requestRename" @favorite="toggleFavorite" @remove-from-playlist="removeTrackFromPlaylist" @play-next="playNext" />
        </div>
        <p v-if="notice" class="library-notice success" role="status">{{ notice }}</p>
        <p v-if="favoriteError" class="favorite-error error" role="alert">{{ favoriteError }} <button type="button" @click="refresh">刷新曲库</button></p>
        <p v-if="playlistError && !playlistPrompt" class="favorite-error error" role="alert">{{ playlistError }}</p>
        <p class="library-note">{{ libraryNote }}</p>
        <StorageStatusPanel v-if="view === 'library'" :capacity="capacity" :loading="capacityLoading" :error="capacityError" @refresh="refreshCapacity" />
      </section>
    </main>

    <footer class="player-bar" aria-label="音乐播放器">
      <div class="now-playing">
        <button type="button" class="now-playing-art-button" :disabled="!current" :aria-label="current ? `展开正在播放：${current.title}` : '展开正在播放'" aria-haspopup="dialog" aria-controls="now-playing-view" :aria-expanded="nowPlayingOpen" @click="nowPlayingOpen = true">
          <TrackArtwork class="player-art" :class="{ active: playing }" :url="current?.coverUrl" />
        </button>
        <div class="now-playing-copy">
          <div class="now-playing-title">
            <button v-if="current" type="button" class="now-playing-title-button" :aria-label="`展开正在播放：${current.title}`" aria-haspopup="dialog" aria-controls="now-playing-view" :aria-expanded="nowPlayingOpen" @click="nowPlayingOpen = true"><strong :title="current.title">{{ current.title }}</strong></button>
            <strong v-else>还没有正在播放的音乐</strong>
            <div v-if="current" class="now-playing-actions" role="group" aria-label="当前歌曲操作">
              <FavoriteButton :title="current.title" :favorite="current.favorite" :busy="favoriting.has(current.id) || deleting || renaming || !!pendingDelete || !!pendingRename" @toggle="toggleFavorite(current)" />
              <button class="playlist-add-button" type="button" aria-label="将当前歌曲加入歌单" title="加入歌单" aria-haspopup="dialog"
                :disabled="playlistBusy || playlistsLoading || deleting || renaming || !!pendingDelete || !!pendingRename"
                @click="openPlaylistPrompt({ kind: 'add', track: current })">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 11h10M4 16h7m6-4v8m-4-4h8" /></svg>
              </button>
            </div>
          </div>
          <div v-if="current" class="player-details">
            <span class="player-artist" :title="current.artist || '未知歌手'">{{ current.artist || '未知歌手' }}</span>
            <span class="player-detail-separator" aria-hidden="true">·</span>
            <span class="player-album" :title="current.album || '未知专辑'">{{ current.album || '未知专辑' }}</span>
          </div>
          <span v-else class="player-artist">从曲库选择一首歌</span>
          <span v-if="current" class="player-state" :class="{ 'visually-hidden': !buffering }" role="status">{{ buffering ? '正在加载…' : playing ? '正在播放' : '已暂停' }}</span>
        </div>
      </div>
      <PlayerControls :track-id="current?.id" :playing="playing" :time="playbackTime" :duration="duration" :can-previous="canPrevious" :can-next="canNext" @toggle="togglePlayback" @previous="adjacent(-1)" @next="adjacent(1)" @seek="seekTo" />
      <div class="player-settings">
        <PlaybackModeButton v-model:mode="playbackMode" />
        <button class="queue-toggle" type="button" aria-label="播放队列" title="播放队列" aria-haspopup="dialog" :aria-expanded="queueOpen" aria-controls="playback-queue" @click="queueOpen = true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 5h16M4 10h16M4 15h9M4 20h9m5-5 4 3-4 3z" /></svg>
          <span v-if="hasQueuedTracks" class="queue-count">{{ queuedTracks.length }}</span>
        </button>
        <VolumeControls :volume="volume" :muted="muted" @volume="setVolume" @mute="toggleMute" />
      </div>
      <audio ref="audio" hidden preload="metadata" :src="current?.audioUrl" :loop="!!current && playbackMode === 'repeat-one' && !hasQueuedTracks && (currentIndex >= 0 || manualActive)" @playing="playing = true; buffering = false" @pause="playing = false; buffering = false; updateTime(true)" @timeupdate="updateTime()" @loadedmetadata="updateMetadata" @durationchange="updateMetadata" @emptied="playbackTime = 0; duration = 0" @volumechange="syncVolume" @waiting="buffering = true" @canplay="buffering = false" @ended="ended" @error="audioFailed">你的浏览器不支持音频播放。</audio>
      <p v-if="playerError" class="player-error" role="alert">{{ playerError }} <button v-if="current" @click="select(current)">重试播放</button></p>
    </footer>
    <NowPlayingView :open="nowPlayingOpen" :track="current" :playing="playing" :buffering="buffering" :time="playbackTime" :duration="duration"
      :can-previous="canPrevious" :can-next="canNext" :volume="volume" :muted="muted"
      :favorite-busy="!!current && (favoriting.has(current.id) || deleting || renaming || !!pendingDelete || !!pendingRename)"
      :player-error="playerError" :favorite-error="favoriteError" :return-label="view === 'favorites' ? '返回收藏' : selectedPlaylist ? '返回歌单' : '返回曲库'"
      @close="nowPlayingOpen = false" @toggle="togglePlayback" @previous="adjacent(-1)" @next="adjacent(1)" @seek="seekTo"
      @favorite="current && toggleFavorite(current)" @volume="setVolume" @mute="toggleMute" @retry="current && select(current)" />
    <PlaybackQueuePanel :open="queueOpen" :current="current" :queued="queuedTracks" :upcoming="sourceTracks" :source-title="queueTitle" :mode="playbackMode"
      @close="queueOpen = false" @move="moveTrack" @remove="removeQueued" />
    <DeleteTrackDialog :track="pendingDelete" :busy="deleting" :error="deleteError" :is-current="pendingDelete?.id === current?.id" @cancel="pendingDelete = undefined" @confirm="confirmDelete" />
    <RenameTrackDialog :track="pendingRename" :busy="renaming" :error="renameError" @cancel="pendingRename = undefined" @save="saveRename" />
    <PlaylistDialog :prompt="playlistPrompt" :playlists="playlists" :busy="playlistBusy" :error="playlistError" @cancel="playlistPrompt = undefined; playlistError = ''" @name="savePlaylistName" @add="addTrackToPlaylist" @delete="confirmPlaylistDeletion" />
  </div>
</template>

<style scoped>
.brand-name {
  font-size: clamp(15px, 1.65vw, 22px);
  letter-spacing: .025em;
  white-space: nowrap;
}
</style>
