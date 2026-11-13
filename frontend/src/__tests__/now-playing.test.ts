import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { listTracks, setTrackFavorite, type Track } from '../api/tracks'
import { listPlaylists } from '../api/playlists'
import { getStorageStatus } from '../api/storage'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), setTrackFavorite: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn() }))
vi.mock('../api/playlists', () => ({ listPlaylists: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))

const tracks: Track[] = [1, 2, 3].map(id => ({ id, title: `曲目 ${id}`, artist: '歌手', album: '专辑',
  favorite: id !== 2, durationSeconds: 100, coverUrl: null, originalFilename: `${id}.mp3`,
  sizeBytes: 1000, createdAt: '2026-11-13T00:00:00Z', audioUrl: `/api/v1/tracks/${id}/audio` }))
let wrapper: VueWrapper
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>
let load: ReturnType<typeof vi.spyOn>
const full = () => wrapper.get('#now-playing-view')

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listTracks).mockResolvedValue(tracks.map(track => ({ ...track })))
  vi.mocked(listPlaylists).mockResolvedValue([])
  vi.mocked(getStorageStatus).mockRejectedValue(new Error('test'))
  vi.mocked(setTrackFavorite).mockImplementation(async (id, favorite) => ({ id, favorite }))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() {
    this.setAttribute('open', ''); this.querySelector('[autofocus]')?.focus()
  } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {
    this.removeAttribute('open'); this.dispatchEvent(new Event('close'))
  } })
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !this._testPlaying } })
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get() { return 100 } })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() { return 1 } })
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = true; this.dispatchEvent(new Event('playing')); return Promise.resolve()
  })
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = false; this.dispatchEvent(new Event('pause'))
  })
  load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.documentElement.style.overflow = ''
})

async function start() {
  wrapper = mount(App, { attachTo: document.body, global: { stubs: { transition: false } } })
  await flushPromises()
  return wrapper.get('audio').element as HTMLAudioElement
}
async function click(selector: string) { await wrapper.get(selector).trigger('click'); await flushPromises() }
async function select(id = 1) {
  await click(`[aria-label="播放 曲目 ${id}"]`)
  await wrapper.get('audio').trigger('loadedmetadata')
}
async function open(selector = '.now-playing-art-button') {
  wrapper.get(selector).element.focus()
  await click(selector)
  expect((full().element as HTMLDialogElement).open).toBe(true)
}
async function closed() {
  await vi.waitFor(() => expect((full().element as HTMLDialogElement).open).toBe(false))
}

describe('full-window now playing', () => {
  it('has no enabled entry or duplicate controls before selecting a song', async () => {
    await start()
    expect(wrapper.get('.now-playing-art-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.now-playing-title-button').exists()).toBe(false)
    expect(full().find('.player-controls').exists()).toBe(false)
    expect(wrapper.findAll('audio')).toHaveLength(1)
  })

  it('keeps the same playing audio, progress, search and manual queue across opening and closing', async () => {
    const audio = await start(); await select()
    audio.currentTime = 37; await wrapper.get('audio').trigger('timeupdate')
    await click('[aria-label="更多操作 曲目 3"]')
    await click('[data-action="play-next"]')
    await wrapper.get('#track-search').setValue('曲目 2')
    document.documentElement.style.overflow = 'auto'
    await open()
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(wrapper.get('audio').element).toBe(audio)
    expect(audio.currentTime).toBe(37)
    audio.currentTime = 44; await wrapper.get('audio').trigger('timeupdate')
    expect(full().get('.time-elapsed').text()).toBe('0:44')
    await click('.now-playing-back'); await closed()
    expect(audio.paused).toBe(false)
    expect(audio.currentTime).toBe(44)
    expect(play).toHaveBeenCalledTimes(1)
    expect(pause).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    expect(wrapper.get('#track-search').element.value).toBe('曲目 2')
    expect(wrapper.get('.queue-count').text()).toBe('1')
    expect(document.documentElement.style.overflow).toBe('auto')
    expect(document.activeElement).toBe(wrapper.get('.now-playing-art-button').element)
    await click('footer [aria-label="下一首"]')
    expect(wrapper.get('.now-playing strong').text()).toBe('曲目 3')
  })

  it('opens from the title while paused and handles native Escape cancellation without playing', async () => {
    const audio = await start(); await select()
    audio.pause(); audio.currentTime = 25
    await open('.now-playing-title-button')
    expect(full().get('.play-toggle').attributes('aria-label')).toBe('播放')
    await full().trigger('cancel'); await closed()
    expect(audio.paused).toBe(true)
    expect(audio.currentTime).toBe(25)
    expect(play).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(wrapper.get('.now-playing-title-button').element)
  })

  it('shares seeking, skipping, favorite, volume and mute with the bottom player', async () => {
    const audio = await start(); await select(); await open()
    await full().get('.seek-slider').setValue('62.5')
    expect(audio.currentTime).toBe(62.5)
    expect(wrapper.get('footer .time-elapsed').text()).toBe('1:02')
    await full().get('.volume-slider').setValue('.35')
    expect(audio.volume).toBe(.35)
    expect(wrapper.get('footer .volume-slider').element.value).toBe('0.35')
    await click('#now-playing-view .mute-toggle')
    expect(audio.muted).toBe(true)
    expect(wrapper.get('footer .mute-toggle').attributes('aria-label')).toBe('取消静音')
    await click('#now-playing-view .favorite-button')
    expect(setTrackFavorite).toHaveBeenCalledExactlyOnceWith(1, false)
    expect(wrapper.get('.now-playing .favorite-button').attributes('aria-pressed')).toBe('false')
    await click('#now-playing-view [aria-label="下一首"]')
    expect(full().get('.now-playing-track-title').text()).toBe('曲目 2')
    expect(wrapper.get('.now-playing strong').text()).toBe('曲目 2')
    expect(wrapper.get('audio').element).toBe(audio)
    expect(audio.getAttribute('src')).toBe(tracks[1]!.audioUrl)
    await click('#now-playing-view [aria-label="上一首"]')
    expect(full().get('.now-playing-track-title').text()).toBe('曲目 1')
  })

  it('returns to the same filtered favorites and continues the favorites source after removing the current heart', async () => {
    const audio = await start()
    await click('.library-navigation button:nth-child(2)'); await select()
    await wrapper.get('#track-search').setValue('曲目 1')
    await open()
    expect(full().get('.now-playing-back').text()).toBe('返回收藏')
    await click('#now-playing-view .favorite-button')
    await click('#now-playing-view [aria-label="下一首"]')
    expect(full().get('.now-playing-track-title').text()).toBe('曲目 3')
    await click('.now-playing-back'); await closed()
    expect(wrapper.get('#library-title').text()).toBe('我喜欢的音乐')
    expect(wrapper.get('#track-search').element.value).toBe('曲目 1')
    expect(wrapper.find('.search-empty').exists()).toBe(true)
    expect(audio.paused).toBe(false)
  })

  it('keeps favorite failures visible in the view and permits retry', async () => {
    const audio = await start(); await select(); await open()
    vi.mocked(setTrackFavorite).mockRejectedValueOnce(new Error('收藏保存失败'))
    await click('#now-playing-view .favorite-button')
    expect(full().get('[role="alert"]').text()).toBe('收藏保存失败')
    expect(full().get('.favorite-button').attributes('aria-pressed')).toBe('true')
    await click('#now-playing-view .favorite-button')
    expect(full().find('[role="alert"]').exists()).toBe(false)
    expect(audio.paused).toBe(false)
  })

  it('reports audio failure in the view and retries through the shared audio element', async () => {
    const audio = await start(); await select(); await open()
    await wrapper.get('audio').trigger('error')
    expect(full().get('[role="alert"]').text()).toContain('音频加载失败')
    await click('#now-playing-view .now-playing-error button')
    expect(full().find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('audio').element).toBe(audio)
    expect(play).toHaveBeenCalledTimes(2)
  })
})
