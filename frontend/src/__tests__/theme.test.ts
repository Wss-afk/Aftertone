import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import ThemeSelect from '../components/ThemeSelect.vue'
import { THEME_KEY } from '../composables/useTheme'
import { listTracks, type Track } from '../api/tracks'
import { listPlaylists } from '../api/playlists'
import { getStorageStatus } from '../api/storage'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn(), setTrackFavorite: vi.fn() }))
vi.mock('../api/playlists', () => ({ listPlaylists: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))

const tracks: Track[] = [1, 2, 3].map(id => ({
  id, title: `曲目 ${id}`, artist: '歌手', album: '专辑', favorite: false, durationSeconds: 100,
  coverUrl: null, originalFilename: `${id}.mp3`, sizeBytes: 1000,
  createdAt: '2026-11-13T00:00:00Z', audioUrl: `/api/v1/tracks/${id}/audio`,
}))
let wrapper: VueWrapper | undefined
let meta: HTMLMetaElement

beforeEach(() => {
  vi.resetAllMocks()
  document.documentElement.removeAttribute('data-theme')
  meta = document.createElement('meta')
  meta.name = 'theme-color'
  document.head.append(meta)
  vi.mocked(listTracks).mockResolvedValue(tracks)
  vi.mocked(listPlaylists).mockResolvedValue([])
  vi.mocked(getStorageStatus).mockRejectedValue(new Error('test'))
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
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  meta.remove()
  document.documentElement.removeAttribute('data-theme')
  document.body.innerHTML = ''
})

describe('theme preferences', () => {
  it('defaults to rainy night and names both choices', () => {
    wrapper = mount(ThemeSelect)
    expect(document.documentElement.dataset.theme).toBe('rainy-night')
    expect(wrapper.findAll('option').map(option => option.text())).toEqual(['雨夜蓝灰', '森林绿'])
    expect(meta.content).toBe('#171b1d')
  })

  it('saves the selected theme and restores it when reopening the app', async () => {
    wrapper = mount(ThemeSelect)
    await wrapper.get('#app-theme').setValue('forest')
    expect(localStorage.getItem(THEME_KEY)).toBe('forest')
    expect(document.documentElement.dataset.theme).toBe('forest')
    expect(meta.content).toBe('#121514')
    wrapper.unmount()
    document.documentElement.removeAttribute('data-theme')
    wrapper = mount(ThemeSelect)
    expect(wrapper.get('#app-theme').element.value).toBe('forest')
    expect(document.documentElement.dataset.theme).toBe('forest')
  })

  it('uses the default when a saved theme is unsupported', () => {
    localStorage.setItem(THEME_KEY, 'unsupported')
    wrapper = mount(ThemeSelect)
    expect(wrapper.get('#app-theme').element.value).toBe('rainy-night')
    expect(document.documentElement.dataset.theme).toBe('rainy-night')
  })

  it('still switches themes when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    wrapper = mount(ThemeSelect)
    await wrapper.get('#app-theme').setValue('forest')
    expect(document.documentElement.dataset.theme).toBe('forest')
    await wrapper.get('#app-theme').setValue('rainy-night')
    expect(document.documentElement.dataset.theme).toBe('rainy-night')
  })
})

it('keeps audio, progress, search and the manually arranged queue through theme changes', async () => {
  wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  await wrapper.get('[aria-label="播放 曲目 1"]').trigger('click')
  await flushPromises()
  const audio = wrapper.get('audio').element as HTMLAudioElement
  audio.currentTime = 31
  await wrapper.get('audio').trigger('timeupdate')
  await wrapper.get('[aria-label="更多操作 曲目 3"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-action="play-next"]').trigger('click')
  await wrapper.get('#track-search').setValue('曲目 3')
  await wrapper.get('#app-theme').setValue('forest')
  expect(wrapper.get('audio').element).toBe(audio)
  expect(audio.currentTime).toBe(31)
  expect(audio.getAttribute('src')).toBe(tracks[0]!.audioUrl)
  expect(audio.paused).toBe(false)
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  expect(wrapper.get('#track-search').element.value).toBe('曲目 3')
  expect(wrapper.get('.queue-count').text()).toBe('1')
  await wrapper.get('[aria-label="下一首"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('.now-playing strong').text()).toBe('曲目 3')
  audio.pause()
  audio.currentTime = 8.5
  await wrapper.get('#app-theme').setValue('rainy-night')
  expect(audio.paused).toBe(true)
  expect(audio.currentTime).toBe(8.5)
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2)
})
