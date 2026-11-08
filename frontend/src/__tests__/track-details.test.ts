import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import TrackArtwork from '../components/TrackArtwork.vue'
import { listTracks, renameTrack, type Track } from '../api/tracks'
import { getStorageStatus } from '../api/storage'
import { formatDuration } from '../utils/duration'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn(), setTrackFavorite: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))
const track: Track = { id: 1, title: 'Window', artist: 'Galdive', album: 'Night Signal', durationSeconds: 330.135,
  coverUrl: '/api/v1/tracks/1/cover?v=one', originalFilename: 'source.mp3', sizeBytes: 1024, favorite: false, createdAt: '2026-11-06T00:00:00Z', audioUrl: '/api/v1/tracks/1/audio' }
let wrapper: VueWrapper
const revoke = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listTracks).mockResolvedValue([track, { ...track, id: 2, title: '无标签', album: '', durationSeconds: null, coverUrl: null }])
  vi.mocked(getStorageStatus).mockRejectedValue(new Error('测试环境'))
  vi.mocked(renameTrack).mockImplementation(async (id, title, artist, album, cover, remove) => ({ ...track, id, title, artist: artist ?? '', album: album ?? '', coverUrl: remove ? null : cover ? '/api/v1/tracks/1/cover?v=two' : track.coverUrl }))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () { this.dispatchEvent(new Event('playing')); return Promise.resolve() })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.stubGlobal('URL', class extends URL { static createObjectURL() { return 'blob:test-cover' }; static revokeObjectURL = revoke })
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })
async function open() { wrapper = mount(App, { attachTo: document.body }); await flushPromises() }
async function edit() {
  await wrapper.get('button[aria-label="更多操作 Window"]').trigger('click'); await flushPromises()
  await wrapper.get('[data-action="rename"]').trigger('click'); await flushPromises()
}
async function choose(file: File) {
  const input = wrapper.get('input[aria-label="选择歌曲封面"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
}
async function save() { await wrapper.get('.rename-dialog form').trigger('submit'); await flushPromises() }

it('shows embedded details and honest missing-data fallbacks in the library and player', async () => {
  await open()
  expect(wrapper.findAll('.track-duration').map(item => item.text())).toEqual(['5:30', '--:--'])
  expect(wrapper.findAll('.track-album').map(item => item.text())).toEqual(['Night Signal', '未知专辑'])
  expect(wrapper.get('.track-art img').attributes('src')).toBe(track.coverUrl)
  await wrapper.get('button[aria-label="播放 Window"]').trigger('click'); await flushPromises()
  expect(wrapper.get('.player-art img').attributes('src')).toBe(track.coverUrl)
  expect(wrapper.get('.player-album').text()).toBe('Night Signal')
  expect(wrapper.get('.player-artist').text()).toBe('Galdive')
})

it('replaces cover and album in one save without restarting the current audio', async () => {
  await open(); await wrapper.get('button[aria-label="播放 Window"]').trigger('click'); await flushPromises()
  const audio = wrapper.get('audio').element as HTMLAudioElement
  audio.currentTime = 37
  await edit()
  expect((wrapper.get('#album-input').element as HTMLInputElement).value).toBe('Night Signal')
  const cover = new File(['png'], 'cover.png', { type: 'image/png' })
  await choose(cover)
  expect(wrapper.get('.cover-preview img').attributes('src')).toBe('blob:test-cover')
  await wrapper.get('#album-input').setValue(' 新专辑 '); await save()
  expect(renameTrack).toHaveBeenCalledExactlyOnceWith(1, 'Window', 'Galdive', '新专辑', cover, false)
  expect(wrapper.get('.player-album').text()).toBe('新专辑')
  expect(wrapper.get('.player-art img').attributes('src')).toContain('v=two')
  expect(wrapper.get('audio').element).toBe(audio)
  expect(audio.currentTime).toBe(37)
  expect(audio.getAttribute('src')).toBe(track.audioUrl)
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1)
  expect(revoke).toHaveBeenCalledWith('blob:test-cover')
})

it('cancels a selected cover and releases its preview without changing saved data', async () => {
  await open(); await edit(); await choose(new File(['png'], 'cover.png', { type: 'image/png' }))
  await wrapper.get('.rename-cancel').trigger('click'); await flushPromises()
  expect(renameTrack).not.toHaveBeenCalled()
  expect(revoke).toHaveBeenCalledWith('blob:test-cover')
  expect(wrapper.get('.track-art img').attributes('src')).toBe(track.coverUrl)
})

it('removes a cover explicitly and accepts an empty album', async () => {
  await open(); await edit(); await wrapper.get('.cover-remove').trigger('click')
  expect(wrapper.find('.cover-preview img').exists()).toBe(false)
  await wrapper.get('#album-input').setValue('　'); await save()
  expect(renameTrack).toHaveBeenCalledExactlyOnceWith(1, 'Window', 'Galdive', '', undefined, true)
  expect(wrapper.find('.track-art img').exists()).toBe(false)
  expect(wrapper.get('.track-album').text()).toBe('未知专辑')
})

it('blocks oversized or unsupported covers and invalid albums before saving', async () => {
  await open(); await edit()
  await choose(new File(['<svg/>'], 'cover.svg', { type: 'image/svg+xml' })); await save()
  expect(wrapper.get('.cover-error').text()).toContain('JPG 或 PNG')
  expect(renameTrack).not.toHaveBeenCalled()
  await choose(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })); await save()
  expect(wrapper.get('.cover-error').text()).toContain('5 MB')
  expect(renameTrack).not.toHaveBeenCalled()
  await choose(new File(['png'], 'ok.png', { type: 'image/png' }))
  await wrapper.get('#album-input').setValue('🎵'.repeat(256)); await save()
  expect(wrapper.get('.rename-error').text()).toContain('专辑最多 255')
  expect(renameTrack).not.toHaveBeenCalled()
  await wrapper.get('.cover-reset').trigger('click')
  expect(wrapper.find('.cover-error').exists()).toBe(false)
  expect(wrapper.get('.cover-preview img').attributes('src')).toBe(track.coverUrl)
  await wrapper.get('#album-input').setValue('新专辑'); await save()
  expect(renameTrack).toHaveBeenCalledExactlyOnceWith(1, 'Window', 'Galdive', '新专辑', undefined, false)
})

it('falls back on broken cover URLs and retries when the URL changes', async () => {
  wrapper = mount(TrackArtwork, { props: { url: '/broken' } })
  await wrapper.get('img').trigger('error')
  expect(wrapper.find('img').exists()).toBe(false)
  expect(wrapper.text()).toBe('♪')
  await wrapper.setProps({ url: '/replaced' })
  expect(wrapper.get('img').attributes('src')).toBe('/replaced')
})

it('formats saved audio durations including hours and missing values', () => {
  expect([null, undefined, NaN, Infinity, -1].map(formatDuration)).toEqual(Array(5).fill('--:--'))
  expect([0, 59.9, 197.5, 330.1, 3661.8].map(formatDuration)).toEqual(['0:00', '0:59', '3:17', '5:30', '1:01:01'])
})
