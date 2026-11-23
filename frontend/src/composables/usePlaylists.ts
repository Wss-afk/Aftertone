import { ref } from 'vue'
import { deletePlaylist, listPlaylists, type Playlist } from '../api/playlists'
import { fromError, type MessageValue } from '../i18n'

export function usePlaylists() {
  const playlists = ref<Playlist[]>([])
  const loading = ref(true)
  const loadError = ref<MessageValue>('')
  const busy = ref(false)
  const error = ref<MessageValue>('')
  let request = 0

  async function refresh() {
    if (busy.value) return
    const version = ++request
    loading.value = true
    loadError.value = ''
    try {
      const result = await listPlaylists()
      if (version === request) playlists.value = result
    } catch (cause) {
      if (version === request) loadError.value = fromError(cause, '歌单读取失败，请重试。')
    } finally {
      if (version === request) loading.value = false
    }
  }

  async function mutate<T>(operation: () => Promise<T>, apply: (result: T) => void) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      const updated = await operation()
      ++request // Ignore refresh results that predate the confirmed change.
      loading.value = false
      apply(updated)
      return updated
    } catch (cause) {
      error.value = fromError(cause, '歌单保存失败，请重试。')
    } finally { busy.value = false }
  }

  function save(operation: () => Promise<Playlist>) {
    return mutate(operation, updated => {
      const index = playlists.value.findIndex(playlist => playlist.id === updated.id)
      if (index < 0) playlists.value.push(updated)
      else playlists.value[index] = updated
    })
  }

  function remove(id: number) {
    return mutate(async () => {
      await deletePlaylist(id)
      return id
    }, deletedId => { playlists.value = playlists.value.filter(playlist => playlist.id !== deletedId) })
  }

  return { playlists, loading, loadError, busy, error, refresh, save, remove }
}
