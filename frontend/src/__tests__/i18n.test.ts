import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { listTracks, setTrackFavorite, uploadTrack, type Track } from '../api/tracks'
import { listPlaylists } from '../api/playlists'
import { getStorageStatus } from '../api/storage'
import { createI18n, LOCALE_KEY, message } from '../i18n'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), setTrackFavorite: vi.fn(), uploadTrack: vi.fn(), deleteTrack: vi.fn(), renameTrack: vi.fn() }))
vi.mock('../api/playlists', () => ({ listPlaylists: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))

const tracks: Track[] = [1, 2, 3].map(id => ({ id, title: `山河 ${id} {name}`, artist: '歌手原文', album: '专辑原文',
  favorite: id !== 2, durationSeconds: 100, coverUrl: null, originalFilename: `${id}.mp3`, sizeBytes: 1000,
  createdAt: '2026-11-23T00:00:00Z', audioUrl: `/api/v1/tracks/${id}/audio` }))
let wrapper: VueWrapper | undefined

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listTracks).mockResolvedValue(tracks.map(track => ({ ...track })))
  vi.mocked(listPlaylists).mockResolvedValue([{ id: 1, name: '我的曲库', entries: [{ trackId: 1, position: 1 }] }])
  vi.mocked(getStorageStatus).mockResolvedValue({ libraryBytes: 1024, diskTotalBytes: 100_000_000_000, diskUsableBytes: 20_000_000_000,
    reserveBytes: 5_368_709_120, requiredUploadFreeBytes: 5_508_169_728, uploadAllowed: true, volumeRoot: 'C:\\' })
  vi.mocked(setTrackFavorite).mockImplementation(async (id, favorite) => ({ id, favorite }))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !this._testPlaying } })
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get() { return 100 } })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() { return 1 } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = true; this.dispatchEvent(new Event('playing')); return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = false; this.dispatchEvent(new Event('pause'))
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount(); wrapper = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.documentElement.lang = 'zh-CN'
  document.documentElement.style.overflow = ''
})

async function start() { wrapper = mount(App, { attachTo: document.body }); await flushPromises(); return wrapper.get('audio').element as HTMLAudioElement }
async function language(value: string) { await wrapper!.get('#app-language').setValue(value); await flushPromises() }
async function click(selector: string) { await wrapper!.get(selector).trigger('click'); await flushPromises() }
async function select() { await click('.track-list .track-button'); await wrapper!.get('audio').trigger('loadedmetadata') }

describe('language preferences and messages', () => {
  it('defaults to Chinese and safely rejects invalid preferences', () => {
    expect(createI18n().locale.value).toBe('zh-CN')
    localStorage.setItem(LOCALE_KEY, 'unsupported')
    const i18n = createI18n()
    i18n.setLocale('fr')
    expect(i18n.locale.value).toBe('zh-CN')
    expect(i18n.t('我的曲库')).toBe('我的曲库')
  })

  it('saves and restores English and falls back when storage is blocked', () => {
    const i18n = createI18n()
    i18n.setLocale('en')
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en')
    expect(createI18n().locale.value).toBe('en')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const blocked = createI18n()
    expect(blocked.locale.value).toBe('zh-CN')
    blocked.setLocale('en')
    expect(blocked.t('主题')).toBe('Theme')
  })

  it('keeps interpolated user content verbatim and handles English singular counts', () => {
    const i18n = createI18n(); i18n.setLocale('en')
    expect(i18n.text(message('已收藏「{title}」。', { title: '我的曲库 {name} <title>' }))).toBe('Added “我的曲库 {name} <title>” to favorites.')
    expect(i18n.t('共 {count} 首歌曲', { count: 1 })).toBe('1 track')
    expect(i18n.t('共 {count} 首歌曲', { count: 2 })).toBe('2 tracks')
  })

  it('retranslates stored errors and uses backend codes or status when detail text is unknown', () => {
    const i18n = createI18n()
    const error = Object.assign(new Error('这个名称已经存在'), { code: 'PLAYLIST_NAME_EXISTS', status: 409 })
    expect(i18n.text(error)).toBe('这个名称已经存在')
    i18n.setLocale('en')
    expect(i18n.text(error)).toContain('playlist with this name already exists')
    expect(i18n.text(Object.assign(new Error('其他服务错误'), { status: 503 }))).toBe('Request failed (503). Please try again.')
    expect(i18n.text(new Error('无法连接曲库，请确认后端已启动。'))).toContain('Make sure the server is running')
    i18n.setLocale('zh-CN')
    expect(i18n.text(error)).toBe('这个名称已经存在')
  })
})

it('updates all main labels, metadata and native preferences without translating user data', async () => {
  await start(); await language('en')
  expect(document.documentElement.lang).toBe('en')
  expect(document.title).toBe('Aftertone · My Library')
  expect(wrapper!.get('#library-title').text()).toBe('My Library')
  expect(wrapper!.get('.upload-panel').attributes('aria-label')).toBe('Import audio')
  expect(wrapper!.get('.track-name strong').text()).toBe(tracks[0]!.title)
  expect(wrapper!.get('.track-name small').text()).toBe('歌手原文')
  expect(wrapper!.get('.track-album').text()).toBe('专辑原文')
  expect(wrapper!.get('#app-theme').findAll('option').map(option => option.text())).toEqual(['Rainy Night', 'Forest Green'])
  expect(wrapper!.get('.track-button').attributes('aria-label')).toBe(`Play ${tracks[0]!.title}`)
  expect(wrapper!.get('.favorite-button').attributes('aria-label')).toBe(`Remove ${tracks[0]!.title} from favorites`)
  await click('.playlist-nav-item')
  expect(wrapper!.get('#library-title').text()).toBe('我的曲库')
  expect(document.title).toBe('Aftertone · 我的曲库')
  await language('zh-CN')
  expect(document.documentElement.lang).toBe('zh-CN')
  expect(wrapper!.get('.playlist-nav-item').text()).toContain('我的曲库')
})

it('preserves playing and paused audio, filtered results, mode, source and manual queue while switching both ways', async () => {
  const audio = await start(); await select()
  audio.currentTime = 37; await wrapper!.get('audio').trigger('timeupdate')
  await click('.track-list li:nth-child(3) .track-more')
  await click('[data-action="play-next"]')
  await wrapper!.get('#track-search').setValue('山河 2')
  const row = wrapper!.get('.track-list li').element
  await language('en')
  expect(wrapper!.get('audio').element).toBe(audio)
  expect(audio.currentTime).toBe(37)
  expect(audio.paused).toBe(false)
  expect(wrapper!.get('#track-search').element.value).toBe('山河 2')
  expect(wrapper!.get('.track-list li').element).toBe(row)
  expect(wrapper!.get('#playback-mode').attributes('data-mode')).toBe('sequential')
  expect(wrapper!.get('.library-notice').text()).toBe(`“${tracks[2]!.title}” will play next.`)
  await click('.queue-toggle')
  const queuedRow = wrapper!.get('.queue-manual li').element
  expect(wrapper!.get('#queue-title').text()).toBe('Playback queue')
  await language('zh-CN')
  expect(wrapper!.get('.queue-manual li').element).toBe(queuedRow)
  expect(wrapper!.get('#queue-title').text()).toBe('播放队列')
  await click('.queue-close')
  audio.pause(); await language('en')
  expect(audio.paused).toBe(true)
  expect(audio.currentTime).toBe(37)
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  expect(HTMLMediaElement.prototype.load).not.toHaveBeenCalled()
  await click('footer [aria-label="Next track"]')
  expect(wrapper!.get('.now-playing strong').text()).toBe(tracks[2]!.title)
})

it('updates an open full-window view and error without resetting its controls', async () => {
  const audio = await start(); await select(); await click('.now-playing-art-button')
  const dialog = wrapper!.get('#now-playing-view').element
  await wrapper!.get('audio').trigger('error')
  await language('en')
  expect(wrapper!.get('#now-playing-view').element).toBe(dialog)
  expect((dialog as HTMLDialogElement).open).toBe(true)
  expect(wrapper!.get('#now-playing-heading').text()).toBe('Now Playing')
  expect(wrapper!.get('.now-playing-back').text()).toBe('Back to library')
  expect(wrapper!.get('#now-playing-view [role="alert"]').text()).toContain('Could not load the audio')
  expect(wrapper!.get('audio').element).toBe(audio)
})

it('keeps edit drafts, unsaved artwork and validation when language changes', async () => {
  await start(); await click('.track-more'); await click('[data-action="rename"]')
  const input = wrapper!.get('#rename-input').element
  await wrapper!.get('#rename-input').setValue('未保存的新歌名')
  await wrapper!.get('#artist-input').setValue('未保存歌手')
  await wrapper!.get('#album-input').setValue('未保存专辑')
  const file = new File(['test'], 'not-an-image.txt', { type: 'text/plain' })
  Object.defineProperty(wrapper!.get('.cover-picker input').element, 'files', { configurable: true, value: [file] })
  await wrapper!.get('.cover-picker input').trigger('change')
  await language('en')
  expect(wrapper!.get('#rename-input').element).toBe(input)
  expect(wrapper!.get('#rename-input').element.value).toBe('未保存的新歌名')
  expect(wrapper!.get('#artist-input').element.value).toBe('未保存歌手')
  expect(wrapper!.get('#album-input').element.value).toBe('未保存专辑')
  expect(wrapper!.get('.cover-error').text()).toBe('Choose a JPG or PNG image.')
  await wrapper!.get('#rename-input').setValue('')
  await click('.rename-save')
  expect(wrapper!.get('#rename-feedback').text()).toBe('Enter a track title.')
  await language('zh-CN')
  expect(wrapper!.get('#rename-feedback').text()).toBe('请输入歌名。')
})

it('keeps playlist name drafts and localizes validation without changing the prompt', async () => {
  await start(); await click('.playlist-create')
  const input = wrapper!.get('#playlist-name').element
  await wrapper!.get('#playlist-name').setValue('我的曲库')
  await language('en')
  expect(wrapper!.get('#playlist-name').element).toBe(input)
  expect(wrapper!.get('#playlist-name').element.value).toBe('我的曲库')
  expect(wrapper!.get('#playlist-dialog-title').text()).toBe('New playlist')
  await wrapper!.get('#playlist-name').setValue('')
  await wrapper!.get('.playlist-dialog form').trigger('submit')
  expect(wrapper!.get('#playlist-feedback').text()).toContain('Enter a playlist name')
})

it('keeps pending files and in-flight import state and translates a failure after switching', async () => {
  let reject!: (error: Error) => void
  vi.mocked(uploadTrack).mockImplementation(() => new Promise((_, fail) => { reject = fail }))
  await start()
  const files = [new File(['audio'], '曲目一.mp3', { type: 'audio/mpeg' }), new File([], '空文件.mp3')]
  Object.defineProperty(wrapper!.get('.file-picker input').element, 'files', { configurable: true, value: files })
  await wrapper!.get('.file-picker input').trigger('change')
  await click('.upload-panel .primary')
  expect(uploadTrack).toHaveBeenCalledTimes(1)
  await language('en')
  expect(wrapper!.get('[data-state="processing"]').text()).toContain('Uploading and processing')
  expect(wrapper!.get('[data-state="failed"]').text()).toContain('Empty files cannot be imported')
  reject(Object.assign(new Error('磁盘空间不足'), { code: 'INSUFFICIENT_STORAGE', status: 507 }))
  await flushPromises()
  expect(wrapper!.get('.upload-queue-list').text()).toContain('There is not enough disk space')
  await language('zh-CN')
  expect(wrapper!.get('.upload-queue-list').text()).toContain('磁盘空间不足')
  expect(uploadTrack).toHaveBeenCalledTimes(1)
  expect(wrapper!.findAll('.upload-queue-list li')).toHaveLength(2)
})

it('restores English on a fresh mount and renders empty and failed states in English', async () => {
  localStorage.setItem(LOCALE_KEY, 'en')
  vi.mocked(listTracks).mockResolvedValue([])
  await start()
  expect(wrapper!.get('#app-language').element.value).toBe('en')
  expect(wrapper!.get('.empty-state').text()).toContain('Start with a song you love.')
  vi.mocked(listTracks).mockRejectedValue(Object.assign(new Error('服务器内部错误'), { code: 'INTERNAL_ERROR', status: 500 }))
  await click('.list-heading .text-button')
  expect(wrapper!.get('#track-results [role="alert"]').text()).toContain('The server could not complete the request')
  expect(wrapper!.get('#search-summary').text()).toContain('Could not load the library')
})
