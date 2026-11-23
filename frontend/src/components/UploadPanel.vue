<script setup lang="ts">
import { useI18n, fromError, type MessageValue } from '../i18n'
import { computed, ref } from 'vue'
import { uploadTrack, type Track } from '../api/tracks'

const { t, text } = useI18n()

const props = defineProps<{ blocked?: boolean }>()
const emit = defineEmits<{ uploaded: [track: Track]; storageChange: [] }>()
const MAX_BYTES = 25 * 1024 * 1024
type UploadState = 'queued' | 'processing' | 'done' | 'duplicate' | 'failed'
interface UploadItem {
  id: number
  name: string
  file?: File
  state: UploadState
  message?: MessageValue
}

const items = ref<UploadItem[]>([])
const uploading = ref(false)
const dragging = ref(false)
let nextId = 0
const queued = computed(() => items.value.filter(item => item.state === 'queued'))
const labels = { queued: '等待导入', processing: '上传并处理…', done: '已加入曲库', duplicate: '重复，已跳过', failed: '导入失败' } as const
const counts = computed(() => {
  const result = { queued: 0, processing: 0, done: 0, duplicate: 0, failed: 0 }
  for (const item of items.value) result[item.state]++
  return result
})

function enqueue(files: FileList | null | undefined) {
  if (!files || uploading.value) return
  for (const file of Array.from(files)) {
    const message = file.size === 0 ? '不能上传空文件。' : file.size > MAX_BYTES ? '每首音频最大为 25 MB。' : undefined
    items.value.push({ id: ++nextId, name: file.name, file: message ? undefined : file, state: message ? 'failed' : 'queued', message })
  }
}

function choose(event: Event) {
  const input = event.target as HTMLInputElement
  enqueue(input.files)
  input.value = ''
}

function dragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes('Files')) return
  dragging.value = !uploading.value
  event.dataTransfer.dropEffect = dragging.value ? 'copy' : 'none'
}

function dragLeave(event: DragEvent) {
  if (event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget)) return
  dragging.value = false
}

function drop(event: DragEvent) {
  dragging.value = false
  enqueue(event.dataTransfer?.files)
}

function clearResults() {
  items.value = items.value.filter(item => item.state !== 'done' && item.state !== 'duplicate')
}

async function importFiles(batch: UploadItem[]) {
  if (!batch.length || uploading.value || props.blocked) return
  uploading.value = true
  dragging.value = false
  let lastTrack: Track | undefined
  try {
    for (const item of batch) {
      if (props.blocked) break
      if (!item.file) continue
      item.state = 'processing'
      item.message = undefined
      try {
        lastTrack = await uploadTrack(item.file)
        item.state = 'done'
        item.file = undefined
      } catch (cause) {
        const code = cause instanceof Error && 'code' in cause ? cause.code : undefined
        const status = cause instanceof Error && 'status' in cause ? cause.status : undefined
        item.message = fromError(cause, '上传失败，请重试。')
        item.state = code === 'DUPLICATE_TRACK' ? 'duplicate' : 'failed'
        if (item.state === 'duplicate') item.file = undefined
        if (status === 507 || code === 'INSUFFICIENT_STORAGE' || code === 'STORAGE_UNAVAILABLE') break
      }
    }
  } finally {
    uploading.value = false
    if (lastTrack) emit('uploaded', lastTrack)
    emit('storageChange')
  }
}
</script>

<template>
  <form class="upload-panel" :class="{ 'upload-dragging': dragging }" :aria-label="t('音频导入')" @submit.prevent="importFiles(queued)"
    @dragover.prevent="dragOver" @dragleave="dragLeave" @drop.prevent="drop" :aria-busy="uploading">
    <div class="upload-toolbar">
      <p id="upload-help" class="upload-help">{{ t('多选或拖入音频 · 每首最大 25 MB') }}</p>
      <div class="upload-actions">
        <label class="file-picker" :class="{ disabled: uploading }">
          {{ t('选择音频') }}
          <input type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.wma,.aif,.aiff,.webm,.weba,.mp4"
            multiple :disabled="uploading" @change="choose" :aria-label="t('选择音频文件')" aria-describedby="upload-help" />
        </label>
        <button class="primary" type="submit" :disabled="!queued.length || uploading || blocked">{{ uploading ? t('正在处理…') : t('上传歌曲') }}</button>
      </div>
    </div>
    <p v-if="blocked" class="upload-warning" role="status">{{ t('磁盘空间不足，上传已暂停。可在列表下方刷新存储空间。') }}</p>
    <div v-if="items.length" class="upload-queue">
      <div class="upload-queue-header">
        <p role="status">{{ t('等待 {queued} · 处理中 {processing} · 成功 {done} · 重复 {duplicate} · 失败 {failed}', counts) }}</p>
        <button v-if="counts.done || counts.duplicate" class="text-button" type="button" :disabled="uploading" @click="clearResults">{{ t('清除已处理项') }}</button>
      </div>
      <ul class="upload-queue-list" :aria-label="t('音频导入队列')">
        <li v-for="item in items" :key="item.id" :data-state="item.state">
          <div class="upload-file-info">
            <strong :title="item.name">{{ item.name }}</strong>
            <small v-if="item.message" :class="{ error: item.state === 'failed' }">{{ text(item.message) }}</small>
          </div>
          <div class="upload-row-actions">
            <span :class="{ success: item.state === 'done', error: item.state === 'failed' }">{{ t(labels[item.state]) }}</span>
            <button v-if="item.state === 'failed' && item.file" class="text-button" type="button" :aria-label="t('重试 {name}', { name: item.name })"
              :disabled="uploading || blocked" @click="importFiles([item])">{{ t('重试') }}</button>
            <button v-if="item.state === 'queued' || item.state === 'failed'" class="text-button" type="button" :aria-label="t('移除 {name}', { name: item.name })"
              :disabled="uploading" @click="items = items.filter(entry => entry.id !== item.id)">{{ t('移除') }}</button>
          </div>
        </li>
      </ul>
    </div>
  </form>
</template>

<style scoped>
.upload-dragging { border-color: var(--accent); background: var(--active-bg); }
.upload-queue { flex: 0 0 100%; min-width: 0; }
.upload-queue-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 12px; }
.upload-queue-list { max-height: 270px; overflow-y: auto; list-style: none; margin: 8px 0 0; padding: 0; }
.upload-queue-list li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 12px; padding: 9px 0; border-top: 1px solid var(--line); font-size: 12px; }
.upload-file-info { flex: 1 1 160px; min-width: 0; }
.upload-file-info strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.upload-file-info small { display: block; margin-top: 4px; overflow-wrap: anywhere; }
.upload-row-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: var(--muted); }
.upload-row-actions button, .upload-queue-header button { color: var(--accent); padding: 3px 4px; }
</style>
