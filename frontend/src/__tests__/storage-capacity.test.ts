import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import StorageStatusPanel from '../components/StorageStatusPanel.vue'
import App from '../App.vue'
import { getStorageStatus, type StorageStatus } from '../api/storage'
import { listTracks, uploadTrack, type Track } from '../api/tracks'

vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))
vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), uploadTrack: vi.fn(), deleteTrack: vi.fn(), renameTrack: vi.fn(), setTrackFavorite: vi.fn() }))
const GB = 1024 ** 3
const healthy: StorageStatus = { libraryBytes: 4.5 * 1024 ** 2, diskTotalBytes: 1000 * GB, diskUsableBytes: 600 * GB, reserveBytes: 5 * GB, requiredUploadFreeBytes: 5 * GB + 133 * 1024 ** 2, uploadAllowed: true, volumeRoot: 'C:\\' }
const low: StorageStatus = { ...healthy, diskUsableBytes: 4 * GB, uploadAllowed: false }
const song: Track = { id: 1, title: '容量测试音', artist: '', originalFilename: 'tone.mp3', sizeBytes: 1024, favorite: false, album: '', durationSeconds: null, coverUrl: null, createdAt: '2026-11-06T00:00:00Z', audioUrl: '/api/v1/tracks/1/audio' }
let wrapper: VueWrapper

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getStorageStatus).mockResolvedValue(healthy)
  vi.mocked(listTracks).mockResolvedValue([song])
  vi.mocked(uploadTrack).mockResolvedValue(song)
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); document.body.innerHTML = '' })

async function open() { wrapper = mount(App); await flushPromises() }
async function chooseFile() {
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['generated test audio'], 'tone.mp3', { type: 'audio/mpeg' })] })
  await input.trigger('change')
}

describe('storage capacity display and upload guard', () => {
  it('shows library bytes, the correct volume and the configured reserve', () => {
    wrapper = mount(StorageStatusPanel, { props: { capacity: healthy, loading: false, error: '' } })
    expect(wrapper.text()).toContain('4.5 MB')
    expect(wrapper.text()).toContain('C 盘可用')
    expect(wrapper.text()).toContain('600 GB')
    expect(wrapper.text()).toContain('为系统预留 5 GB')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('makes low space visible and disables upload even after selecting a file', async () => {
    vi.mocked(getStorageStatus).mockResolvedValue(low)
    await open()
    await chooseFile()
    expect(wrapper.get('.storage-warning').text()).toContain('上传已暂停')
    expect(wrapper.get('button.primary').attributes('disabled')).toBeDefined()
    await wrapper.get('form').trigger('submit')
    expect(uploadTrack).not.toHaveBeenCalled()
    expect(wrapper.get('button[aria-label="播放 容量测试音"]').exists()).toBe(true)
    expect(wrapper.get('button[aria-label="更多操作 容量测试音"]').exists()).toBe(true)
  })

  it('refreshing after space is freed re-enables the already selected file', async () => {
    vi.mocked(getStorageStatus).mockResolvedValueOnce(low).mockResolvedValue(healthy)
    await open()
    await chooseFile()
    await wrapper.get('button[aria-label="刷新容量"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.storage-warning').exists()).toBe(false)
    expect(wrapper.get('button.primary').attributes('disabled')).toBeUndefined()
  })

  it('updates capacity after upload succeeds', async () => {
    await open()
    await chooseFile()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(uploadTrack).toHaveBeenCalledTimes(1)
    expect(getStorageStatus).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('已加入曲库')
  })

  it('refreshes into blocked state if the server reports space dropped during upload', async () => {
    vi.mocked(getStorageStatus).mockResolvedValueOnce(healthy).mockResolvedValue(low)
    vi.mocked(uploadTrack).mockRejectedValue(new Error('磁盘剩余空间不足，上传已暂停。'))
    await open()
    await chooseFile()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('磁盘剩余空间不足')
    expect(wrapper.get('button.primary').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.upload-queue').text()).toContain('tone.mp3')
  })

  it('keeps the library and player usable when capacity information is temporarily unavailable', async () => {
    vi.mocked(getStorageStatus).mockRejectedValue(new Error('容量信息暂不可用，请重试。'))
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    await open()
    expect(wrapper.get('.storage-unavailable').text()).toContain('容量信息暂不可用')
    await wrapper.get('button[aria-label="播放 容量测试音"]').trigger('click')
    await flushPromises()
    expect(play).toHaveBeenCalledTimes(1)
    expect(wrapper.get('audio').attributes('src')).toBe(song.audioUrl)
  })

  it('refreshes capacity when returning to the browser window', async () => {
    await open()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(getStorageStatus).toHaveBeenCalledTimes(2)
  })
})
