<script setup lang="ts">
import { useI18n } from '../i18n'

const { t } = useI18n()
defineProps<{ volume: number; muted: boolean }>()
defineEmits<{ volume: [value: number]; mute: [] }>()
</script>

<template>
  <div class="volume-controls">
    <button class="mute-toggle" type="button" :aria-label="muted || volume === 0 ? t('取消静音') : t('静音')" @click="$emit('mute')"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z" /><path v-if="muted || volume === 0" d="m16 9 6 6m0-6-6 6" /><path v-else d="M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg></button>
    <input class="volume-slider" type="range" min="0" max="1" step="0.01" :value="muted ? 0 : volume" :aria-label="t('音量')" :aria-valuetext="`${muted ? 0 : Math.round(volume * 100)}%`" :title="t('音量 {percent}%', { percent: muted ? 0 : Math.round(volume * 100) })" @input="$emit('volume', Number(($event.target as HTMLInputElement).value))" />
  </div>
</template>
