<script setup lang="ts">
import { useI18n } from '../i18n'
import { computed, ref, watch } from 'vue'
import { formatDuration as formatTime } from '../utils/duration'

const { t } = useI18n()

const props = defineProps<{ trackId?: number; time: number; duration: number }>()
const emit = defineEmits<{ seek: [time: number] }>()
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
  <div class="seek-row">
    <span class="time-elapsed">{{ formatTime(displayTime) }}</span>
    <input class="seek-slider" type="range" min="0" :max="ready ? duration : 1" step="0.1" :value="ready ? displayTime : 0" :disabled="!ready" :style="{ '--seek-fill': `${progress}%` }" :aria-label="t('播放进度')" :aria-valuetext="`${formatTime(displayTime)} / ${formatTime(duration)}`" @input="preview" @change="commit" @pointercancel="dragging = false; seekTrack = undefined" />
    <span class="time-total">{{ formatTime(duration) }}</span>
  </div>
</template>
