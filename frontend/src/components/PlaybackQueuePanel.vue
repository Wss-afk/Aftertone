<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Track } from '../api/tracks'
import type { PlaybackMode } from '../composables/usePlaybackQueue'
import TrackArtwork from './TrackArtwork.vue'

const props = defineProps<{ open: boolean; current?: Track; queued: Track[]; upcoming: Track[]; sourceTitle: string; mode: PlaybackMode }>()
const emit = defineEmits<{ close: []; move: [id: number, direction: -1 | 1, queued: boolean]; remove: [id: number] }>()
const dialog = ref<HTMLDialogElement>()
const groups = computed(() => [
  { title: '手动下一首', tracks: props.queued, queued: true },
  { title: `接下来 · ${props.sourceTitle}`, tracks: props.upcoming, queued: false },
])
const status = ref('')

watch(() => props.open, open => {
  if (open && !dialog.value?.open) dialog.value?.showModal()
  else if (!open && dialog.value?.open) dialog.value.close()
  status.value = ''
}, { flush: 'post' })

async function move(track: Track, direction: -1 | 1, queued: boolean) {
  emit('move', track.id, direction, queued)
  status.value = `已${direction < 0 ? '上移' : '下移'}「${track.title}」。`
  await nextTick()
  dialog.value?.querySelector<HTMLElement>(`[data-queue-row="${queued ? 'manual' : 'source'}-${track.id}"]`)?.focus()
}

async function remove(track: Track) {
  emit('remove', track.id)
  status.value = `已从队列移出「${track.title}」。`
  await nextTick()
  dialog.value?.querySelector<HTMLButtonElement>('.queue-close')?.focus()
}
</script>

<template>
  <dialog id="playback-queue" ref="dialog" class="queue-panel" aria-labelledby="queue-title" aria-describedby="queue-description" @cancel.prevent="emit('close')" @close="emit('close')" @click="event => { if (event.target === dialog) emit('close') }">
    <div class="queue-panel-content">
      <header class="queue-panel-header">
        <h2 id="queue-title">播放队列</h2>
        <button type="button" class="queue-close" aria-label="关闭播放队列" autofocus @click="emit('close')">×</button>
      </header>
      <p id="queue-description" class="queue-description">手动下一首优先，播完后继续原列表。重新点歌会建立新队列，刷新页面后恢复曲库队列。</p>
      <section v-if="current" class="queue-current" aria-label="当前歌曲">
        <TrackArtwork :url="current.coverUrl" class="queue-art" />
        <div class="queue-track-copy"><small>当前歌曲</small><strong>{{ current.title }}</strong><span>{{ current.artist || '未知歌手' }}</span></div>
      </section>
      <p v-else class="queue-empty">从曲库选择一首歌，开始安排接下来的音乐。</p>
      <template v-if="current">
        <p v-if="mode === 'repeat-one'" class="queue-mode-note">单曲循环时，手动下一首播完后循环当前歌曲。下方原列表可用「下一首」手动切换。</p>
        <p v-else-if="mode === 'shuffle'" class="queue-mode-note">随机顺序已排好，播完这一轮会生成新顺序。</p>
        <section v-for="group in groups" :key="group.title" :class="group.queued ? 'queue-manual' : 'queue-source'">
          <h3>{{ group.title }} <span>{{ group.tracks.length }}</span></h3>
          <p v-if="!group.tracks.length" class="queue-empty">{{ group.queued ? '在歌曲的「…」菜单里选择「下一首播放」。' : '已到当前列表末尾。' }}</p>
          <ol v-else :aria-label="group.title">
            <li v-for="(track, index) in group.tracks" :key="track.id" :data-queue-row="`${group.queued ? 'manual' : 'source'}-${track.id}`" tabindex="-1">
              <div class="queue-track-copy"><strong :title="track.title">{{ track.title }}</strong><span>{{ track.artist || '未知歌手' }}</span></div>
              <div class="queue-row-actions">
                <button type="button" :disabled="index === 0" :aria-label="`上移 ${track.title}`" title="上移" @click="move(track, -1, group.queued)">↑</button>
                <button type="button" :disabled="index === group.tracks.length - 1" :aria-label="`下移 ${track.title}`" title="下移" @click="move(track, 1, group.queued)">↓</button>
                <button v-if="group.queued" type="button" :aria-label="`移出队列 ${track.title}`" title="移出队列" @click="remove(track)">×</button>
              </div>
            </li>
          </ol>
        </section>
      </template>
      <p class="visually-hidden" role="status">{{ status }}</p>
    </div>
  </dialog>
</template>

<style scoped>
.queue-panel { position: fixed; inset: 0 0 0 auto; box-sizing: border-box; width: min(430px, 100vw); height: 100dvh; max-height: 100dvh; max-width: 100vw; margin: 0; padding: 0; border: 1px solid #3b4b41; background: #1e2a22; color: #e0e9e2; box-shadow: -16px 0 56px #0005; }
.queue-panel::backdrop { background: #080f0a80; }
.queue-panel-content { padding: 26px; }
.queue-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
h2 { margin: 0; font-size: 22px; }
.queue-close { font-size: 26px; }
.queue-description, .queue-mode-note, .queue-empty { font-size: 12px; line-height: 1.8; color: #a4b6a9; }
.queue-current { display: flex; align-items: center; gap: 14px; padding: 18px 0; border-bottom: 1px solid #3b4b41; }
.queue-art { width: 54px; height: 54px; flex-shrink: 0; }
.queue-track-copy { display: grid; gap: 4px; min-width: 0; }
.queue-track-copy strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.queue-track-copy span, .queue-track-copy small { color: #a4b6a9; font-size: 12px; }
h3 { margin: 24px 0 12px; font-size: 14px; }
h3 span { color: #a4b6a9; font-variant-numeric: tabular-nums; margin-left: 8px; }
ol { list-style: none; margin: 0; padding: 0; }
li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #334139; }
.queue-row-actions { display: flex; gap: 4px; flex-shrink: 0; }
button { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 6px; color: #c5d4ca; }
button:hover:not(:disabled) { background: #34483b; color: var(--mint); }
button:disabled { opacity: .25; }
button:focus-visible { outline: 2px solid var(--mint); outline-offset: 2px; }
li:focus-visible { outline: 2px solid var(--mint); outline-offset: 3px; border-radius: 4px; }
</style>
