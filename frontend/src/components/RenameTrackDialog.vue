<script setup lang="ts">
import { useI18n, type MessageValue } from '../i18n'
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { Track } from '../api/tracks'
import TrackArtwork from './TrackArtwork.vue'

const { t, text } = useI18n()

const props = defineProps<{ track?: Track; busy: boolean; error: MessageValue }>()
const emit = defineEmits<{ save: [title: string, artist: string, album: string, cover?: File, removeCover?: boolean]; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()
const input = ref<HTMLInputElement>()
const draft = ref('')
const artist = ref('')
const album = ref('')
const cover = ref<File>()
const removeCover = ref(false)
const coverError = ref('')
const previewUrl = ref('')
const coverPreview = computed(() => removeCover.value ? null : previewUrl.value || props.track?.coverUrl)
const normalizedAlbum = computed(() => album.value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, ''))
const albumLength = computed(() => Array.from(normalizedAlbum.value).length)
const albumValidation = computed(() => albumLength.value > 255 ? '专辑最多 255 个字符。' : /\p{Cc}/u.test(normalizedAlbum.value) ? '专辑不能包含换行或控制字符。' : '')
const attempted = ref(false)
const normalized = computed(() => draft.value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, ''))
const length = computed(() => Array.from(normalized.value).length)
const validation = computed(() => !length.value ? '请输入歌名。' : length.value > 255 ? '歌名最多 255 个字符。' : /\p{Cc}/u.test(normalized.value) ? '歌名不能包含换行或控制字符。' : '')
const normalizedArtist = computed(() => artist.value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, ''))
const artistLength = computed(() => Array.from(normalizedArtist.value).length)
const artistValidation = computed(() => artistLength.value > 255 ? '歌手最多 255 个字符。' : /\p{Cc}/u.test(normalizedArtist.value) ? '歌手不能包含换行或控制字符。' : '')

watch(() => props.track, async track => {
  releasePreview()
  cover.value = undefined
  removeCover.value = false
  coverError.value = ''
  if (track) {
    draft.value = track.title
    artist.value = track.artist ?? ''
    album.value = track.album ?? ''
    attempted.value = false
    if (!dialog.value?.open) dialog.value?.showModal()
    await nextTick()
    if (props.track?.id === track.id && dialog.value?.open) {
      input.value?.focus()
      input.value?.select()
    }
  } else if (dialog.value?.open) dialog.value.close()
}, { flush: 'post' })

function releasePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}
onUnmounted(releasePreview)
function chooseCover(event: Event) {
  const picker = event.target as HTMLInputElement
  const file = picker.files?.[0]
  picker.value = ''
  if (!file || props.busy) return
  coverError.value = ''
  if (file.size > 5 * 1024 * 1024) { coverError.value = '封面最大为 5 MB。'; return }
  if (!['image/jpeg', 'image/png'].includes(file.type)) { coverError.value = '请选择 JPG 或 PNG 图片。'; return }
  releasePreview()
  cover.value = file
  removeCover.value = false
  previewUrl.value = URL.createObjectURL(file)
}
function clearCover() {
  releasePreview()
  cover.value = undefined
  removeCover.value = true
  coverError.value = ''
}
function resetCover() {
  releasePreview()
  cover.value = undefined
  removeCover.value = false
  coverError.value = ''
}

function cancel() { if (!props.busy) emit('cancel') }
function submit() {
  if (props.busy) return
  attempted.value = true
  if (!validation.value && !artistValidation.value && !albumValidation.value && !coverError.value)
    emit('save', normalized.value, normalizedArtist.value, normalizedAlbum.value, cover.value, removeCover.value)
}
</script>

<template>
  <dialog ref="dialog" class="rename-dialog" aria-labelledby="rename-title" aria-describedby="rename-description" @cancel.prevent="cancel">
    <form v-if="track" @submit.prevent="submit">
      <h2 id="rename-title">{{ t('修改歌曲信息') }}</h2>
      <p id="rename-description">{{ t('补充歌曲信息与封面，保存不会打断播放。') }}</p>
      <div class="cover-editor">
        <TrackArtwork class="cover-preview" :url="coverPreview" />
        <div><div class="cover-buttons">
          <label class="cover-picker">{{ coverPreview ? t('更换封面') : t('选择封面') }}<input type="file" accept="image/jpeg,image/png" :aria-label="t('选择歌曲封面')" :disabled="busy" @change="chooseCover" /></label>
          <button v-if="coverPreview" class="cover-remove" type="button" :disabled="busy" @click="clearCover">{{ t('移除封面') }}</button>
          <button v-if="cover || removeCover || coverError" class="cover-reset" type="button" :disabled="busy" @click="resetCover">{{ t('撤销封面修改') }}</button>
        </div><p class="cover-help">{{ t('JPG / PNG · 最大 5 MB') }}<br />{{ t('没有封面时使用默认图标') }}</p><p v-if="coverError" class="cover-error error" role="alert">{{ text(coverError) }}</p></div>
      </div>
      <label for="rename-input">{{ t('歌名') }}</label>
      <input id="rename-input" ref="input" v-model="draft" type="text" autocomplete="off" autofocus :disabled="busy" :aria-invalid="attempted && !!validation" aria-describedby="rename-count rename-feedback" />
      <p id="rename-count" class="rename-count">{{ length }} / 255</p>
      <label for="artist-input" class="artist-label">{{ t('歌手') }}</label>
      <input id="artist-input" v-model="artist" type="text" autocomplete="off" :placeholder="t('填写歌手名字')" :disabled="busy" :aria-invalid="attempted && !!artistValidation" aria-describedby="artist-help rename-feedback" />
      <p id="artist-help" class="artist-help">{{ artistLength }} / 255 · {{ t('留空时显示“未知歌手”') }}</p>
      <label for="album-input" class="album-label">{{ t('专辑') }}</label>
      <input id="album-input" v-model="album" type="text" autocomplete="off" :placeholder="t('填写专辑名称')" :disabled="busy" :aria-invalid="attempted && !!albumValidation" aria-describedby="album-help rename-feedback" />
      <p id="album-help" class="album-help">{{ albumLength }} / 255 · {{ t('留空时显示“未知专辑”') }}</p>
      <p id="rename-feedback" class="rename-error error" :role="(attempted && (validation || artistValidation || albumValidation)) || error ? 'alert' : undefined">{{ text((attempted && (validation || artistValidation || albumValidation)) || error) }}</p>
      <div class="rename-dialog-actions">
        <button class="rename-cancel" type="button" :disabled="busy" @click="cancel">{{ t('取消') }}</button>
        <button class="primary rename-save" type="submit" :disabled="busy">{{ busy ? t('正在保存…') : t('保存修改') }}</button>
      </div>
    </form>
  </dialog>
</template>
