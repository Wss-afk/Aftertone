<script setup lang="ts">
import { useI18n, type MessageValue } from '../i18n'
import { computed } from 'vue'
import type { StorageStatus } from '../api/storage'

const { t, text, locale } = useI18n()

const props = defineProps<{ capacity?: StorageStatus; loading: boolean; error: MessageValue }>()
defineEmits<{ refresh: [] }>()
const volumeLabel = computed(() => {
  const drive = props.capacity?.volumeRoot.match(/^([a-z]):/i)?.[1]
  return drive ? t('{drive} 盘可用', { drive: drive.toUpperCase() }) : t('磁盘可用')
})

function bytes(value: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`
}
</script>

<template>
  <section class="storage-panel" :aria-label="t('曲库容量')" :aria-busy="loading">
    <div class="storage-heading"><h2>{{ t('存储空间') }}</h2><button class="text-button" :disabled="loading" :aria-label="t('刷新容量')" @click="$emit('refresh')">{{ loading ? t('读取中…') : t('刷新 ↻') }}</button></div>
    <p v-if="error" class="storage-unavailable" role="status">{{ text(error) }}</p>
    <template v-else-if="capacity">
      <div class="storage-metrics">
        <div><span>{{ t('曲库音频占用') }}</span><strong>{{ bytes(capacity.libraryBytes) }}</strong></div>
        <div><span>{{ volumeLabel }}</span><strong>{{ bytes(capacity.diskUsableBytes) }}</strong></div>
      </div>
      <p v-if="!capacity.uploadAllowed" class="storage-warning" role="alert">{{ t('磁盘空间不足，上传已暂停。释放空间后，点击“刷新”重试。') }}</p>
    </template>
    <p v-else class="storage-unavailable" role="status">{{ t('正在读取磁盘容量…') }}</p>
    <details class="storage-details">
      <summary>{{ t('存储说明') }}</summary>
      <p v-if="capacity" class="storage-policy">{{ t('为系统预留 {size}，空间不足时暂停上传。', { size: bytes(capacity.reserveBytes) }) }}</p>
      <p class="storage-note">{{ t('音乐保存在本机，上传来源文件仍会另占空间。') }}</p>
    </details>
  </section>
</template>
