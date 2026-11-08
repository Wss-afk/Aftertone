<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Playlist } from '../api/playlists'
import type { Track } from '../api/tracks'

type Prompt = { kind: 'create' } | { kind: 'rename'; playlist: Playlist } | { kind: 'add'; track: Track } | { kind: 'delete'; playlist: Playlist }
const props = defineProps<{ prompt?: Prompt; playlists: Playlist[]; busy: boolean; error: string }>()
const emit = defineEmits<{ cancel: []; name: [name: string]; add: [id: number]; delete: [] }>()
const dialog = ref<HTMLDialogElement>()
const field = ref<HTMLInputElement | HTMLSelectElement>()
const cancelButton = ref<HTMLButtonElement>()
const draft = ref('')
const chosen = ref<number>()
const attempted = ref(false)
const titles = { create: '新建歌单', rename: '修改歌单名称', add: '加入歌单', delete: '删除歌单？' }
const title = computed(() => props.prompt ? titles[props.prompt.kind] : '')
const deleting = computed(() => props.prompt?.kind === 'delete')
const name = computed(() => draft.value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, ''))
const invalidName = computed(() => !name.value || Array.from(name.value).length > 80 || /\p{Cc}/u.test(name.value))
const addTrack = computed(() => props.prompt?.kind === 'add' ? props.prompt.track : undefined)
const contains = (playlist: Playlist) => playlist.entries.some(entry => entry.trackId === addTrack.value?.id)
const canAdd = computed(() => props.playlists.some(playlist => !contains(playlist)))
const feedback = computed(() => attempted.value && invalidName.value && !addTrack.value
  ? '请输入 1–80 个字符的歌单名称，名称不能包含控制字符。' : props.error)

watch(() => props.prompt, async prompt => {
  if (!prompt) { if (dialog.value?.open) dialog.value.close(); return }
  draft.value = prompt.kind === 'rename' ? prompt.playlist.name : ''
  chosen.value = prompt.kind === 'add' ? props.playlists.find(playlist => !contains(playlist))?.id : undefined
  attempted.value = false
  if (!dialog.value?.open) dialog.value?.showModal()
  await nextTick()
  if (prompt.kind === 'delete') { cancelButton.value?.focus(); return }
  field.value?.focus()
  if (field.value instanceof HTMLInputElement) field.value.select()
}, { flush: 'post' })

function cancel() { if (!props.busy) emit('cancel') }
function submit() {
  if (props.busy) return
  if (deleting.value) { emit('delete'); return }
  if (addTrack.value) {
    if (chosen.value !== undefined && props.playlists.some(playlist => playlist.id === chosen.value && !contains(playlist)))
      emit('add', chosen.value)
    return
  }
  attempted.value = true
  if (!invalidName.value) emit('name', name.value)
}
</script>

<template>
  <dialog ref="dialog" class="rename-dialog playlist-dialog" aria-labelledby="playlist-dialog-title" :aria-describedby="deleting ? 'playlist-delete-description' : undefined" @cancel.prevent="cancel">
    <form v-if="prompt" @submit.prevent="submit">
      <h2 id="playlist-dialog-title">{{ title }}</h2>
      <p v-if="prompt.kind === 'delete'" id="playlist-delete-description">将删除「{{ prompt.playlist.name }}」及其歌曲关联。歌曲和音频文件仍保留在曲库。</p>
      <template v-else-if="addTrack">
        <p>把「{{ addTrack.title }}」加入歌单。</p>
        <label v-if="playlists.length" for="playlist-choice">选择歌单</label>
        <select v-if="playlists.length" id="playlist-choice" ref="field" v-model="chosen" :disabled="busy || !canAdd">
          <option v-if="!canAdd" :value="undefined">已加入所有歌单</option>
          <option v-for="playlist in playlists" :key="playlist.id" :value="playlist.id" :disabled="contains(playlist)">{{ playlist.name }}{{ contains(playlist) ? '（已加入）' : '' }}</option>
        </select>
        <p v-else>请先在侧栏新建歌单。</p>
      </template>
      <template v-else>
        <label for="playlist-name">歌单名称</label>
        <input id="playlist-name" ref="field" v-model="draft" type="text" autocomplete="off" :disabled="busy" :aria-invalid="attempted && invalidName" aria-describedby="playlist-feedback" />
      </template>
      <p id="playlist-feedback" class="rename-error error" :role="feedback ? 'alert' : undefined">{{ feedback }}</p>
      <div class="rename-dialog-actions">
        <button ref="cancelButton" class="rename-cancel" type="button" :disabled="busy" @click="cancel">取消</button>
        <button v-if="deleting" class="primary playlist-delete-confirm" type="submit" :disabled="busy">{{ busy ? '正在删除…' : '确认删除' }}</button>
        <button v-else class="primary rename-save" type="submit" :disabled="busy || (!!addTrack && (!canAdd || chosen === undefined))">{{ busy ? '正在保存…' : addTrack ? '加入' : '保存歌单' }}</button>
      </div>
    </form>
  </dialog>
</template>
