import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { deleteTrack, listTracks, type Track } from '../api/tracks'
import { getStorageStatus } from '../api/storage'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn(), setTrackFavorite: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))

const first: Track = { id: 1, title: '甲', artist: '歌手甲', originalFilename: '甲.mp3', sizeBytes: 1024, favorite: false, album: '', durationSeconds: null, coverUrl: null, createdAt: '2026-11-06T00:00:00Z', audioUrl: '/api/v1/tracks/1/audio' }
const second: Track = { ...first, id: 2, title: '乙', originalFilename: '乙.mp3', audioUrl: '/api/v1/tracks/2/audio' }
let wrapper: VueWrapper
let play: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listTracks).mockResolvedValue([first, second])
  vi.mocked(deleteTrack).mockResolvedValue(undefined)
  vi.mocked(getStorageStatus).mockResolvedValue({ libraryBytes: 2048, diskTotalBytes: 100000000000, diskUsableBytes: 20000000000, reserveBytes: 5368709120, requiredUploadFreeBytes: 5508161536, uploadAllowed: true, volumeRoot: 'C:\\' })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !this._testPlaying } })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() { return 1 } })
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get() { return 100 } })
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
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

afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); document.body.innerHTML = '' })

async function open() {
  wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  return wrapper.get('audio').element as HTMLAudioElement
}
async function button(label: string) {
  if (label.startsWith('删除 ')) {
    await wrapper.get(`button[aria-label="更多操作 ${label.slice(3)}"]`).trigger('click'); await flushPromises()
    await wrapper.get('[role="menuitem"][data-action="delete"]').trigger('click')
  } else await wrapper.get(`button[aria-label="${label}"]`).trigger('click')
  await flushPromises()
}
async function confirm() { await wrapper.get('.dialog-confirm').trigger('click'); await flushPromises() }

describe('single-track deletion', () => {
  it('shows the chosen title and cancelling leaves songs and playback untouched', async () => {
    const audio = await open()
    await button('删除 甲')
    expect(wrapper.get('dialog.delete-dialog').attributes('open')).toBeDefined()
    expect(wrapper.get('.delete-track-title').text()).toBe('甲')
    await wrapper.get('.dialog-cancel').trigger('click')
    expect(wrapper.get('dialog.delete-dialog').attributes('open')).toBeUndefined()
    expect(deleteTrack).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
    expect(audio.getAttribute('src')).toBeNull()
    expect(wrapper.findAll('.track-button')).toHaveLength(2)
  })

  it('stops and clears the player after deleting the current song', async () => {
    const audio = await open()
    await button('播放 甲')
    audio.currentTime = 37
    await button('删除 甲')
    expect(wrapper.text()).toContain('删除后会停止播放')
    await confirm()
    expect(deleteTrack).toHaveBeenCalledExactlyOnceWith(1)
    expect(wrapper.find('button[aria-label="播放 甲"]').exists()).toBe(false)
    expect(audio.getAttribute('src')).toBeNull()
    expect(audio.paused).toBe(true)
    expect(wrapper.get('.now-playing').text()).toContain('还没有正在播放的音乐')
    expect(wrapper.text()).toContain('已删除「甲」')
  })

  it('keeps source, progress and playback when deleting another song', async () => {
    const audio = await open()
    await button('播放 甲')
    audio.currentTime = 37
    await button('删除 乙')
    await confirm()
    expect(audio.getAttribute('src')).toBe(first.audioUrl)
    expect(audio.currentTime).toBe(37)
    expect(audio.paused).toBe(false)
    expect(play).toHaveBeenCalledTimes(1)
    expect(wrapper.findAll('.track-button')).toHaveLength(1)
  })

  it('restores current song, position and playback if deletion fails', async () => {
    vi.mocked(deleteTrack).mockRejectedValue(new Error('文件暂时无法删除'))
    const audio = await open()
    await button('播放 甲')
    audio.currentTime = 37
    await button('删除 甲')
    await confirm()
    expect(wrapper.get('dialog.delete-dialog').attributes('open')).toBeDefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('文件暂时无法删除')
    expect(wrapper.findAll('.track-button')).toHaveLength(2)
    expect(audio.getAttribute('src')).toBe(first.audioUrl)
    expect(audio.currentTime).toBe(37)
    expect(audio.paused).toBe(false)
  })

  it('does not start a paused song when a failed deletion restores it', async () => {
    vi.mocked(deleteTrack).mockRejectedValue(new Error('删除失败'))
    const audio = await open()
    await button('播放 甲')
    audio.pause()
    audio.currentTime = 25
    await button('删除 甲')
    await confirm()
    expect(audio.currentTime).toBe(25)
    expect(audio.paused).toBe(true)
  })

  it('blocks duplicate confirmation and cancellation while the request is pending', async () => {
    let resolve!: () => void
    vi.mocked(deleteTrack).mockReturnValue(new Promise<void>(done => { resolve = done }))
    await open()
    await button('删除 乙')
    await wrapper.get('.dialog-confirm').trigger('click')
    await wrapper.get('.dialog-confirm').trigger('click')
    expect(deleteTrack).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.dialog-confirm').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.dialog-cancel').attributes('disabled')).toBeDefined()
    resolve()
    await flushPromises()
  })

  it('returns to the empty library after removing the last song', async () => {
    vi.mocked(listTracks).mockResolvedValue([first])
    await open()
    await button('删除 甲')
    await confirm()
    expect(wrapper.findAll('.track-button')).toHaveLength(0)
    expect(wrapper.get('.empty-state').text()).toContain('第一首')
    expect(getStorageStatus).toHaveBeenCalledTimes(2)
  })

  it('does not reinsert a deleted song from a stale refresh response', async () => {
    await open()
    let resolve!: (value: Track[]) => void
    vi.mocked(listTracks).mockReturnValue(new Promise<Track[]>(done => { resolve = done }))
    await wrapper.get('.list-heading button').trigger('click')
    expect(listTracks).toHaveBeenCalledTimes(2)
    await button('删除 乙')
    await confirm()
    resolve([first, second])
    await flushPromises()
    expect(wrapper.findAll('.track-button')).toHaveLength(1)
    expect(wrapper.find('button[aria-label="播放 乙"]').exists()).toBe(false)
  })
})
