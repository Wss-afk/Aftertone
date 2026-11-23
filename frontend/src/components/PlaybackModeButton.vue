<script setup lang="ts">
import { useI18n } from '../i18n'
import { computed } from 'vue'
import type { PlaybackMode } from '../composables/usePlaybackQueue'

const { t } = useI18n()

const props = defineProps<{ mode: PlaybackMode }>()
const emit = defineEmits<{ 'update:mode': [mode: PlaybackMode] }>()
const labels = { sequential: '顺序播放', 'repeat-one': '单曲循环', shuffle: '随机播放' } as const
const next = computed<PlaybackMode>(() => props.mode === 'sequential' ? 'repeat-one' : props.mode === 'repeat-one' ? 'shuffle' : 'sequential')
const description = computed(() => t('{mode}，点击切换为{next}', { mode: t(labels[props.mode]), next: t(labels[next.value]) }))
</script>

<template>
  <button id="playback-mode" class="mode-toggle" type="button" :data-mode="mode" :aria-label="t('播放模式：{description}', { description })" :title="description" @click="emit('update:mode', next)">
    <svg v-if="mode === 'sequential'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16M4 11h8M4 17h8m5-4 4 4-4 4m-3-4h7" /></svg>
    <svg v-else-if="mode === 'repeat-one'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3" /><path d="m10.5 10 1.5-1v6m-1.5 0h3" /></svg>
    <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h3c4 0 8 12 12 12h3m-4-4 4 4-4 4M3 18h3c4 0 8-12 12-12h3m-4-4 4 4-4 4" /></svg>
  </button>
  <span class="visually-hidden" role="status">{{ t(labels[mode]) }}</span>
</template>
