import { afterEach, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TrackList from '../components/TrackList.vue'
import type { Track } from '../api/tracks'

const track: Track = { id: 1, title: 'Cloud', artist: 'Galdive', originalFilename: 'Cloud - Galdive【Hi-Res】.mp3', sizeBytes: 1024, favorite: false, album: '', durationSeconds: null, coverUrl: null, createdAt: '2026-11-06T00:00:00Z', audioUrl: '/api/v1/tracks/1/audio' }
let wrapper: VueWrapper
afterEach(() => { wrapper?.unmount(); document.body.innerHTML = '' })
function open() { wrapper = mount(TrackList, { props: { tracks: [track, { ...track, id: 2, title: '另一首', artist: '' }], playing: false }, attachTo: document.body }) }
async function menu() { await wrapper.get('button[aria-label="更多操作 Cloud"]').trigger('click'); await flushPromises() }

it('shows song and artist and keeps row actions inside the ellipsis menu', async () => {
  open()
  expect(wrapper.get('.track-name strong').text()).toBe('Cloud')
  expect(wrapper.get('.track-name small').text()).toBe('Galdive')
  expect(wrapper.text()).not.toContain(track.originalFilename)
  expect(wrapper.text()).toContain('未知歌手')
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  await menu()
  expect(wrapper.findAll('[role="menuitem"]').map(item => item.text())).toEqual(['修改信息', '下一首播放', '删除歌曲'])
  await wrapper.get('[data-action="rename"]').trigger('click')
  expect(wrapper.emitted('rename')![0]).toEqual([track])
  expect(wrapper.emitted('select')).toBeUndefined()
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
})

it('routes only the selected song to the existing deletion confirmation', async () => {
  open(); await menu(); await wrapper.get('[data-action="delete"]').trigger('click')
  expect(wrapper.emitted('delete')![0]).toEqual([track])
  expect(wrapper.emitted('select')).toBeUndefined()
})

it('supports arrows, Escape and restoring trigger focus', async () => {
  open()
  const trigger = wrapper.get('button[aria-label="更多操作 Cloud"]')
  await trigger.trigger('keydown', { key: 'ArrowDown' }); await flushPromises()
  expect(document.activeElement).toBe(wrapper.get('[data-action="rename"]').element)
  await wrapper.get('[data-action="rename"]').trigger('keydown', { key: 'ArrowDown' })
  expect(document.activeElement).toBe(wrapper.get('[data-action="play-next"]').element)
  await wrapper.get('[data-action="play-next"]').trigger('keydown', { key: 'ArrowDown' })
  expect(document.activeElement).toBe(wrapper.get('[data-action="delete"]').element)
  await wrapper.get('[data-action="delete"]').trigger('keydown', { key: 'Escape' })
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  expect(document.activeElement).toBe(trigger.element)
})

it('closes on outside click or another row and disables actions during saving', async () => {
  open(); await menu()
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await flushPromises()
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  await menu(); await wrapper.get('button[aria-label="更多操作 另一首"]').trigger('click'); await flushPromises()
  expect(wrapper.findAll('[role="menu"]')).toHaveLength(1)
  await wrapper.setProps({ deleting: true })
  expect(wrapper.find('[role="menu"]').exists()).toBe(false)
  expect(wrapper.get('button[aria-label="更多操作 Cloud"]').attributes('disabled')).toBeDefined()
})
