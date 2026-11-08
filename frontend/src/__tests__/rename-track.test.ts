import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { listTracks, renameTrack, type Track } from '../api/tracks'
import { getStorageStatus } from '../api/storage'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn(), setTrackFavorite: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))
const first: Track = { id: 1, title: '甲', artist: '歌手甲', originalFilename: '甲.mp3', sizeBytes: 1024, favorite: false, album: '', durationSeconds: null, coverUrl: null, createdAt: '2026-11-06T00:00:00Z', audioUrl: '/api/v1/tracks/1/audio' }
const second: Track = { ...first, id: 2, title: '乙', originalFilename: '乙.mp3', audioUrl: '/api/v1/tracks/2/audio' }
let wrapper: VueWrapper
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>
let load: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listTracks).mockResolvedValue([first, second])
  vi.mocked(renameTrack).mockImplementation(async (id, title, artist, album) => ({ ...(id === first.id ? first : second), title, artist: artist ?? '', album: album ?? '' }))
  vi.mocked(getStorageStatus).mockResolvedValue({ libraryBytes: 2048, diskTotalBytes: 100000000000, diskUsableBytes: 20000000000, reserveBytes: 5368709120, requiredUploadFreeBytes: 5508169728, uploadAllowed: true, volumeRoot: 'C:\\' })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () { this.dispatchEvent(new Event('playing')); return Promise.resolve() })
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); document.body.innerHTML = '' })

async function open() { wrapper = mount(App, { attachTo: document.body }); await flushPromises(); return wrapper.get('audio').element as HTMLAudioElement }
async function button(label: string) {
  if (label.startsWith('编辑歌名 ')) {
    await wrapper.get(`button[aria-label="更多操作 ${label.slice(5)}"]`).trigger('click'); await flushPromises()
    await wrapper.get('[role="menuitem"][data-action="rename"]').trigger('click')
  } else await wrapper.get(`button[aria-label="${label}"]`).trigger('click')
  await flushPromises()
}
async function edit(title: string) { await wrapper.get('#rename-input').setValue(title) }
async function save() { await wrapper.get('.rename-dialog form').trigger('submit'); await flushPromises() }

describe('track rename', () => {
  it('prefills the chosen title and cancel leaves the library unchanged', async () => {
    await open(); await button('编辑歌名 甲')
    expect((wrapper.get('#rename-input').element as HTMLInputElement).value).toBe('甲')
    const input = wrapper.get('#rename-input').element as HTMLInputElement
    expect(document.activeElement).toBe(input)
    expect(input.selectionEnd! - input.selectionStart!).toBe(first.title.length)
    await edit('取消的名字'); await wrapper.get('.rename-cancel').trigger('click')
    expect(wrapper.get('.rename-dialog').attributes('open')).toBeUndefined()
    expect(renameTrack).not.toHaveBeenCalled()
    expect(wrapper.get('button[aria-label="播放 甲"]').exists()).toBe(true)
    await button('编辑歌名 乙')
    expect((wrapper.get('#rename-input').element as HTMLInputElement).value).toBe('乙')
  })

  it('rejects blank and overly long names without a request', async () => {
    await open(); await button('编辑歌名 甲'); await edit(' \u00a0　'); await save()
    expect(wrapper.get('.rename-error').text()).toBe('请输入歌名。')
    await edit('歌'.repeat(256)); await save()
    expect(wrapper.get('.rename-error').text()).toContain('255')
    expect(renameTrack).not.toHaveBeenCalled()
  })

  it('counts emoji as Unicode characters and saves trimmed titles', async () => {
    await open(); await button('编辑歌名 甲'); await edit('　' + '🎵'.repeat(255) + '　'); await save()
    expect(renameTrack).toHaveBeenCalledExactlyOnceWith(1, '🎵'.repeat(255), '歌手甲', '', undefined, false)
    expect(wrapper.get('.rename-dialog').attributes('open')).toBeUndefined()
  })

  it('updates the row and player without changing audio, progress or playback', async () => {
    const audio = await open(); await button('播放 甲'); audio.currentTime = 37
    await button('编辑歌名 甲'); await edit(' 新歌名 '); await save()
    expect(wrapper.get('audio').element).toBe(audio)
    expect(audio.getAttribute('src')).toBe(first.audioUrl)
    expect(audio.currentTime).toBe(37)
    expect(play).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled()
    expect(wrapper.get('.now-playing').text()).toContain('新歌名')
    expect(wrapper.get('.now-playing').text()).toContain('正在播放')
    expect(wrapper.get('button[aria-label="播放 新歌名"]').text()).toContain('歌手甲')
    expect(wrapper.get('button[aria-label="播放 新歌名"]').text()).not.toContain('甲.mp3')
    expect(wrapper.findAll('.track-name strong').map(item => item.text())).toEqual(['新歌名', '乙'])
  })

  it('leaves the current player unchanged when renaming another song', async () => {
    const audio = await open(); await button('播放 甲'); audio.currentTime = 37
    await button('编辑歌名 乙'); await edit('另一个名字'); await save()
    expect(wrapper.get('.now-playing strong').text()).toBe('甲')
    expect(audio.currentTime).toBe(37); expect(play).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button[aria-label="播放 另一个名字"]').exists()).toBe(true)
  })

  it('retains the entered name and old song on failure, then permits retry', async () => {
    vi.mocked(renameTrack).mockRejectedValueOnce(new Error('保存失败，请重试。'))
    await open(); await button('播放 甲'); await button('编辑歌名 甲'); await edit('新歌名'); await save()
    expect(wrapper.get('.rename-dialog').attributes('open')).toBeDefined()
    expect(wrapper.get('.rename-error').text()).toContain('保存失败')
    expect((wrapper.get('#rename-input').element as HTMLInputElement).value).toBe('新歌名')
    expect(wrapper.get('.now-playing strong').text()).toBe('甲')
    await save()
    expect(wrapper.get('.now-playing strong').text()).toBe('新歌名')
  })

  it('prevents duplicate saves and closing while the request is pending', async () => {
    let resolve!: (track: Track) => void
    vi.mocked(renameTrack).mockReturnValue(new Promise<Track>(done => { resolve = done }))
    await open(); await button('编辑歌名 甲'); await edit('新名字')
    await wrapper.get('.rename-dialog form').trigger('submit')
    await wrapper.get('.rename-dialog form').trigger('submit')
    await wrapper.get('.rename-dialog').trigger('cancel')
    expect(renameTrack).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.rename-save').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.rename-cancel').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#rename-input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.rename-dialog').attributes('open')).toBeDefined()
    resolve({ ...first, title: '新名字' }); await flushPromises()
  })

  it('ignores an old list response that would restore the previous title', async () => {
    await open()
    let resolve!: (tracks: Track[]) => void
    vi.mocked(listTracks).mockReturnValue(new Promise<Track[]>(done => { resolve = done }))
    await wrapper.get('.list-heading button').trigger('click')
    expect(listTracks).toHaveBeenCalledTimes(2)
    await button('编辑歌名 甲'); await edit('新名字'); await save()
    resolve([first, second]); await flushPromises()
    expect(wrapper.get('button[aria-label="播放 新名字"]').exists()).toBe(true)
    expect(wrapper.find('button[aria-label="播放 甲"]').exists()).toBe(false)
  })

  it('saves artist together with title and updates the player without restarting', async () => {
    const audio = await open(); await button('播放 甲'); audio.currentTime = 37
    await button('编辑歌名 甲'); await edit('Cloud'); await wrapper.get('#artist-input').setValue(' Galdive '); await save()
    expect(renameTrack).toHaveBeenCalledExactlyOnceWith(1, 'Cloud', 'Galdive', '', undefined, false)
    expect(wrapper.get('.track-name small').text()).toBe('Galdive')
    expect(wrapper.get('.player-artist').text()).toBe('Galdive')
    expect(audio.currentTime).toBe(37); expect(play).toHaveBeenCalledTimes(1)
  })

  it('rejects an overly long artist and allows unknown artist by clearing the field', async () => {
    await open(); await button('编辑歌名 甲'); await wrapper.get('#artist-input').setValue('🎵'.repeat(256)); await save()
    expect(wrapper.get('.rename-error').text()).toContain('歌手最多 255')
    expect(renameTrack).not.toHaveBeenCalled()
    await wrapper.get('#artist-input').setValue('　'); await save()
    expect(renameTrack).toHaveBeenCalledExactlyOnceWith(1, '甲', '', '', undefined, false)
    expect(wrapper.get('.track-name small').text()).toBe('未知歌手')
  })
})
