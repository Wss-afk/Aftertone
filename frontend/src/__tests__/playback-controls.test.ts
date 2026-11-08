import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { listTracks, deleteTrack, type Track } from '../api/tracks'
import { getStorageStatus } from '../api/storage'
import { PLAYBACK_MODE_KEY } from '../composables/usePlaybackQueue'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn(), setTrackFavorite: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))
const first: Track = { id: 1, title: '甲', artist: '歌手甲', originalFilename: '甲.mp3', sizeBytes: 1024, favorite: false, album: '', durationSeconds: null, coverUrl: null, createdAt: '2026-11-06T00:00:00Z', audioUrl: '/api/v1/tracks/1/audio' }
const second = { ...first, id: 2, title: '乙', audioUrl: '/api/v1/tracks/2/audio' }
const third = { ...first, id: 3, title: '丙', audioUrl: '/api/v1/tracks/3/audio' }
const library = [first, second, third]
let wrapper: VueWrapper
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>
let load: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.removeItem(PLAYBACK_MODE_KEY)
  vi.mocked(listTracks).mockResolvedValue(library)
  vi.mocked(deleteTrack).mockResolvedValue(undefined)
  vi.mocked(getStorageStatus).mockResolvedValue({ libraryBytes: 3072, diskTotalBytes: 100000000000, diskUsableBytes: 20000000000, reserveBytes: 5368709120, requiredUploadFreeBytes: 5508169728, uploadAllowed: true, volumeRoot: 'C:\\' })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !this._testPlaying } })
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get() { return 100 } })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() { return 1 } })
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = true; this.dispatchEvent(new Event('playing')); return Promise.resolve()
  })
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = false; this.dispatchEvent(new Event('pause'))
  })
  load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () { this.currentTime = 0 })
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); localStorage.removeItem(PLAYBACK_MODE_KEY); document.body.innerHTML = '' })
async function open() { wrapper = mount(App, { attachTo: document.body }); await flushPromises(); return wrapper.get('audio').element as HTMLAudioElement }
async function button(label: string) { await wrapper.get(`button[aria-label="${label}"]`).trigger('click'); await flushPromises() }
async function mode(value: string) {
  for (let i = 0; i < 3 && wrapper.get('#playback-mode').attributes('data-mode') !== value; i++) {
    await wrapper.get('#playback-mode').trigger('click'); await flushPromises()
  }
  expect(wrapper.get('#playback-mode').attributes('data-mode')).toBe(value)
}
async function end() { await wrapper.get('audio').trigger('ended'); await flushPromises() }
async function remove(title: string) {
  await button(`更多操作 ${title}`); await wrapper.get('[data-action="delete"]').trigger('click'); await flushPromises()
  await wrapper.get('.dialog-confirm').trigger('click'); await flushPromises()
}
function space(target: EventTarget = document.body, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true, ...extra })
  target.dispatchEvent(event)
  return event
}

describe('playback modes', () => {
  it('defaults to sequential playback and stops at the real last song', async () => {
    await open()
    expect(wrapper.get('#playback-mode').attributes('data-mode')).toBe('sequential')
    await button('播放 甲'); await end(); expect(wrapper.get('.now-playing strong').text()).toBe('乙')
    await end(); expect(wrapper.get('.now-playing strong').text()).toBe('丙')
    await end(); expect(play).toHaveBeenCalledTimes(3)
    expect(wrapper.get('button[aria-label="下一首"]').attributes('disabled')).toBeDefined()
  })

  it('changes modes without touching source, time, playing or paused state', async () => {
    const audio = await open(); await button('播放 甲'); audio.currentTime = 37
    expect(wrapper.find('select#playback-mode').exists()).toBe(false)
    for (const value of ['repeat-one', 'shuffle', 'sequential']) {
      await wrapper.get('#playback-mode').trigger('click'); await flushPromises()
      expect(wrapper.get('#playback-mode').attributes('data-mode')).toBe(value)
      expect(wrapper.get('#playback-mode').attributes('aria-label')).toContain('点击切换为')
      expect(wrapper.get('audio').element).toBe(audio)
      expect(audio.currentTime).toBe(37); expect(audio.getAttribute('src')).toBe(first.audioUrl)
      expect(audio.paused).toBe(false); expect(audio.loop).toBe(value === 'repeat-one')
    }
    audio.pause(); await mode('repeat-one')
    expect(audio.paused).toBe(true); expect(audio.currentTime).toBe(37)
    expect(play).toHaveBeenCalledTimes(1); expect(load).not.toHaveBeenCalled()
  })

  it('loops the current song at the end and still permits manual skips', async () => {
    const audio = await open(); await button('播放 甲'); await mode('repeat-one'); audio.currentTime = 100
    await end()
    expect(audio.loop).toBe(true); expect(audio.currentTime).toBe(0)
    expect(audio.getAttribute('src')).toBe(first.audioUrl); expect(play).toHaveBeenCalledTimes(2)
    await button('下一首'); expect(wrapper.get('.now-playing strong').text()).toBe('乙')
    await button('上一首'); expect(wrapper.get('.now-playing strong').text()).toBe('甲')
    expect(load).not.toHaveBeenCalled()
  })

  it('randomly advances through the full library while excluding the current song', async () => {
    await open(); await button('播放 甲'); await mode('shuffle')
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(.999).mockReturnValue(0)
    await wrapper.get('#track-search').setValue('不存在')
    await button('下一首'); expect(wrapper.get('.now-playing strong').text()).toBe('乙')
    await end(); expect(wrapper.get('.now-playing strong').text()).toBe('丙')
    await end(); expect(wrapper.get('.now-playing strong').text()).toBe('甲')
    expect(wrapper.get('.search-empty').exists()).toBe(true)
    expect(wrapper.get('.library-note').text()).toContain('完整曲库选歌')
  })

  it('returns to history and follows it forward instead of choosing a new random song', async () => {
    await open(); await button('播放 甲'); await mode('shuffle')
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(.999)
    await button('下一首'); await button('下一首')
    await button('上一首'); expect(wrapper.get('.now-playing strong').text()).toBe('乙')
    await button('上一首'); expect(wrapper.get('.now-playing strong').text()).toBe('甲')
    expect(wrapper.get('button[aria-label="上一首"]').attributes('disabled')).toBeDefined()
    await button('下一首'); expect(wrapper.get('.now-playing strong').text()).toBe('乙')
    await button('下一首'); expect(wrapper.get('.now-playing strong').text()).toBe('丙')
    expect(random).toHaveBeenCalledTimes(2)
  })

  it('skips deleted songs in random history and excludes them from future choices', async () => {
    await open(); await button('播放 甲'); await mode('shuffle')
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValue(.999)
    await button('下一首'); await button('下一首'); await remove('乙')
    await button('上一首'); expect(wrapper.get('.now-playing strong').text()).toBe('甲')
    await button('下一首'); expect(wrapper.get('.now-playing strong').text()).toBe('丙')
    await button('下一首'); expect(wrapper.get('.now-playing strong').text()).toBe('甲')
  })

  it('uses newly refreshed songs as random candidates', async () => {
    await open(); await button('播放 甲'); await mode('shuffle')
    vi.mocked(listTracks).mockResolvedValue([...library, { ...first, id: 4, title: '丁', audioUrl: '/api/v1/tracks/4/audio' }])
    await wrapper.get('.list-heading button').trigger('click'); await flushPromises()
    vi.spyOn(Math, 'random').mockReturnValue(.999)
    await button('下一首'); expect(wrapper.get('.now-playing strong').text()).toBe('丁')
  })

  it('handles a one-song library without immediate repeats in random mode', async () => {
    vi.mocked(listTracks).mockResolvedValue([first])
    const audio = await open(); await mode('shuffle'); await button('播放 甲'); await end()
    expect(audio.loop).toBe(false); expect(play).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button[aria-label="下一首"]').attributes('disabled')).toBeDefined()
    await mode('repeat-one'); await end()
    expect(play).toHaveBeenCalledTimes(2); expect(audio.loop).toBe(true)
  })

  it('clears the loop and timing after deleting the current song', async () => {
    const audio = await open(); await button('播放 甲'); await mode('repeat-one'); audio.currentTime = 37
    await wrapper.get('audio').trigger('loadedmetadata'); await remove('甲'); await end()
    expect(audio.getAttribute('src')).toBeNull(); expect(audio.loop).toBe(false)
    expect(wrapper.get('.time-elapsed').text()).toBe('0:00')
    expect(play).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button[aria-label="播放"]').attributes('disabled')).toBeDefined()
  })

  it('shows a failed automatic transition and permits retry without a skip loop', async () => {
    await open(); await button('播放 甲'); await mode('shuffle')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    play.mockRejectedValueOnce(new Error('Playback blocked'))
    await end()
    expect(wrapper.get('.player-error').text()).toContain('暂时无法播放')
    expect(play).toHaveBeenCalledTimes(2)
    await wrapper.get('.player-error button').trigger('click'); await flushPromises()
    expect(play).toHaveBeenCalledTimes(3); expect(wrapper.get('.now-playing strong').text()).toBe('乙')
  })

  it('remembers the mode in this browser without starting music on remount', async () => {
    await open(); await mode('shuffle'); expect(localStorage.getItem(PLAYBACK_MODE_KEY)).toBe('shuffle')
    wrapper.unmount(); await open()
    expect(wrapper.get('#playback-mode').attributes('data-mode')).toBe('shuffle')
    expect(play).not.toHaveBeenCalled()
  })

  it('falls back to sequential for invalid preferences and tolerates blocked browser storage', async () => {
    localStorage.setItem(PLAYBACK_MODE_KEY, 'invalid')
    await open(); expect(wrapper.get('#playback-mode').attributes('data-mode')).toBe('sequential')
    wrapper.unmount()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked') })
    await open(); await button('播放 甲'); await mode('repeat-one')
    expect((wrapper.get('audio').element as HTMLAudioElement).loop).toBe(true)
  })
})

describe('visible progress and volume', () => {
  it('shows elapsed time, total time and permits seeking without restarting playback', async () => {
    const audio = await open(); await button('播放 甲'); audio.currentTime = 37
    await wrapper.get('audio').trigger('loadedmetadata')
    expect(wrapper.get('.time-elapsed').text()).toBe('0:37'); expect(wrapper.get('.time-total').text()).toBe('1:40')
    const slider = wrapper.get('.seek-slider')
    ;(slider.element as HTMLInputElement).value = '56'; await slider.trigger('input')
    expect(wrapper.get('.time-elapsed').text()).toBe('0:56'); expect(audio.currentTime).toBe(37)
    audio.currentTime = 38; await wrapper.get('audio').trigger('timeupdate')
    expect(wrapper.get('.time-elapsed').text()).toBe('0:56')
    await slider.trigger('change')
    expect(audio.currentTime).toBe(56); expect(play).toHaveBeenCalledTimes(1); expect(audio.paused).toBe(false)
    await button('暂停')
    ;(slider.element as HTMLInputElement).value = '70'; await slider.trigger('input'); await slider.trigger('change')
    expect(audio.currentTime).toBe(70); expect(audio.paused).toBe(true); expect(load).not.toHaveBeenCalled()
  })

  it('cancels a pending seek when the track changes', async () => {
    const audio = await open(); await button('播放 甲'); await wrapper.get('audio').trigger('loadedmetadata')
    const slider = wrapper.get('.seek-slider')
    ;(slider.element as HTMLInputElement).value = '56'; await slider.trigger('input')
    await button('下一首'); audio.currentTime = 0; await wrapper.get('audio').trigger('loadedmetadata'); await slider.trigger('change')
    expect(audio.currentTime).toBe(0); expect(wrapper.get('.now-playing strong').text()).toBe('乙')
  })

  it('disables seeking until a finite duration is available', async () => {
    await open(); expect(wrapper.get('.seek-slider').attributes('disabled')).toBeDefined()
    await button('播放 甲'); Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get() { return Infinity } })
    await wrapper.get('audio').trigger('loadedmetadata')
    expect(wrapper.get('.seek-slider').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.time-total').text()).toBe('0:00')
  })

  it('retains volume and mute controls after replacing browser controls', async () => {
    const audio = await open(); await button('播放 甲')
    await wrapper.get('.volume-slider').setValue('0.3')
    expect(audio.volume).toBe(.3)
    await button('静音'); expect(audio.muted).toBe(true)
    await button('取消静音'); expect(audio.muted).toBe(false); expect(audio.volume).toBe(.3)
    await button('静音'); await wrapper.get('.volume-slider').setValue('0.6')
    expect(audio.muted).toBe(false); expect(audio.volume).toBe(.6)
    await wrapper.get('.volume-slider').setValue('0')
    await button('取消静音')
    expect(audio.muted).toBe(false); expect(audio.volume).toBe(.6)
    expect(play).toHaveBeenCalledTimes(1)
  })
})

describe('Space keyboard shortcut', () => {
  it('pauses and resumes the same song and position', async () => {
    const audio = await open(); await button('播放 甲'); audio.currentTime = 37
    expect(space().defaultPrevented).toBe(true); await flushPromises()
    expect(audio.paused).toBe(true); expect(audio.currentTime).toBe(37)
    space(); await flushPromises()
    expect(audio.paused).toBe(false); expect(audio.currentTime).toBe(37)
    expect(audio.getAttribute('src')).toBe(first.audioUrl); expect(play).toHaveBeenCalledTimes(2)
  })

  it('works when the current song row or progress slider has focus', async () => {
    const audio = await open(); await button('播放 甲')
    space(wrapper.get('button[aria-label="播放 甲"]').element); await flushPromises()
    expect(audio.paused).toBe(true)
    space(wrapper.get('.seek-slider').element); await flushPromises()
    expect(audio.paused).toBe(false)
  })

  it('ignores text entry, mode selection and action menus', async () => {
    const audio = await open(); await button('播放 甲')
    for (const target of [wrapper.get('#track-search').element, wrapper.get('#playback-mode').element, wrapper.get('button[aria-label="更多操作 甲"]').element]) {
      expect(space(target).defaultPrevented).toBe(false)
    }
    await button('更多操作 甲')
    expect(space(wrapper.get('[data-action="rename"]').element).defaultPrevented).toBe(false)
    expect(audio.paused).toBe(false); expect(pause).not.toHaveBeenCalled()
  })

  it('does not intercept Space while an edit or deletion dialog is open', async () => {
    const audio = await open(); await button('播放 甲'); await button('更多操作 甲')
    await wrapper.get('[data-action="rename"]').trigger('click'); await flushPromises()
    expect(space(wrapper.get('#rename-input').element).defaultPrevented).toBe(false)
    expect(space().defaultPrevented).toBe(false)
    await wrapper.get('.rename-cancel').trigger('click'); await flushPromises(); await button('更多操作 甲')
    await wrapper.get('[data-action="delete"]').trigger('click'); await flushPromises()
    expect(space().defaultPrevented).toBe(false); expect(audio.paused).toBe(false)
    expect(deleteTrack).not.toHaveBeenCalled()
  })

  it('ignores key repeats and modified or composing keyboard events', async () => {
    const audio = await open(); await button('播放 甲'); space(); await flushPromises()
    expect(space(document.body, { repeat: true }).defaultPrevented).toBe(true)
    for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }]) {
      expect(space(document.body, extra).defaultPrevented).toBe(false)
    }
    expect(audio.paused).toBe(true); expect(play).toHaveBeenCalledTimes(1); expect(pause).toHaveBeenCalledTimes(1)
  })

  it('leaves Space alone when no track is selected or the app has unmounted', async () => {
    await open(); expect(space().defaultPrevented).toBe(false)
    await button('播放 甲'); wrapper.unmount()
    expect(space().defaultPrevented).toBe(false); expect(pause).not.toHaveBeenCalled()
  })
})
