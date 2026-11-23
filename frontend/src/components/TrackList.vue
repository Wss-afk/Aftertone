<script setup lang="ts">
import { useI18n } from '../i18n'
import type { Track } from '../api/tracks'
import TrackActions from './TrackActions.vue'
import TrackArtwork from './TrackArtwork.vue'
import { formatDuration } from '../utils/duration'
import FavoriteButton from './FavoriteButton.vue'

const { t } = useI18n()
defineProps<{ tracks: Track[]; currentId?: number; playing: boolean; deleting?: boolean; favoriting?: Set<number>; label?: string; inPlaylist?: boolean }>()
defineEmits<{ select: [track: Track]; delete: [track: Track]; rename: [track: Track]; favorite: [track: Track]; removeFromPlaylist: [track: Track]; playNext: [track: Track] }>()
</script>

<template>
  <div class="track-table">
    <div class="track-table-header" aria-hidden="true">
      <div class="track-header-main">
        <span>#</span><span class="track-column-title">{{ t('歌曲') }}</span><span class="track-column-album">{{ t('专辑') }}</span><span class="track-column-duration">{{ t('时长') }}</span>
      </div>
    </div>
    <ol class="track-list" :aria-label="label ?? t('最近上传的歌曲')">
      <li v-for="(track, index) in tracks" :key="track.id" :class="{ current: currentId === track.id }">
        <button class="track-button" @click="$emit('select', track)" :aria-label="t('播放 {title}', { title: track.title })" :aria-current="currentId === track.id ? 'true' : undefined">
          <span class="track-number">{{ currentId === track.id && playing ? '♫' : String(index + 1).padStart(2, '0') }}</span>
          <TrackArtwork class="track-art" :url="track.coverUrl" />
          <span class="track-name"><strong>{{ track.title }}</strong><small>{{ track.artist || t('未知歌手') }}</small></span>
          <span class="track-album" :title="track.album || t('未知专辑')" :aria-label="t('专辑：{album}', { album: track.album || t('未知专辑') })">{{ track.album || t('未知专辑') }}</span>
          <span class="track-duration" :aria-label="t('时长：{duration}', { duration: formatDuration(track.durationSeconds) })">{{ formatDuration(track.durationSeconds) }}</span>
          <span class="track-play" aria-hidden="true">▶</span>
        </button>
        <FavoriteButton :title="track.title" :favorite="track.favorite" :busy="deleting || favoriting?.has(track.id)" @toggle="$emit('favorite', track)" />
        <TrackActions :track="track" :busy="deleting || favoriting?.has(track.id)" :in-playlist="inPlaylist"
          @rename="$emit('rename', track)" @delete="$emit('delete', track)" @remove-from-playlist="$emit('removeFromPlaylist', track)" @play-next="$emit('playNext', track)" />
      </li>
    </ol>
  </div>
</template>
