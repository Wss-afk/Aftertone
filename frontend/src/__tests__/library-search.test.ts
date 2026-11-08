import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import App from '../App.vue'
import { deleteTrack, listTracks, renameTrack, type Track } from '../api/tracks'
import { getStorageStatus } from '../api/storage'

vi.mock('../api/tracks', () => ({ listTracks: vi.fn(), deleteTrack: vi.fn(), uploadTrack: vi.fn(), renameTrack: vi.fn(), setTrackFavorite: vi.fn() }))
vi.mock('../api/storage', () => ({ getStorageStatus: vi.fn() }))
const first: Track = { id: 1, title: 'Cloud', artist: 'Galdive', originalFilename: '只在文件名中的下载来源.mp3', sizeBytes: 1024, favorite: false, album: '', durationSeconds: null, coverUrl: null, createdAt: '2026-11-06T00:00:00Z', audioUrl: '/api/v1/tracks/1/audio' }
const second: Track = { ...first, id: 2, title: '夜航灯火', artist: '林间风', originalFilename: '夜航灯火.mp3', audioUrl: '/api/v1/tracks/2/audio' }
const third: Track = { ...first, id: 3, title: 'We Never [Remix]', artist: '', originalFilename: '第三首.mp3', audioUrl: '/api/v1/tracks/3/audio' }
const library = [first, second, third]
let wrapper: VueWrapper
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>
let load: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listTracks).mockResolvedValue(library)
  vi.mocked(deleteTrack).mockResolvedValue(undefined)
  vi.mocked(renameTrack).mockImplementation(async (id, title, artist) => ({ ...library.find(track => track.id === id)!, title, artist: artist ?? '' }))
  vi.mocked(getStorageStatus).mockResolvedValue({ libraryBytes: 3072, diskTotalBytes: 100000000000, diskUsableBytes: 20000000000, reserveBytes: 5368709120, requiredUploadFreeBytes: 5508169728, uploadAllowed: true, volumeRoot: 'C:\\' })
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', '') } })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open') } })
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get() { return !this._testPlaying } })
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = true; this.dispatchEvent(new Event('playing')); return Promise.resolve()
  })
  pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement & { _testPlaying?: boolean }) {
    this._testPlaying = false; this.dispatchEvent(new Event('pause'))
  })
  load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function () { this.currentTime = 0 })
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); document.body.innerHTML = '' })

async function open() { wrapper = mount(App, { attachTo: document.body }); await flushPromises(); return wrapper.get('audio').element as HTMLAudioElement }
async function search(value: string) { await wrapper.get('#track-search').setValue(value); await flushPromises() }
async function button(label: string) { await wrapper.get(`button[aria-label="${label}"]`).trigger('click'); await flushPromises() }
const titles = () => wrapper.findAll('.track-name strong').map(item => item.text())

describe('library search', () => {
  it('matches partial song or artist names, Chinese, case and full-width characters', async () => {
    await open()
    for (const [query, expected] of [
      ['cLoU', 'Cloud'], ['GALDIVE', 'Cloud'], ['ＣＬＯＵＤ', 'Cloud'], ['cloud　galdive', 'Cloud'],
      ['夜航', '夜航灯火'], ['林间', '夜航灯火'], ['未知歌手', third.title], ['[Remix]', third.title],
    ]) {
      await search(query!)
      expect(titles()).toEqual([expected])
      expect(wrapper.get('#search-summary').text()).toBe('找到 1 首，共 3 首')
      expect(wrapper.get('.library-count strong').text()).toBe('3')
    }
    expect(listTracks).toHaveBeenCalledTimes(1)
  })

  it('treats punctuation literally and does not search hidden original filenames', async () => {
    await open()
    for (const query of ['.*', '只在文件名中的下载来源']) {
      await search(query)
      expect(titles()).toEqual([])
      expect(wrapper.get('.search-empty').text()).toContain('没有匹配的歌曲')
    }
  })

  it('clears the query and restores order, counts and input focus', async () => {
    await open(); await search('galdive')
    expect(titles()).toEqual(['Cloud'])
    await button('清空搜索')
    expect(titles()).toEqual(library.map(track => track.title))
    expect(wrapper.get('#search-summary').text()).toBe('共 3 首歌曲')
    expect(document.activeElement).toBe(wrapper.get('#track-search').element)
    expect(wrapper.find('[aria-label="清空搜索"]').exists()).toBe(false)
    await search('　   ')
    expect(titles()).toEqual(library.map(track => track.title))
    expect(wrapper.get('.list-heading h2').text()).toContain('最近上传')
  })

  it('offers an empty-result reset and supports Escape without submitting or navigating', async () => {
    await open(); await search('不存在的歌')
    expect(wrapper.find('.empty-state:not(.search-empty)').exists()).toBe(false)
    expect(wrapper.get('#search-summary').text()).toBe('找到 0 首，共 3 首')
    await wrapper.get('.search-reset').trigger('click')
    expect(titles()).toHaveLength(3)
    await search('galdive')
    await wrapper.get('#track-search').trigger('keydown', { key: 'Escape' })
    expect(titles()).toHaveLength(3)
    await wrapper.get('.library-search').trigger('submit')
    expect(listTracks).toHaveBeenCalledTimes(1)
  })

  it('keeps the same audio, source, progress and playback when hiding the playing song', async () => {
    const audio = await open(); await button('播放 Cloud'); audio.currentTime = 37
    await search('林间')
    expect(titles()).toEqual([second.title])
    expect(wrapper.get('audio').element).toBe(audio)
    expect(audio.getAttribute('src')).toBe(first.audioUrl)
    expect(audio.currentTime).toBe(37); expect(audio.paused).toBe(false)
    expect(wrapper.get('.now-playing strong').text()).toBe('Cloud')
    expect(wrapper.get('.library-note').text()).toContain('播放队列仍按最近上传排列')
    await search('完全没有结果')
    expect(audio.currentTime).toBe(37); expect(audio.paused).toBe(false)
    expect(play).toHaveBeenCalledTimes(1); expect(pause).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled()
  })

  it('uses the full library for next and previous after selecting a filtered result', async () => {
    await open(); await search('林间'); await button(`播放 ${second.title}`)
    await button('下一首')
    expect(wrapper.get('.now-playing strong').text()).toBe(third.title)
    expect(titles()).toEqual([second.title])
    expect(wrapper.get('button[aria-label="下一首"]').attributes('disabled')).toBeDefined()
    await button('上一首')
    expect(wrapper.get('.now-playing strong').text()).toBe(second.title)
    await button('上一首')
    expect(wrapper.get('.now-playing strong').text()).toBe(first.title)
  })

  it('continues through hidden songs automatically and stops at the actual end of the queue', async () => {
    const audio = await open(); await button('播放 Cloud'); await search('remix')
    await wrapper.get('audio').trigger('ended'); await flushPromises()
    expect(wrapper.get('.now-playing strong').text()).toBe(second.title)
    await wrapper.get('audio').trigger('ended'); await flushPromises()
    expect(wrapper.get('.now-playing strong').text()).toBe(third.title)
    await wrapper.get('audio').trigger('ended'); await flushPromises()
    expect(play).toHaveBeenCalledTimes(3)
    expect(audio.getAttribute('src')).toBe(third.audioUrl)
    expect(wrapper.get('button[aria-label="下一首"]').attributes('disabled')).toBeDefined()
  })

  it('reapplies the search when an edit no longer matches while preserving the player', async () => {
    const audio = await open(); await button('播放 Cloud'); audio.currentTime = 37; await search('cloud')
    await button('更多操作 Cloud')
    await wrapper.get('[data-action="rename"]').trigger('click'); await flushPromises()
    await wrapper.get('#rename-input').setValue('雨夜')
    await wrapper.get('.rename-dialog form').trigger('submit'); await flushPromises()
    expect(wrapper.get('.search-empty').text()).toContain('没有匹配的歌曲')
    expect(wrapper.get('.now-playing strong').text()).toBe('雨夜')
    expect(audio.getAttribute('src')).toBe(first.audioUrl); expect(audio.currentTime).toBe(37)
    expect(play).toHaveBeenCalledTimes(1)
    await button('清空搜索')
    expect(titles()).toEqual(['雨夜', second.title, third.title])
  })

  it('deletes only a selected result and keeps the remaining original queue', async () => {
    const audio = await open(); await button('播放 Cloud'); audio.currentTime = 37; await search('林间')
    await button(`更多操作 ${second.title}`)
    await wrapper.get('[data-action="delete"]').trigger('click'); await flushPromises()
    await wrapper.get('.dialog-confirm').trigger('click'); await flushPromises()
    expect(deleteTrack).toHaveBeenCalledExactlyOnceWith(2)
    expect(wrapper.get('.library-count strong').text()).toBe('2')
    expect(wrapper.get('.search-empty').exists()).toBe(true)
    expect(audio.currentTime).toBe(37)
    await button('下一首')
    expect(wrapper.get('.now-playing strong').text()).toBe(third.title)
    await button('清空搜索')
    expect(titles()).toEqual([first.title, third.title])
  })

  it('keeps the query after a refresh and filters newly loaded songs', async () => {
    await open(); await search('cloud')
    vi.mocked(listTracks).mockResolvedValue([{ ...third, title: 'Cloud Nine' }, second, first])
    await wrapper.get('.list-heading button').trigger('click'); await flushPromises()
    expect(listTracks).toHaveBeenCalledTimes(2)
    expect((wrapper.get('#track-search').element as HTMLInputElement).value).toBe('cloud')
    expect(titles()).toEqual(['Cloud Nine', 'Cloud'])
    expect(wrapper.get('#search-summary').text()).toBe('找到 2 首，共 3 首')
  })

  it('distinguishes an empty library from a search with no matches', async () => {
    vi.mocked(listTracks).mockResolvedValue([])
    await open(); await search('cloud')
    expect(wrapper.get('.empty-state').text()).toContain('第一首')
    expect(wrapper.find('.search-empty').exists()).toBe(false)
  })

  it('keeps an entered query while retrying a failed initial library load', async () => {
    vi.mocked(listTracks).mockRejectedValueOnce(new Error('曲库连接失败'))
    await open(); await search('galdive')
    expect(wrapper.get('[role="alert"]').text()).toContain('曲库连接失败')
    expect(wrapper.find('.search-empty').exists()).toBe(false)
    await wrapper.get('[role="alert"] button').trigger('click'); await flushPromises()
    expect(titles()).toEqual(['Cloud'])
    expect(wrapper.get('#search-summary').text()).toBe('找到 1 首，共 3 首')
  })
})
