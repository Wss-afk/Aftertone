<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { formatDuration as formatTime } from '../utils/duration'

const props = defineProps<{ trackId?: number; playing: boolean; time: number; duration: number; canPrevious: boolean; canNext: boolean }>()
const emit = defineEmits<{ toggle: []; previous: []; next: []; seek: [time: number] }>()
const dragging = ref(false)
const draft = ref(0)
let seekTrack: number | undefined
const ready = computed(() => props.trackId !== undefined && Number.isFinite(props.duration) && props.duration > 0)
const displayTime = computed(() => dragging.value ? draft.value : props.time)
const progress = computed(() => ready.value ? Math.max(0, Math.min(100, displayTime.value / props.duration * 100)) : 0)

function preview(event: Event) {
  if (!ready.value) return
  dragging.value = true
  seekTrack = props.trackId
  draft.value = Math.max(0, Math.min(props.duration, Number((event.target as HTMLInputElement).value)))
}
function commit() {
  if (ready.value && seekTrack === props.trackId) emit('seek', draft.value)
  dragging.value = false
  seekTrack = undefined
}
watch(() => props.trackId, () => { dragging.value = false; seekTrack = undefined })
</script>

<template>
  <div class="player-controls" aria-label="播放控制">
    <div class="transport-controls">
      <button class="skip" type="button" :disabled="!canPrevious" aria-label="上一首" @click="emit('previous')"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5h2v14H5zm14 0v14L8 12z" /></svg></button>
      <button class="play-toggle" type="button" :disabled="trackId === undefined" :aria-label="playing ? '暂停' : '播放'" title="空格：播放 / 暂停" @click="emit('toggle')">
        <svg v-if="playing" width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 4 13 8-13 8z" /></svg>
      </button>
      <button class="skip" type="button" :disabled="!canNext" aria-label="下一首" @click="emit('next')"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 5h2v14h-2zM5 5l11 7-11 7z" /></svg></button>
    </div>
    <div class="seek-row">
      <span class="time-elapsed">{{ formatTime(displayTime) }}</span>
      <input class="seek-slider" type="range" min="0" :max="ready ? duration : 1" step="0.1" :value="ready ? displayTime : 0" :disabled="!ready" :style="{ '--seek-fill': `${progress}%` }" aria-label="播放进度" :aria-valuetext="`${formatTime(displayTime)} / ${formatTime(duration)}`" @input="preview" @change="commit" @pointercancel="dragging = false; seekTrack = undefined" />
      <span class="time-total">{{ formatTime(duration) }}</span>
    </div>
  </div>
</template>
