import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import UploadPanel from '../components/UploadPanel.vue'
import { uploadTrack, type Track } from '../api/tracks'

vi.mock('../api/tracks', () => ({ uploadTrack: vi.fn() }))
afterEach(() => vi.resetAllMocks())

const track = { id: 1, title: '测试音' } as Track
const file = (name: string) => new File([name], name, { type: 'audio/mpeg' })

it('imports dropped files one at a time, skips duplicates and retries only the failed item', async () => {
  const files = ['one.mp3', 'two.mp3', 'three.mp3'].map(file)
  let finishFirst!: (result: Track) => void
  vi.mocked(uploadTrack)
    .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve }))
    .mockRejectedValueOnce(new Error('连接断开'))
    .mockRejectedValueOnce(Object.assign(new Error('重复文件'), { code: 'DUPLICATE_TRACK', status: 409 }))
    .mockResolvedValueOnce(track)
  const wrapper = mount(UploadPanel)
  try {
    await wrapper.get('form').trigger('drop', { dataTransfer: { files } })
    await wrapper.get('form').trigger('submit')
    expect(uploadTrack).toHaveBeenCalledExactlyOnceWith(files[0])
    expect(wrapper.get('[data-state="processing"]').text()).toContain('one.mp3')
    finishFirst(track)
    await flushPromises()
    expect(wrapper.get('[data-state="failed"]').text()).toContain('two.mp3')
    expect(wrapper.get('[data-state="duplicate"]').text()).toContain('three.mp3')
    await wrapper.get('[aria-label="重试 two.mp3"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(uploadTrack).mock.calls).toEqual([[files[0]], [files[1]], [files[2]], [files[1]]])
    expect(wrapper.findAll('[data-state="done"]')).toHaveLength(2)
  } finally { wrapper.unmount() }
})

it('pauses on a storage error and leaves later items available to import', async () => {
  const files = ['first.mp3', 'second.mp3', 'third.mp3'].map(file)
  vi.mocked(uploadTrack).mockResolvedValueOnce(track)
    .mockRejectedValueOnce(Object.assign(new Error('磁盘剩余空间不足'), { status: 507 }))
  const wrapper = mount(UploadPanel)
  try {
    const input = wrapper.get('input[type="file"]')
    expect(input.attributes()).toHaveProperty('multiple')
    Object.defineProperty(input.element, 'files', { value: files })
    await input.trigger('change')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(vi.mocked(uploadTrack).mock.calls).toEqual([[files[0]], [files[1]]])
    expect(wrapper.get('[data-state="queued"]').text()).toContain('third.mp3')
    expect(wrapper.get('[data-state="failed"]').text()).toContain('磁盘剩余空间不足')
    expect(wrapper.emitted('uploaded')).toHaveLength(1)
    await wrapper.setProps({ blocked: true })
    expect(wrapper.get('button[type="submit"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.get('[aria-label="重试 second.mp3"]').attributes()).toHaveProperty('disabled')
  } finally { wrapper.unmount() }
})
