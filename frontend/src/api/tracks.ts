export interface Track {
  id: number
  title: string
  artist: string
  album: string
  durationSeconds: number | null
  coverUrl: string | null
  favorite: boolean
  originalFilename: string
  sizeBytes: number
  createdAt: string
  audioUrl: string
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw Object.assign(new Error(problem?.detail ?? `请求失败（${response.status}），请重试。`), {
      status: response.status, code: problem?.code,
    })
  }
  return response.json() as Promise<T>
}

export async function listTracks(): Promise<Track[]> {
  try {
    return await readResponse<Track[]>(await fetch('/api/v1/tracks'))
  } catch (error) {
    if (error instanceof TypeError) throw new Error('无法连接曲库，请确认后端已启动。')
    throw error
  }
}

export async function uploadTrack(file: File): Promise<Track> {
  const form = new FormData()
  form.append('file', file)
  try {
    return await readResponse<Track>(await fetch('/api/v1/tracks?skipDuplicates=true', { method: 'POST', body: form }))
  } catch (error) {
    if (error instanceof TypeError) throw new Error('网络连接中断，请重试上传。')
    throw error
  }
}

export async function deleteTrack(id: number): Promise<void> {
  let response: Response
  try { response = await fetch(`/api/v1/tracks/${id}`, { method: 'DELETE' }) }
  catch { throw new Error('无法连接曲库，删除未完成，请重试。') }
  if (!response.ok) await readResponse<never>(response)
}

export async function setTrackFavorite(id: number, favorite: boolean): Promise<Pick<Track, 'id' | 'favorite'>> {
  let response: Response
  try {
    response = await fetch(`/api/v1/tracks/${id}/favorite`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite }),
    })
  } catch { throw new Error('无法连接曲库，收藏状态保存未完成，请重试。') }
  return readResponse<Pick<Track, 'id' | 'favorite'>>(response)
}

export async function renameTrack(id: number, title: string, artist?: string, album?: string, cover?: File, removeCover = false): Promise<Track> {
  let response: Response
  try {
    if (cover || removeCover) {
      const form = new FormData()
      form.append('title', title)
      form.append('artist', artist ?? '')
      form.append('album', album ?? '')
      if (cover) form.append('cover', cover)
      form.append('removeCover', String(removeCover))
      response = await fetch(`/api/v1/tracks/${id}/information`, { method: 'PUT', body: form })
    } else {
      response = await fetch(`/api/v1/tracks/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, artist, album }),
      })
    }
  } catch { throw new Error('无法连接曲库，歌曲信息保存未完成，请重试。') }
  return readResponse<Track>(response)
}
