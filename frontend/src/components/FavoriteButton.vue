<script setup lang="ts">
import { useI18n } from '../i18n'

const { t } = useI18n()
defineProps<{ title: string; favorite: boolean; busy?: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <button class="favorite-button" :class="{ 'is-favorite': favorite }" type="button" :disabled="busy"
    :aria-label="t(favorite ? '取消收藏 {title}' : '收藏 {title}', { title })" :aria-pressed="favorite" :aria-busy="busy || undefined"
    :title="busy ? t('正在保存收藏…') : favorite ? t('取消收藏') : t('收藏歌曲')" @click="$emit('toggle')">
    <svg width="19" height="19" viewBox="0 0 24 24" :fill="favorite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M20.7 4.9a5.3 5.3 0 0 0-7.5 0L12 6.1l-1.2-1.2a5.3 5.3 0 0 0-7.5 7.5L12 21l8.7-8.6a5.3 5.3 0 0 0 0-7.5Z" /></svg>
  </button>
</template>
