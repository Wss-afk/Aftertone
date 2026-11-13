import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, type EffectScope } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { listTracks, deleteTrack, type Track } from '../api/tracks'
import { listPlaylists } from '../api/playlists'
import { getStorageStatus } from '../api/storage'
import { usePlaybackQueue } from '../composables/usePlaybackQueue'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn(), setTrackFavorite: vi.fn() }))
vi.mock('../api/playlists', () => ({ listPlaylists: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))

const library: Track[] = [1, 2, 3, 4].map(id => ({
  id, title: `曲目 ${id}`, artist: '歌手', album: '', favorite: id < 4, durationSeconds: 100,
  coverUrl: null, originalFilename: `${id}.mp3`, sizeBytes: 1000,
  createdAt: '2026-11-13T00:00:00Z', audioUrl: `/api/v1/tracks/${id}/audio`,
}))
let scope: EffectScope | undefined
let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listTracks).mockResolvedValue(library)
  vi.mocked(listPlaylists).mockResolvedValue([{ id: 1, name: '夜听', entries: [1, 2, 3].map(trackId => ({ trackId, position: trackId })) }])
  vi.mocked(getStorageStatus).mockRejectedValue(new Error('test'))
  vi.mocked(deleteTrack).mockResolvedValue(undefined)
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !this._testPlaying } })
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get() { return 100 } })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() { return 1 } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = true
    this.dispatchEvent(new Event('playing'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = false
    this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () { this.currentTime = 0 })
})

afterEach(() => { wrapper?.unmount(); wrapper = undefined; scope?.stop(); vi.restoreAllMocks(); document.body.innerHTML = '' })

function queueFor(ids = [1, 2, 3]) {
  const tracks = ref(library.filter(track => ids.includes(track.id)))
  const all = ref([...library])
  const current = ref<Track>()
  const source = ref<Track>()
  scope = effectScope()
  const queue = scope.run(() => usePlaybackQueue(tracks, current, source, all))!
  function start(id: number) {
    const track = library.find(track => track.id === id)!
    queue.resetQueue()
    queue.recordSelection(track)
    current.value = track
  }
  function step(direction: -1 | 1 = 1) {
    const track = queue.step(direction)
    if (track) current.value = track
    return track?.id
  }
  return { ...queue, start, advance: step, tracks, all, current }
}

describe('queue scheduling', () => {
  it('plays a track from outside the source and then continues from the original source position', () => {
    const queue = queueFor()
    queue.start(1)
    queue.enqueueNext(library[3]!)
    expect(queue.advance()).toBe(4)
    expect(queue.advance()).toBe(2)
    expect(queue.advance()).toBe(3)
    expect(queue.advance()).toBeUndefined()
  })

  it('reorders the remaining source tracks without repeating consumed tracks or changing the library', () => {
    const queue = queueFor([1, 2, 3, 4])
    queue.start(1)
    queue.moveTrack(4, -1, false)
    queue.moveTrack(4, -1, false)
    expect(queue.sourceTracks.value.map(track => track.id)).toEqual([4, 2, 3])
    expect([queue.advance(), queue.advance(), queue.advance(), queue.advance()]).toEqual([4, 2, 3, undefined])
    expect(queue.tracks.value.map(track => track.id)).toEqual([1, 2, 3, 4])
  })

  it('deduplicates play-next requests, supports manual reordering, and removes a queued track', () => {
    const queue = queueFor([1, 2, 3, 4])
    queue.start(1)
    queue.enqueueNext(library[1]!)
    queue.enqueueNext(library[2]!)
    queue.enqueueNext(library[2]!)
    expect(queue.queuedTracks.value.map(track => track.id)).toEqual([3, 2])
    queue.moveTrack(2, -1, true)
    expect(queue.queuedTracks.value.map(track => track.id)).toEqual([2, 3])
    queue.removeQueued(2)
    expect([queue.advance(), queue.advance(), queue.advance()]).toEqual([3, 4, undefined])
  })

  it('skips tracks deleted from the library or removed from the source before playback', () => {
    const queue = queueFor()
    queue.start(1)
    queue.enqueueNext(library[3]!)
    queue.all.value = library.slice(0, 3)
    queue.tracks.value = [library[0]!, library[2]!]
    expect(queue.queuedTracks.value).toEqual([])
    expect(queue.advance()).toBe(3)
  })

  it('keeps the displayed shuffle order through skips, reordering and a new cycle', async () => {
    const queue = queueFor([1, 2, 3, 4])
    queue.start(1)
    queue.mode.value = 'shuffle'
    await nextTick()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    queue.prepareUpcoming()
    const planned = queue.sourceTracks.value.map(track => track.id)
    queue.moveTrack(planned[1]!, -1, false)
    const reordered = queue.sourceTracks.value.map(track => track.id)
    expect(reordered).not.toEqual(planned)
    expect([queue.advance(), queue.advance(), queue.advance()]).toEqual(reordered)
    queue.prepareUpcoming()
    expect(queue.sourceTracks.value.map(track => track.id)).not.toContain(reordered.at(-1))
    const expected = queue.sourceTracks.value[0]!.id
    expect(queue.advance()).toBe(expected)
  })

  it('shows a replayed manual track in the queue when returning to the previous song', () => {
    const queue = queueFor()
    queue.start(1)
    queue.enqueueNext(library[3]!)
    expect(queue.advance()).toBe(4)
    expect(queue.advance(-1)).toBe(1)
    expect(queue.queuedTracks.value.map(track => track.id)).toEqual([4])
    expect(queue.advance()).toBe(4)
    expect(queue.advance()).toBe(2)
  })

  it('keeps manual requests when changing mode and resets them when a new source selection starts', async () => {
    const queue = queueFor()
    queue.start(1)
    queue.enqueueNext(library[3]!)
    queue.mode.value = 'repeat-one'
    await nextTick()
    expect(queue.advance()).toBe(4)
    queue.enqueueNext(library[2]!)
    queue.start(2)
    expect(queue.queuedTracks.value).toEqual([])
    expect(queue.sourceTracks.value.map(track => track.id)).toEqual([3])
  })

  it('does not put a pending manual track into a newly prepared shuffle cycle', async () => {
    const queue = queueFor([1, 2, 3, 4])
    queue.start(4)
    queue.enqueueNext(library[1]!)
    queue.mode.value = 'shuffle'
    await nextTick()
    queue.prepareUpcoming()
    expect(queue.queuedTracks.value.map(track => track.id)).toEqual([2])
    expect(queue.sourceTracks.value.map(track => track.id)).not.toContain(2)
    expect(queue.advance()).toBe(2)
  })

  it('preserves forward shuffle history in the displayed order', async () => {
    const queue = queueFor([1, 2, 3, 4])
    queue.start(1)
    queue.mode.value = 'shuffle'
    await nextTick()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(queue.advance()).toBe(2)
    expect(queue.advance()).toBe(1)
    expect(queue.advance(-1)).toBe(2)
    expect(queue.advance(-1)).toBe(1)
    queue.prepareUpcoming()
    expect(queue.sourceTracks.value[0]?.id).toBe(2)
    expect(queue.advance()).toBe(2)
  })

  it('shows the forward history track after using Previous with the shuffle panel open', async () => {
    const queue = queueFor([1, 2, 3, 4])
    queue.start(1)
    queue.mode.value = 'shuffle'
    await nextTick()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    queue.prepareUpcoming()
    const firstNext = queue.advance()!
    const secondNext = queue.advance()!
    expect(queue.advance(-1)).toBe(firstNext)
    expect(queue.sourceTracks.value[0]?.id).toBe(secondNext)
    expect(queue.advance()).toBe(secondNext)
  })

  it('returns to the previous heard song after reordering and shows the return path', () => {
    const queue = queueFor([1, 2, 3, 4])
    queue.start(1)
    queue.moveTrack(4, -1, false)
    queue.moveTrack(4, -1, false)
    expect(queue.advance()).toBe(4)
    expect(queue.advance()).toBe(2)
    expect(queue.advance(-1)).toBe(4)
    expect(queue.sourceTracks.value.map(track => track.id)).toEqual([2, 3])
    expect(queue.advance()).toBe(2)
  })
})

async function open() { wrapper = mount(App, { attachTo: document.body }); await flushPromises(); return wrapper.get('audio').element as HTMLAudioElement }
async function click(label: string) { await wrapper!.get(`button[aria-label="${label}"]`).trigger('click'); await flushPromises() }
async function enqueue(title: string) { await click(`更多操作 ${title}`); await wrapper!.get('[data-action="play-next"]').trigger('click'); await flushPromises() }
async function end() { await wrapper!.get('audio').trigger('ended'); await flushPromises() }

describe('queue panel and player', () => {
  it('opens without touching playback, moves the upcoming source order and closes with Escape', async () => {
    const audio = await open()
    await click('播放 曲目 1')
    audio.currentTime = 31
    await click('播放队列')
    expect(wrapper!.get('#playback-queue').attributes('open')).toBeDefined()
    expect(wrapper!.findAll('.queue-source .queue-track-copy strong').map(item => item.text())).toEqual(['曲目 2', '曲目 3', '曲目 4'])
    await click('上移 曲目 3')
    expect(audio.currentTime).toBe(31)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
    await wrapper!.get('#playback-queue').trigger('cancel')
    expect(wrapper!.get('#playback-queue').attributes('open')).toBeUndefined()
    await end()
    expect(wrapper!.get('.now-playing strong').text()).toBe('曲目 3')
  })

  it('keeps the playlist source through browsing, search, and inserting a song from the library', async () => {
    const audio = await open()
    await wrapper!.get('.playlist-nav-item').trigger('click')
    await click('播放 曲目 1')
    await wrapper!.get('.library-navigation button').trigger('click')
    await wrapper!.get('#track-search').setValue('曲目 4')
    audio.currentTime = 31
    await enqueue('曲目 4')
    expect(audio.currentTime).toBe(31)
    await end()
    expect(wrapper!.get('.now-playing strong').text()).toBe('曲目 4')
    await end()
    expect(wrapper!.get('.now-playing strong').text()).toBe('曲目 2')
    expect(wrapper!.get('#track-search').element.value).toBe('曲目 4')
  })

  it('prioritizes manual requests over repeat-one and then repeats the inserted song', async () => {
    const audio = await open()
    await click('播放 曲目 1')
    await wrapper!.get('#playback-mode').trigger('click')
    expect(audio.loop).toBe(true)
    await enqueue('曲目 4')
    expect(audio.loop).toBe(false)
    await end()
    expect(wrapper!.get('.now-playing strong').text()).toBe('曲目 4')
    expect(audio.loop).toBe(true)
    await end()
    expect(wrapper!.get('.now-playing strong').text()).toBe('曲目 4')
    await click('下一首')
    expect(wrapper!.get('.now-playing strong').text()).toBe('曲目 2')
  })

  it('starts a requested track if no song is selected and restarts an explicitly requeued current song', async () => {
    const audio = await open()
    await enqueue('曲目 1')
    expect(wrapper!.get('.now-playing strong').text()).toBe('曲目 1')
    audio.currentTime = 31
    await enqueue('曲目 1')
    await click('下一首')
    expect(audio.currentTime).toBe(0)
    expect(audio.getAttribute('src')).toBe(library[0]!.audioUrl)
  })

  it('clears repeat-one when the currently inserted song is deleted', async () => {
    const audio = await open()
    await click('播放 曲目 1')
    await wrapper!.get('#playback-mode').trigger('click')
    await enqueue('曲目 4')
    await end()
    expect(audio.loop).toBe(true)
    await click('更多操作 曲目 4')
    await wrapper!.get('[data-action="delete"]').trigger('click')
    await wrapper!.get('.dialog-confirm').trigger('click')
    await flushPromises()
    expect(audio.loop).toBe(false)
    expect(audio.getAttribute('src')).toBeNull()
  })
})
