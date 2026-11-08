import { afterEach, expect, it, vi } from 'vitest'
import { deleteTrack, renameTrack, setTrackFavorite } from '../api/tracks'

afterEach(() => vi.unstubAllGlobals())

it('sets an explicit favorite state with an idempotent PATCH', async () => {
  const fetch = vi.fn().mockImplementation(async (_url, request) => new Response(JSON.stringify({ id: 7, ...JSON.parse(request.body) })))
  vi.stubGlobal('fetch', fetch)
  await expect(setTrackFavorite(7, true)).resolves.toEqual({ id: 7, favorite: true })
  await expect(setTrackFavorite(7, false)).resolves.toEqual({ id: 7, favorite: false })
  expect(fetch).toHaveBeenLastCalledWith('/api/v1/tracks/7/favorite', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"favorite":false}' })
})

it('reports readable favorite connection and backend errors', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: '没有找到这首歌。' }), { status: 404 }))
  vi.stubGlobal('fetch', fetch)
  await expect(setTrackFavorite(7, true)).rejects.toThrow('收藏状态保存未完成')
  await expect(setTrackFavorite(7, true)).rejects.toThrow('没有找到这首歌。')
})

it('accepts an empty 204 response without parsing JSON', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  await expect(deleteTrack(7)).resolves.toBeUndefined()
  expect(fetch).toHaveBeenCalledWith('/api/v1/tracks/7', { method: 'DELETE' })
})

it('shows the backend deletion problem detail', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: '文件被占用，请重试。' }), { status: 409 })))
  await expect(deleteTrack(7)).rejects.toThrow('文件被占用，请重试。')
})

it('turns connection failure into a readable retry message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await expect(deleteTrack(7)).rejects.toThrow('删除未完成')
})

it('sends the edited title as JSON PATCH and reads the saved track', async () => {
  const track = { id: 7, title: '新名字' }
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(track)))
  vi.stubGlobal('fetch', fetch)
  await expect(renameTrack(7, '新名字')).resolves.toEqual(track)
  expect(fetch).toHaveBeenCalledWith('/api/v1/tracks/7', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '新名字' }) })
})

it('shows the backend rename error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: '没有找到这首歌。' }), { status: 404 })))
  await expect(renameTrack(7, '新名字')).rejects.toThrow('没有找到这首歌。')
})

it('reports interrupted rename connections', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  await expect(renameTrack(7, '新名字')).rejects.toThrow('歌曲信息保存未完成')
})

it('sends a separate artist and permits an empty artist', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetch)
  await renameTrack(7, 'Cloud', 'Galdive')
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ title: 'Cloud', artist: 'Galdive' })
  await renameTrack(7, 'Cloud', '')
  expect(JSON.parse(fetch.mock.calls[1]![1].body)).toEqual({ title: 'Cloud', artist: '' })
})

it('sends album with JSON and combines cover changes and text in one multipart request', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response('{}'))
  vi.stubGlobal('fetch', fetch)
  await renameTrack(7, 'Cloud', 'Galdive', '专辑')
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({ title: 'Cloud', artist: 'Galdive', album: '专辑' })
  const cover = new File(['png'], 'cover.png', { type: 'image/png' })
  await renameTrack(7, 'Cloud', 'Galdive', '专辑', cover)
  const [url, request] = fetch.mock.calls[1]!
  expect(url).toBe('/api/v1/tracks/7/information')
  expect(request.method).toBe('PUT')
  expect(request.body.get('album')).toBe('专辑')
  expect(request.body.get('cover')).toBe(cover)
  expect(request.body.get('removeCover')).toBe('false')
  expect(request.headers).toBeUndefined()
  await renameTrack(7, 'Cloud', 'Galdive', '', undefined, true)
  expect(fetch.mock.calls[2]![1].body.get('removeCover')).toBe('true')
})
