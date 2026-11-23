<script setup lang="ts">
import { useI18n, type MessageValue } from '../i18n'
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Track } from '../api/tracks'
import TrackArtwork from './TrackArtwork.vue'
import PlayerControls from './PlayerControls.vue'
import FavoriteButton from './FavoriteButton.vue'
import VolumeControls from './VolumeControls.vue'

const { t, text } = useI18n()

const props = defineProps<{
  open: boolean; track?: Track; playing: boolean; buffering: boolean; time: number; duration: number
  canPrevious: boolean; canNext: boolean; volume: number; muted: boolean; favoriteBusy: boolean
  playerError: MessageValue; favoriteError: MessageValue; returnLabel: string
}>()
const emit = defineEmits<{
  close: []; toggle: []; previous: []; next: []; seek: [value: number]
  favorite: []; volume: [value: number]; mute: []; retry: []
}>()
const dialog = ref<HTMLDialogElement>()
const rendered = ref(false)
let returnFocus: HTMLElement | undefined
let scrollPosition: { x: number; y: number; overflow: string } | undefined

function restorePage() {
  if (!scrollPosition) return
  document.documentElement.style.overflow = scrollPosition.overflow
  if (window.scrollX !== scrollPosition.x || window.scrollY !== scrollPosition.y) {
    window.scrollTo(scrollPosition.x, scrollPosition.y)
  }
  scrollPosition = undefined
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
  returnFocus = undefined
}

function finishClose() {
  if (props.open) return
  if (dialog.value?.open) dialog.value.close()
  rendered.value = false
  restorePage()
}

watch(() => props.open, async open => {
  if (!open || !props.track) return
  rendered.value = true
  await nextTick()
  if (!props.open || !dialog.value || dialog.value.open) return
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  scrollPosition = { x: window.scrollX, y: window.scrollY, overflow: document.documentElement.style.overflow }
  document.documentElement.style.overflow = 'hidden'
  dialog.value.showModal()
}, { flush: 'post' })

onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
  restorePage()
})
</script>

<template>
  <Transition name="now-playing-view" @after-leave="finishClose">
    <dialog v-show="open" id="now-playing-view" ref="dialog" class="now-playing-view" aria-labelledby="now-playing-heading"
      @cancel.prevent="emit('close')" @close="() => { if (open) emit('close') }">
      <template v-if="rendered && track">
        <header class="now-playing-topbar">
          <button type="button" class="now-playing-back" autofocus @click="emit('close')">{{ returnLabel }}</button>
          <h2 id="now-playing-heading">{{ t('正在播放') }}</h2>
        </header>
        <div class="now-playing-stage">
          <TrackArtwork class="now-playing-artwork" :url="track.coverUrl" />
          <div class="now-playing-information">
            <h3 class="now-playing-track-title">{{ track.title }}</h3>
            <p class="now-playing-track-artist">{{ track.artist || t('未知歌手') }}</p>
          </div>
          <PlayerControls progress-first :track-id="track.id" :playing="playing" :time="time" :duration="duration" :can-previous="canPrevious" :can-next="canNext"
            @toggle="emit('toggle')" @previous="emit('previous')" @next="emit('next')" @seek="emit('seek', $event)">
            <template #before-transport><FavoriteButton :title="track.title" :favorite="track.favorite" :busy="favoriteBusy" @toggle="emit('favorite')" /></template>
            <template #after-transport><VolumeControls :volume="volume" :muted="muted" @volume="emit('volume', $event)" @mute="emit('mute')" /></template>
          </PlayerControls>
          <p class="now-playing-status" :class="{ 'visually-hidden': !buffering }" role="status">{{ buffering ? t('正在加载…') : playing ? t('正在播放') : t('已暂停') }}</p>
          <p v-if="playerError" class="now-playing-error" role="alert">{{ text(playerError) }} <button type="button" @click="emit('retry')">{{ t('重试播放') }}</button></p>
          <p v-if="favoriteError" class="now-playing-error" role="alert">{{ text(favoriteError) }}</p>
        </div>
      </template>
    </dialog>
  </Transition>
</template>
