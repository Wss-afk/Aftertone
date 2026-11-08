import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import { deletePlaylist, listPlaylists, removeFromPlaylist, type Playlist } from '../api/playlists'
import { listTracks, type Track } from '../api/tracks'
import { getStorageStatus } from '../api/storage'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), setTrackFavorite: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))
vi.mock('../api/playlists', () => ({ listPlaylists: vi.fn(), createPlaylist: vi.fn(), renamePlaylist: vi.fn(), addToPlaylist: vi.fn(), removeFromPlaylist: vi.fn(), deletePlaylist: vi.fn() }))

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

const tracks: Track[] = [1, 2, 3, 4].map(id => ({ id, title: `曲目 ${id}`, artist: '歌手', album: '',
  audioUrl: `/api/v1/tracks/${id}/audio`, coverUrl: null, durationSeconds: 95, favorite: false,
  originalFilename: `${id}.mp3`, sizeBytes: 100, createdAt: '' }))

it('continues from the removed song’s playlist slot even after browsing and searching elsewhere', async () => {
  const playlist: Playlist = { id: 1, name: '夜听', entries: [2, 1, 3].map((trackId, index) => ({ trackId, position: index + 1 })) }
  vi.mocked(listTracks).mockResolvedValue(tracks)
  vi.mocked(listPlaylists).mockResolvedValue([playlist])
  vi.mocked(getStorageStatus).mockRejectedValue(new Error('test'))
  vi.mocked(removeFromPlaylist).mockResolvedValue({ ...playlist, entries: playlist.entries.filter(entry => entry.trackId !== 1) })
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const wrapper = mount(App, { attachTo: document.body })
  try {
    await flushPromises()
    await wrapper.get('.playlist-nav-item').trigger('click')
    expect(wrapper.findAll('.track-name strong').map(item => item.text())).toEqual(['曲目 2', '曲目 1', '曲目 3'])
    await wrapper.get('[aria-label="播放 曲目 1"]').trigger('click'); await flushPromises()
    const audio = wrapper.get('audio').element
    audio.currentTime = 30
    await wrapper.get('[aria-label="更多操作 曲目 1"]').trigger('click'); await flushPromises()
    await wrapper.get('[data-action="remove-from-playlist"]').trigger('click'); await flushPromises()
    expect(removeFromPlaylist).toHaveBeenCalledExactlyOnceWith(1, 1)
    expect(wrapper.get('audio').element).toBe(audio)
    expect(audio.currentTime).toBe(30)
    expect(play).toHaveBeenCalledTimes(1)
    await wrapper.get('.library-navigation button').trigger('click')
    await wrapper.get('#track-search').setValue('曲目 4')
    await wrapper.get('audio').trigger('ended'); await flushPromises()
    expect(wrapper.get('.now-playing strong').text()).toBe('曲目 3')
    expect(audio.getAttribute('src')).toBe(tracks[2]!.audioUrl)
  } finally { wrapper.unmount() }
})

it('keeps playback and shared tracks when a playlist deletion is retried', async () => {
  const active: Playlist = { id: 1, name: '夜听', entries: [{ trackId: 1, position: 1 }, { trackId: 2, position: 2 }] }
  const other: Playlist = { id: 2, name: '雨天', entries: [{ trackId: 1, position: 3 }] }
  vi.mocked(listTracks).mockResolvedValue(tracks)
  vi.mocked(listPlaylists).mockResolvedValue([active, other])
  vi.mocked(getStorageStatus).mockRejectedValue(new Error('test'))
  vi.mocked(deletePlaylist).mockRejectedValueOnce(new Error('连接中断')).mockResolvedValueOnce(undefined)
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  const wrapper = mount(App, { attachTo: document.body })
  const dialog = wrapper.get('dialog.playlist-dialog').element as HTMLDialogElement
  Object.defineProperty(dialog, 'showModal', { value: () => dialog.setAttribute('open', '') })
  Object.defineProperty(dialog, 'close', { value: () => dialog.removeAttribute('open') })
  try {
    await flushPromises()
    await wrapper.findAll('.playlist-nav-item')[0]!.trigger('click')
    await wrapper.get('[aria-label="播放 曲目 1"]').trigger('click'); await flushPromises()
    const audio = wrapper.get('audio').element
    audio.currentTime = 30
    await wrapper.get('.playlist-delete').trigger('click'); await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.playlist-dialog .rename-cancel').element)
    const confirm = () => wrapper.get('.playlist-dialog form').trigger('submit')
    await confirm(); await flushPromises()
    expect(wrapper.get('.playlist-dialog [role="alert"]').text()).toBe('连接中断')
    expect(wrapper.findAll('.playlist-nav-item')).toHaveLength(2)
    await confirm(); await flushPromises()
    expect(vi.mocked(deletePlaylist).mock.calls).toEqual([[1], [1]])
    expect(wrapper.get('#library-title').text()).toBe('我的曲库.')
    expect(wrapper.findAll('.track-name strong')).toHaveLength(4)
    expect(wrapper.get('audio').element).toBe(audio)
    expect(audio.currentTime).toBe(30)
    expect(play).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[aria-label="下一首"]').attributes('disabled')).toBeDefined()
    await wrapper.get('.playlist-nav-item').trigger('click')
    expect(wrapper.get('#library-title').text()).toBe('雨天.')
    expect(wrapper.get('.track-name strong').text()).toBe('曲目 1')
  } finally { wrapper.unmount() }
})
