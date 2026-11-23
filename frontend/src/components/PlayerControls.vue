<script setup lang="ts">
import { useI18n } from '../i18n'
import SeekControl from './SeekControl.vue'

const { t } = useI18n()

defineProps<{ trackId?: number; playing: boolean; time: number; duration: number; canPrevious: boolean; canNext: boolean; progressFirst?: boolean }>()
const emit = defineEmits<{ toggle: []; previous: []; next: []; seek: [time: number] }>()
</script>

<template>
  <div class="player-controls" :aria-label="t('播放控制')">
    <SeekControl v-if="progressFirst" :track-id="trackId" :time="time" :duration="duration" @seek="emit('seek', $event)" />
    <div class="transport-controls">
      <slot name="before-transport" />
      <button class="skip" type="button" :disabled="!canPrevious" :aria-label="t('上一首')" @click="emit('previous')"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5h2v14H5zm14 0v14L8 12z" /></svg></button>
      <button class="play-toggle" type="button" :disabled="trackId === undefined" :aria-label="playing ? t('暂停') : t('播放')" :title="t('空格：播放 / 暂停')" @click="emit('toggle')">
        <svg v-if="playing" width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 4 13 8-13 8z" /></svg>
      </button>
      <button class="skip" type="button" :disabled="!canNext" :aria-label="t('下一首')" @click="emit('next')"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 5h2v14h-2zM5 5l11 7-11 7z" /></svg></button>
      <slot name="after-transport" />
    </div>
    <SeekControl v-if="!progressFirst" :track-id="trackId" :time="time" :duration="duration" @seek="emit('seek', $event)" />
  </div>
</template>
