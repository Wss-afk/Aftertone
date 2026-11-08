<script setup lang="ts">
import type { Track } from '../api/tracks'
import TrackActions from './TrackActions.vue'
import TrackArtwork from './TrackArtwork.vue'
import { formatDuration } from '../utils/duration'
import FavoriteButton from './FavoriteButton.vue'
defineProps<{ tracks: Track[]; currentId?: number; playing: boolean; deleting?: boolean; favoriting?: Set<number>; label?: string; inPlaylist?: boolean }>()
defineEmits<{ select: [track: Track]; delete: [track: Track]; rename: [track: Track]; favorite: [track: Track]; removeFromPlaylist: [track: Track] }>()
</script>

<template>
  <ol class="track-list" :aria-label="label ?? '最近上传的歌曲'">
    <li v-for="(track, index) in tracks" :key="track.id" :class="{ current: currentId === track.id }">
      <button class="track-button" @click="$emit('select', track)" :aria-label="`播放 ${track.title}`" :aria-current="currentId === track.id ? 'true' : undefined">
        <span class="track-number">{{ currentId === track.id && playing ? '♫' : String(index + 1).padStart(2, '0') }}</span>
        <TrackArtwork class="track-art" :url="track.coverUrl" />
        <span class="track-name"><strong>{{ track.title }}</strong><small>{{ track.artist || '未知歌手' }}</small></span>
        <span class="track-album" :title="track.album || '未知专辑'" :aria-label="`专辑：${track.album || '未知专辑'}`">{{ track.album || '未知专辑' }}</span>
        <span class="track-duration" :aria-label="`时长：${formatDuration(track.durationSeconds)}`">{{ formatDuration(track.durationSeconds) }}</span>
        <span class="track-play" aria-hidden="true">▶</span>
      </button>
      <FavoriteButton :title="track.title" :favorite="track.favorite" :busy="deleting || favoriting?.has(track.id)" @toggle="$emit('favorite', track)" />
      <TrackActions :track="track" :busy="deleting || favoriting?.has(track.id)" :in-playlist="inPlaylist"
        @rename="$emit('rename', track)" @delete="$emit('delete', track)" @remove-from-playlist="$emit('removeFromPlaylist', track)" />
    </li>
  </ol>
</template>
