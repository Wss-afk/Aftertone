import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { listTracks, setTrackFavorite, deleteTrack, type Track } from '../api/tracks'
import { getStorageStatus } from '../api/storage'
import { PLAYBACK_MODE_KEY } from '../composables/usePlaybackQueue'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), setTrackFavorite: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))
const first: Track = { id: 1, title: 'Cloud', artist: 'Galdive', album: '专辑', durationSeconds: 100, coverUrl: null,
  favorite: true, originalFilename: 'one.mp3', sizeBytes: 1024, createdAt: '2026-11-06T00:00:00Z', audioUrl: '/api/v1/tracks/1/audio' }
const second: Track = { ...first, id: 2, title: '未收藏', artist: '另一位歌手', favorite: false, audioUrl: '/api/v1/tracks/2/audio' }
const third: Track = { ...first, id: 3, title: '夜航', artist: '林间风', audioUrl: '/api/v1/tracks/3/audio' }
let library: Track[]
let wrapper: VueWrapper
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>
let load: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks(); localStorage.removeItem(PLAYBACK_MODE_KEY)
  library = [first, second, third].map(track => ({ ...track }))
  vi.mocked(listTracks).mockImplementation(async () => library.map(track => ({ ...track })))
  vi.mocked(setTrackFavorite).mockImplementation(async (id, favorite) => {
    library = library.map(track => track.id === id ? { ...track, favorite } : track)
    return { id, favorite }
  })
  vi.mocked(deleteTrack).mockImplementation(async id => { library = library.filter(track => track.id !== id) })
  vi.mocked(getStorageStatus).mockRejectedValue(new Error('测试环境'))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !this._testPlaying } })
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = true; this.dispatchEvent(new Event('playing')); return Promise.resolve()
  })
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = false; this.dispatchEvent(new Event('pause'))
  })
  load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); localStorage.removeItem(PLAYBACK_MODE_KEY); document.body.innerHTML = '' })
async function open() { wrapper = mount(App, { attachTo: document.body }); await flushPromises(); return wrapper.get('audio').element as HTMLAudioElement }
async function click(label: string) { await wrapper.get(`button[aria-label="${label}"]`).trigger('click'); await flushPromises() }
async function favorites() { await wrapper.get('.library-navigation button:nth-child(2)').trigger('click'); await flushPromises() }
async function all() { await wrapper.get('.library-navigation button:nth-child(1)').trigger('click'); await flushPromises() }
async function heart(title: string, favorite = false) { await wrapper.get(`.track-list button[aria-label="${favorite ? '取消收藏' : '收藏'} ${title}"]`).trigger('click'); await flushPromises() }
async function end() { await wrapper.get('audio').trigger('ended'); await flushPromises() }
async function mode(value: string) {
  for (let i = 0; i < 3 && wrapper.get('#playback-mode').attributes('data-mode') !== value; i++)
    await wrapper.get('#playback-mode').trigger('click')
  await flushPromises()
}
const titles = () => wrapper.findAll('.track-name strong').map(el => el.text())

it('loads persisted hearts and favorites with a count and selected navigation', async () => {
  await open(); expect(wrapper.get('.track-list .favorite-button').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('.favorite-count').text()).toBe('2')
  await favorites()
  expect(titles()).toEqual(['Cloud', '夜航'])
  expect(wrapper.get('#library-title').text()).toBe('我喜欢的音乐.')
  expect(wrapper.get('.library-navigation button:nth-child(2)').attributes('aria-current')).toBe('page')
  expect(wrapper.get('.upload-panel').isVisible()).toBe(false)
  expect(wrapper.get('#search-summary').text()).toBe('已收藏 2 首歌曲')
})

it('adds a favorite from its row without starting playback', async () => {
  await open(); await heart('未收藏')
  expect(setTrackFavorite).toHaveBeenCalledExactlyOnceWith(2, true)
  expect(play).not.toHaveBeenCalled()
  expect(wrapper.get('.favorite-count').text()).toBe('3')
  await favorites(); expect(titles()).toEqual(['Cloud', '未收藏', '夜航'])
})

it('keeps row and player hearts synchronized without changing the source or progress', async () => {
  const audio = await open(); await click('播放 Cloud'); audio.currentTime = 37
  await wrapper.get('.now-playing .favorite-button').trigger('click'); await flushPromises()
  expect(wrapper.get('.now-playing .favorite-button').attributes('aria-pressed')).toBe('false')
  expect(wrapper.get('.track-list button[aria-label="收藏 Cloud"]').exists()).toBe(true)
  await heart('Cloud')
  expect(wrapper.get('.now-playing .favorite-button').attributes('aria-pressed')).toBe('true')
  expect(audio.currentTime).toBe(37); expect(audio.getAttribute('src')).toBe(first.audioUrl)
  expect(wrapper.get('audio').element).toBe(audio)
  expect(play).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled()
})

it('unfavoriting removes only the favorite and leaves the song in the main library', async () => {
  await open(); await favorites(); await heart('Cloud', true)
  expect(titles()).toEqual(['夜航'])
  await all(); expect(titles()).toEqual(['Cloud', '未收藏', '夜航'])
  expect(deleteTrack).not.toHaveBeenCalled()
})

it('shows an actionable empty favorites state independently of an empty main library', async () => {
  library = library.map(track => ({ ...track, favorite: false }))
  await open(); await favorites()
  expect(wrapper.get('.favorites-empty').text()).toContain('还没有收藏的音乐')
  await wrapper.get('.favorites-empty button').trigger('click')
  expect(titles()).toHaveLength(3)
})

it('searches only favorites and clears search when switching views', async () => {
  await open(); await favorites(); await wrapper.get('#track-search').setValue('另一位')
  expect(wrapper.get('.search-empty').text()).toContain('查看全部收藏')
  expect(wrapper.get('#search-summary').text()).toBe('找到 0 首，共 2 首')
  await wrapper.get('.search-reset').trigger('click'); expect(titles()).toEqual(['Cloud', '夜航'])
  await wrapper.get('#track-search').setValue('林间'); expect(titles()).toEqual(['夜航'])
  await all(); expect((wrapper.get('#track-search').element as HTMLInputElement).value).toBe('')
  expect(titles()).toHaveLength(3)
})

it('plays next favorites while search hides them', async () => {
  await open(); await favorites(); await click('播放 Cloud'); await wrapper.get('#track-search').setValue('cloud')
  expect(titles()).toEqual(['Cloud'])
  await click('下一首'); expect(wrapper.get('.now-playing strong').text()).toBe('夜航')
  await click('上一首'); expect(wrapper.get('.now-playing strong').text()).toBe('Cloud')
  await end(); expect(wrapper.get('.now-playing strong').text()).toBe('夜航')
  await end(); expect(play).toHaveBeenCalledTimes(4)
})

it('browsing favorites does not replace an existing main-library queue or audio', async () => {
  const audio = await open(); await click('播放 Cloud'); audio.currentTime = 37
  await favorites(); expect(audio.currentTime).toBe(37); expect(play).toHaveBeenCalledTimes(1)
  await click('下一首'); expect(wrapper.get('.now-playing strong').text()).toBe('未收藏')
})

it('browsing the library keeps a favorites queue until another row is selected', async () => {
  await open(); await favorites(); await click('播放 Cloud'); await all(); await click('下一首')
  expect(wrapper.get('.now-playing strong').text()).toBe('夜航')
  await click('播放 Cloud'); await click('下一首')
  expect(wrapper.get('.now-playing strong').text()).toBe('未收藏')
})

it('unfavoriting the current favorite retains an anchor and advances to the next favorite', async () => {
  const audio = await open(); await favorites(); await click('播放 Cloud'); audio.currentTime = 37
  await heart('Cloud', true)
  expect(titles()).toEqual(['夜航']); expect(audio.currentTime).toBe(37)
  expect(wrapper.get('.now-playing strong').text()).toBe('Cloud')
  expect(wrapper.get('.now-playing .favorite-button').attributes('aria-pressed')).toBe('false')
  expect(play).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled()
  await end(); expect(wrapper.get('.now-playing strong').text()).toBe('夜航')
})

it('continues the last unfavorited track without selecting nonfavorites afterward', async () => {
  library[2]!.favorite = false
  await open(); await favorites(); await click('播放 Cloud'); await heart('Cloud', true)
  expect(wrapper.find('.favorites-empty').exists()).toBe(true)
  expect(wrapper.get('.now-playing strong').text()).toBe('Cloud')
  expect(wrapper.get('button[aria-label="下一首"]').attributes('disabled')).toBeDefined()
  await end(); expect(play).toHaveBeenCalledTimes(1)
})

it('shuffle stays inside favorites and skips removed favorites in its history', async () => {
  await open(); await favorites(); await click('播放 Cloud'); await mode('shuffle'); await click('下一首')
  expect(wrapper.get('.now-playing strong').text()).toBe('夜航')
  await heart('Cloud', true)
  expect(wrapper.get('button[aria-label="上一首"]').attributes('disabled')).toBeDefined()
  await click('下一首') // no remaining candidate: disabled button does nothing
  expect(wrapper.get('.now-playing strong').text()).toBe('夜航')
})

it('repeat-one keeps the same favorite source', async () => {
  await open(); await favorites(); await click('播放 Cloud'); await mode('repeat-one'); await end()
  expect(wrapper.get('audio').attributes('src')).toBe(first.audioUrl)
  expect(play).toHaveBeenCalledTimes(2)
})

it('resets shuffle history when a new playback source is selected', async () => {
  await open(); await click('播放 未收藏'); await click('播放 Cloud'); await mode('shuffle')
  expect(wrapper.get('button[aria-label="上一首"]').attributes('disabled')).toBeUndefined()
  await favorites(); await click('播放 夜航')
  expect(wrapper.get('button[aria-label="上一首"]').attributes('disabled')).toBeDefined()
})

it('disables both heart locations during a request and prevents duplicate submissions', async () => {
  let resolve!: (track: Pick<Track, 'id' | 'favorite'>) => void
  vi.mocked(setTrackFavorite).mockReturnValue(new Promise(done => { resolve = done }))
  await open(); await click('播放 Cloud')
  await wrapper.get('.track-list button[aria-label="取消收藏 Cloud"]').trigger('click')
  await wrapper.get('.now-playing .favorite-button').trigger('click')
  expect(setTrackFavorite).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.now-playing .favorite-button').attributes('disabled')).toBeDefined()
  expect(wrapper.get('button[aria-label="更多操作 Cloud"]').attributes('disabled')).toBeDefined()
  resolve({ id: 1, favorite: false }); await flushPromises()
  expect(wrapper.get('.now-playing .favorite-button').attributes('disabled')).toBeUndefined()
})

it('keeps the saved heart and favorite row on failure, then allows retry', async () => {
  vi.mocked(setTrackFavorite).mockRejectedValueOnce(new Error('收藏状态保存失败，请重试。'))
  await open(); await favorites(); await heart('Cloud', true)
  expect(titles()).toEqual(['Cloud', '夜航'])
  expect(wrapper.get('.favorite-error').text()).toContain('保存失败')
  await heart('Cloud', true); expect(titles()).toEqual(['夜航'])
  expect(wrapper.find('.favorite-error').exists()).toBe(false)
})

it('ignores an older refresh response after favorite save', async () => {
  await open()
  let resolve!: (tracks: Track[]) => void
  vi.mocked(listTracks).mockReturnValueOnce(new Promise(done => { resolve = done }))
  await wrapper.get('.list-heading button').trigger('click')
  await heart('未收藏')
  resolve([first, second, third]); await flushPromises()
  expect(wrapper.get('.track-list button[aria-label="取消收藏 未收藏"]').exists()).toBe(true)
})

it('preserves a pending heart across refresh then applies the confirmed save', async () => {
  let resolve!: (track: Pick<Track, 'id' | 'favorite'>) => void
  vi.mocked(setTrackFavorite).mockReturnValue(new Promise(done => { resolve = done }))
  await open(); await wrapper.get('.track-list button[aria-label="取消收藏 Cloud"]').trigger('click')
  await wrapper.get('.list-heading button').trigger('click'); await flushPromises()
  expect(wrapper.get('.track-list button[aria-label="取消收藏 Cloud"]').attributes('aria-pressed')).toBe('true')
  resolve({ id: 1, favorite: false }); await flushPromises()
  expect(wrapper.get('.track-list button[aria-label="收藏 Cloud"]').exists()).toBe(true)
})

it('loads favorites again after refresh and synchronizes the current heart', async () => {
  await open(); await click('播放 Cloud'); library[0]!.favorite = false
  await wrapper.get('.list-heading button').trigger('click'); await flushPromises()
  expect(wrapper.get('.now-playing .favorite-button').attributes('aria-pressed')).toBe('false')
  await favorites(); expect(titles()).toEqual(['夜航'])
})

it('deleting one favorite updates the count and both views', async () => {
  await open(); await favorites(); await click('更多操作 Cloud')
  await wrapper.get('[data-action="delete"]').trigger('click'); await flushPromises()
  await wrapper.get('.dialog-confirm').trigger('click'); await flushPromises()
  expect(deleteTrack).toHaveBeenCalledExactlyOnceWith(1)
  expect(wrapper.get('.favorite-count').text()).toBe('1')
  expect(titles()).toEqual(['夜航'])
  await all(); expect(titles()).toEqual(['未收藏', '夜航'])
})

it('distinguishes load failure from an empty favorites collection', async () => {
  vi.mocked(listTracks).mockRejectedValueOnce(new Error('曲库读取失败'))
  await open(); await favorites()
  expect(wrapper.find('.favorites-empty').exists()).toBe(false)
  expect(wrapper.get('.state.error').text()).toContain('曲库读取失败')
})
