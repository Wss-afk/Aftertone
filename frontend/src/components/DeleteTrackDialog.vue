<script setup lang="ts">
import { useI18n, type MessageValue } from '../i18n'
import { ref, watch } from 'vue'
import type { Track } from '../api/tracks'

const { t, text } = useI18n()

const props = defineProps<{ track?: Track; busy: boolean; error: MessageValue; isCurrent: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = ref<HTMLDialogElement>()

watch(() => props.track, track => {
  if (track && !dialog.value?.open) dialog.value?.showModal()
  else if (!track && dialog.value?.open) dialog.value.close()
}, { flush: 'post' })

function cancel() { if (!props.busy) emit('cancel') }
</script>

<template>
  <dialog ref="dialog" class="delete-dialog" aria-labelledby="delete-title" aria-describedby="delete-description" @cancel.prevent="cancel">
    <template v-if="track">
      <div class="delete-dialog-icon" aria-hidden="true">⌫</div>
      <h2 id="delete-title">{{ t('删除这首歌？') }}</h2>
      <p class="delete-track-title">{{ track.title }}</p>
      <p id="delete-description">{{ t('歌曲会从曲库移除，并删除播放器保存的音频文件。电脑上的原始文件会保留。') }}</p>
      <p v-if="isCurrent" class="delete-current-note">{{ t('这首歌正在播放，删除后会停止播放。') }}</p>
      <p v-if="error" class="delete-error error" role="alert">{{ text(error) }}</p>
      <div class="delete-dialog-actions">
        <button class="dialog-cancel" autofocus :disabled="busy" @click="cancel">{{ t('取消') }}</button>
        <button class="dialog-confirm" :disabled="busy" @click="emit('confirm')">{{ busy ? t('正在删除…') : t('确认删除') }}</button>
      </div>
    </template>
  </dialog>
</template>
