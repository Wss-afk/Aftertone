export interface PlaylistEntry { trackId: number; position: number }
export interface Playlist { id: number; name: string; entries: PlaylistEntry[] }

const endpoint = '/api/v1/playlists'

async function request(path: string, method = 'GET', name?: string): Promise<Response> {
  let response: Response
  try {
    response = await fetch(endpoint + path, name === undefined ? { method } : {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
    })
  } catch { throw new Error('无法连接歌单，请检查连接后重试。') }
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new Error(problem?.detail ?? `歌单操作失败（${response.status}），请重试。`)
  }
  return response
}

async function read<T>(path: string, method?: string, name?: string): Promise<T> {
  return (await request(path, method, name)).json() as Promise<T>
}

export const listPlaylists = () => read<Playlist[]>('')
export const createPlaylist = (name: string) => read<Playlist>('', 'POST', name)
export const renamePlaylist = (id: number, name: string) => read<Playlist>(`/${id}`, 'PATCH', name)
export const addToPlaylist = (id: number, trackId: number) => read<Playlist>(`/${id}/tracks/${trackId}`, 'PUT')
export const removeFromPlaylist = (id: number, trackId: number) => read<Playlist>(`/${id}/tracks/${trackId}`, 'DELETE')

export async function deletePlaylist(id: number): Promise<void> {
  await request(`/${id}`, 'DELETE')
}
