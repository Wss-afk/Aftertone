import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { listTracks, type Track } from '../api/tracks'
import { listPlaylists } from '../api/playlists'
import { getStorageStatus } from '../api/storage'
import { SHORTCUTS_KEY } from '../utils/keyboardShortcuts'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), setTrackFavorite: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn() }))
vi.mock('../api/playlists', () => ({ listPlaylists: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))

const tracks: Track[] = [1, 2, 3, 4].map(id => ({ id, title: `曲目 ${id}`, artist: '歌手', album: '专辑', favorite: id !== 2,
  durationSeconds: 100, coverUrl: null, originalFilename: `${id}.mp3`, sizeBytes: 1000,
  createdAt: '2026-11-23T00:00:00Z', audioUrl: `/api/v1/tracks/${id}/audio` }))
let wrapper: VueWrapper | undefined
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>
let load: ReturnType<typeof vi.spyOn>
let ready: number

beforeEach(() => {
  vi.resetAllMocks()
  ready = 1
  vi.mocked(listTracks).mockResolvedValue(tracks.map(track => ({ ...track })))
  vi.mocked(listPlaylists).mockResolvedValue([])
  vi.mocked(getStorageStatus).mockRejectedValue(new Error('test'))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() {
    this.setAttribute('open', ''); this.querySelector('[autofocus]')?.focus()
  } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() {
    this.removeAttribute('open'); this.dispatchEvent(new Event('close'))
  } })
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !this._testPlaying } })
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get() { return 100 } })
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get() { return ready } })
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = true; this.dispatchEvent(new Event('playing')); return Promise.resolve()
  })
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = false; this.dispatchEvent(new Event('pause'))
  })
  load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount(); wrapper = undefined
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.documentElement.style.overflow = ''
})

async function start() {
  wrapper = mount(App, { attachTo: document.body, global: { stubs: { transition: false } } })
  await flushPromises()
  return wrapper.get('audio').element as HTMLAudioElement
}
async function click(selector: string) { await wrapper!.get(selector).trigger('click'); await flushPromises() }
async function select(id = 1, metadata = true) {
  await click(`[aria-label="播放 曲目 ${id}"]`)
  if (metadata) await wrapper!.get('audio').trigger('loadedmetadata')
}
function key(value: string, target: EventTarget = document.body, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: value, code: value === ' ' ? 'Space' : '', bubbles: true, cancelable: true, ...extra })
  target.dispatchEvent(event)
  return event
}
async function press(value: string, target?: EventTarget, extra?: KeyboardEventInit) {
  const event = key(value, target, extra); await flushPromises(); return event
}

describe('media shortcuts', () => {
  it('seeks in five-second steps, accepts repeats and clamps without restarting paused or playing audio', async () => {
    const audio = await start(); await select()
    audio.currentTime = 37
    expect((await press('j')).defaultPrevented).toBe(true)
    expect(audio.currentTime).toBe(32)
    await press('L', document.body, { repeat: true })
    expect(audio.currentTime).toBe(37)
    expect(audio.paused).toBe(false)
    audio.pause(); audio.currentTime = 98
    await press('l'); expect(audio.currentTime).toBe(100)
    audio.currentTime = 2
    await press('j'); expect(audio.currentTime).toBe(0)
    expect(audio.paused).toBe(true)
    expect(play).toHaveBeenCalledTimes(1)
    expect(load).not.toHaveBeenCalled()
  })

  it('ignores seeking until metadata is ready and preserves an outstanding restored position', async () => {
    ready = 0
    localStorage.setItem('night-signal.playback-position', JSON.stringify({ trackId: 1, createdAt: tracks[0]!.createdAt, time: 37 }))
    const audio = await start()
    expect(key('l').defaultPrevented).toBe(false)
    expect(audio.currentTime).toBe(0)
    ready = 1; await wrapper!.get('audio').trigger('loadedmetadata')
    await press('l')
    expect(audio.currentTime).toBe(42)
    expect(play).not.toHaveBeenCalled()
  })

  it('skips along the current favorites source and ignores held next-track keys', async () => {
    const audio = await start()
    await click('.library-navigation button:nth-child(2)'); await select()
    await wrapper!.get('#track-search').setValue('曲目 1')
    await press('n')
    expect(audio.getAttribute('src')).toBe(tracks[2]!.audioUrl)
    await press('n', document.body, { repeat: true })
    expect(audio.getAttribute('src')).toBe(tracks[2]!.audioUrl)
    await press('p')
    expect(audio.getAttribute('src')).toBe(tracks[0]!.audioUrl)
    expect(play).toHaveBeenCalledTimes(3)
  })

  it('takes manually queued tracks before the original source and does not wrap at sequential boundaries', async () => {
    const audio = await start(); await select()
    expect(key('p').defaultPrevented).toBe(false)
    await click('[aria-label="更多操作 曲目 4"]'); await click('[data-action="play-next"]')
    await press('n'); expect(audio.getAttribute('src')).toBe(tracks[3]!.audioUrl)
    await press('n'); expect(audio.getAttribute('src')).toBe(tracks[1]!.audioUrl)
    await select(4)
    expect(key('n').defaultPrevented).toBe(false)
    expect(audio.getAttribute('src')).toBe(tracks[3]!.audioUrl)
  })

  it('adjusts volume in five-percent steps, supports plus/equal, clamps and restores mute', async () => {
    const audio = await start(); await select()
    await press('-'); expect(audio.volume).toBe(.95)
    await press('=', document.body, { repeat: true }); expect(audio.volume).toBe(1)
    await press('+', document.body, { shiftKey: true }); expect(audio.volume).toBe(1)
    audio.volume = .02; await wrapper!.get('audio').trigger('volumechange')
    await press('-'); expect(audio.volume).toBe(0)
    await press('m'); expect(audio.volume).toBe(.02)
    await press('m'); expect(audio.muted).toBe(true)
    await press('m', document.body, { repeat: true }); expect(audio.muted).toBe(true)
    await press('+', document.body, { shiftKey: true })
    expect(audio.volume).toBe(.05); expect(audio.muted).toBe(false)
    expect(wrapper!.get('.volume-slider').element.value).toBe('0.05')
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('toggles with K while preserving native Space activation on buttons', async () => {
    const audio = await start(); await select(); audio.currentTime = 37
    await press('k', wrapper!.get('.now-playing-title-button').element)
    expect(audio.paused).toBe(true)
    await press('k', document.body, { repeat: true }); expect(audio.paused).toBe(true)
    await press('K'); expect(audio.paused).toBe(false)
    expect(audio.currentTime).toBe(37)
    expect(key(' ', wrapper!.get('.play-toggle').element).defaultPrevented).toBe(false)
    expect(play).toHaveBeenCalledTimes(2)
  })
})

describe('focus, help and native keyboard behavior', () => {
  it('focuses and selects the existing search without requiring a current track', async () => {
    await start(); await wrapper!.get('#track-search').setValue('曲目 1')
    expect((await press('/')).defaultPrevented).toBe(true)
    const input = wrapper!.get('#track-search').element as HTMLInputElement
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('曲目 1')
    expect(input.selectionStart).toBe(0); expect(input.selectionEnd).toBe(input.value.length)
    expect(key('/', input).defaultPrevented).toBe(false)
    expect(play).not.toHaveBeenCalled()
  })

  it('closes the full-window view before focusing search and keeps playback continuous', async () => {
    const audio = await start(); await select(); audio.currentTime = 37
    await wrapper!.get('#track-search').setValue('曲目 1')
    await click('.now-playing-art-button')
    await press('/', wrapper!.get('.now-playing-back').element)
    await vi.waitFor(() => expect((wrapper!.get('#now-playing-view').element as HTMLDialogElement).open).toBe(false))
    expect(document.activeElement).toBe(wrapper!.get('#track-search').element)
    expect(wrapper!.get('#track-search').element.value).toBe('曲目 1')
    expect(audio.paused).toBe(false); expect(audio.currentTime).toBe(37)
    expect(play).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled()
  })

  it('leaves text inputs, dropdowns, sliders, editable content and menus alone', async () => {
    const audio = await start(); await select(); audio.currentTime = 37
    const editable = document.createElement('div'); editable.contentEditable = 'true'; editable.setAttribute('contenteditable', 'true'); document.body.append(editable)
    for (const target of [wrapper!.get('#track-search').element, wrapper!.get('#app-language').element, wrapper!.get('.seek-slider').element, wrapper!.get('.volume-slider').element, editable]) {
      for (const command of ['j', 'l', 'n', 'p', 'm', '-', '+', '/', '?', 'k']) expect(key(command, target).defaultPrevented).toBe(false)
    }
    await click('.track-more')
    expect(key('n').defaultPrevented).toBe(false)
    expect(key('?').defaultPrevented).toBe(false)
    expect(audio.currentTime).toBe(37); expect(audio.paused).toBe(false)
    expect(audio.volume).toBe(1); expect(audio.muted).toBe(false)
  })

  it('preserves browser modifiers, composition, handled events and unrelated navigation keys', async () => {
    const audio = await start(); await select(); audio.currentTime = 37
    for (const extra of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) {
      expect(key('j', document.body, extra).defaultPrevented).toBe(false)
    }
    for (const value of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab', 'F5']) expect(key(value).defaultPrevented).toBe(false)
    const handled = new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }); handled.preventDefault(); document.body.dispatchEvent(handled)
    expect(audio.currentTime).toBe(37); expect(audio.volume).toBe(1)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('blocks media and help shortcuts while an editing dialog is open', async () => {
    const audio = await start(); await select(); audio.currentTime = 37
    await click('.track-more'); await click('[data-action="rename"]')
    for (const command of ['j', 'l', 'n', 'p', 'm', '-', '/', '?', 'k', ' ']) expect(key(command).defaultPrevented).toBe(false)
    expect((wrapper!.get('#keyboard-shortcuts').element as HTMLDialogElement).open).toBe(false)
    expect(audio.currentTime).toBe(37); expect(audio.paused).toBe(false)
  })

  it('opens bilingual help without a song and blocks shortcuts while help is open', async () => {
    await start(); await press('?', document.body, { shiftKey: true })
    const dialog = wrapper!.get('#keyboard-shortcuts').element as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(wrapper!.get('#shortcuts-title').text()).toBe('键盘快捷键')
    for (const command of ['k', '/', '?', '-']) expect(key(command).defaultPrevented).toBe(false)
    await wrapper!.get('#app-language').setValue('en')
    expect(wrapper!.get('#shortcuts-title').text()).toBe('Keyboard shortcuts')
    expect(wrapper!.get('.shortcuts-list').text()).toContain('Back / forward 5 seconds')
    expect(wrapper!.get('kbd').text()).toBe('Space')
    await wrapper!.get('#keyboard-shortcuts').trigger('cancel'); await flushPromises()
    expect(dialog.open).toBe(false)
    expect(play).not.toHaveBeenCalled()
  })

  it('opens help above full-window playback and releases nested scroll locks even on unmount', async () => {
    const audio = await start(); await select()
    document.documentElement.style.overflow = 'auto'
    await click('.now-playing-art-button')
    await click('#now-playing-view .shortcuts-toggle')
    expect((wrapper!.get('#now-playing-view').element as HTMLDialogElement).open).toBe(true)
    expect((wrapper!.get('#keyboard-shortcuts').element as HTMLDialogElement).open).toBe(true)
    await click('.shortcuts-close')
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(audio.paused).toBe(false)
    await click('#now-playing-view .shortcuts-toggle')
    wrapper!.unmount(); wrapper = undefined
    expect(document.documentElement.style.overflow).toBe('auto')
  })
})

describe('shortcut preferences', () => {
  it('disables character shortcuts and remembers the choice, with the help button still available', async () => {
    const audio = await start(); await select(); audio.currentTime = 37
    await click('footer .shortcuts-toggle'); await wrapper!.get('#enable-shortcuts').setValue(false)
    expect(localStorage.getItem(SHORTCUTS_KEY)).toBe('false')
    await click('.shortcuts-close')
    expect(wrapper!.get('footer .shortcuts-toggle').attributes('aria-keyshortcuts')).toBeUndefined()
    for (const command of ['j', 'k', 'n', '-', 'm', '/', '?', ' ']) expect(key(command).defaultPrevented).toBe(false)
    expect(audio.currentTime).toBe(37); expect(audio.paused).toBe(false)
    await click('footer .shortcuts-toggle')
    expect((wrapper!.get('#keyboard-shortcuts').element as HTMLDialogElement).open).toBe(true)
    wrapper!.unmount(); wrapper = undefined
    await start()
    await click('footer .shortcuts-toggle')
    expect(wrapper!.get('#enable-shortcuts').element.checked).toBe(false)
    await wrapper!.get('#enable-shortcuts').setValue(true)
    expect(localStorage.getItem(SHORTCUTS_KEY)).toBe('true')
  })

  it('uses the default for invalid preferences and tolerates blocked storage', async () => {
    localStorage.setItem(SHORTCUTS_KEY, 'invalid')
    await start(); await press('?')
    expect(wrapper!.get('#enable-shortcuts').element.checked).toBe(true)
    wrapper!.unmount(); wrapper = undefined
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await start(); await click('footer .shortcuts-toggle')
    await wrapper!.get('#enable-shortcuts').setValue(false)
    await click('.shortcuts-close')
    expect(key('?').defaultPrevented).toBe(false)
  })

  it('does not act without a selected song or after unmounting', async () => {
    await start()
    for (const command of ['k', 'n', 'p', 'j', 'l', '-', '+', 'm', ' ']) expect(key(command).defaultPrevented).toBe(false)
    await select(); wrapper!.unmount(); wrapper = undefined
    expect(key('k').defaultPrevented).toBe(false)
    expect(pause).not.toHaveBeenCalled()
  })
})
