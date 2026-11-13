<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import type { Track } from '../api/tracks'

const props = defineProps<{ track: Track; busy?: boolean; inPlaylist?: boolean }>()
type Action = 'rename' | 'delete' | 'remove-from-playlist' | 'play-next'
const emit = defineEmits<(event: Action) => void>()
const expanded = ref(false)
const root = ref<HTMLDivElement>()
const trigger = ref<HTMLButtonElement>()
const menuId = `track-menu-${props.track.id}`
const items = () => Array.from(root.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])

function close(restoreFocus = false) {
  expanded.value = false
  if (restoreFocus) trigger.value?.focus()
}
async function open(last = false) {
  if (props.busy) return
  expanded.value = true
  await nextTick()
  if (expanded.value) items().at(last ? -1 : 0)?.focus()
}
function outside(event: PointerEvent) { if (event.target instanceof Node && !root.value?.contains(event.target)) close() }
watch(expanded, value => {
  if (value) document.addEventListener('pointerdown', outside)
  else document.removeEventListener('pointerdown', outside)
})
watch(() => props.busy, value => { if (value) close() })
onUnmounted(() => document.removeEventListener('pointerdown', outside))
function choose(action: Action) {
  if (props.busy) return
  close(true)
  emit(action)
}
function navigate(event: KeyboardEvent) {
  if (event.key === 'Escape' && expanded.value) { event.preventDefault(); event.stopPropagation(); close(true) }
  else if (event.key === 'Tab') close(true)
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || (expanded.value && ['Home', 'End'].includes(event.key))) {
    event.preventDefault()
    if (!expanded.value) void open(event.key === 'ArrowUp')
    else {
      const menuItems = items()
      if (event.key === 'Home') menuItems[0]?.focus()
      else if (event.key === 'End') menuItems.at(-1)?.focus()
      else {
        const selected = menuItems.findIndex(item => item === document.activeElement)
        const direction = event.key === 'ArrowDown' ? 1 : -1
        const index = selected < 0 ? (direction === 1 ? 0 : -1) : (selected + direction + menuItems.length) % menuItems.length
        menuItems.at(index)?.focus()
      }
    }
  }
}
</script>

<template>
  <div ref="root" class="track-actions" @keydown="navigate" @focusout="event => { if (!root?.contains(event.relatedTarget as Node)) close() }">
    <button :id="`${menuId}-trigger`" ref="trigger" class="track-more" :disabled="busy" :aria-label="`更多操作 ${track.title}`" title="更多操作" aria-haspopup="menu" :aria-expanded="expanded" :aria-controls="expanded ? menuId : undefined" @click="expanded ? close() : open()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
    </button>
    <div v-if="expanded" :id="menuId" class="track-menu" role="menu" :aria-labelledby="`${menuId}-trigger`">
      <button type="button" role="menuitem" data-action="rename" tabindex="-1" @click="choose('rename')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" /></svg>修改信息
      </button>
      <button type="button" role="menuitem" data-action="play-next" tabindex="-1" @click="choose('play-next')">下一首播放</button>
      <button v-if="inPlaylist" type="button" role="menuitem" data-action="remove-from-playlist" tabindex="-1" @click="choose('remove-from-playlist')">从此歌单移出</button>
      <button type="button" role="menuitem" data-action="delete" class="menu-delete" tabindex="-1" @click="choose('delete')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg>删除歌曲
      </button>
    </div>
  </div>
</template>
