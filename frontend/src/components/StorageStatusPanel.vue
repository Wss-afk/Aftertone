<script setup lang="ts">
import { computed } from 'vue'
import type { StorageStatus } from '../api/storage'

const props = defineProps<{ capacity?: StorageStatus; loading: boolean; error: string }>()
defineEmits<{ refresh: [] }>()
const volumeLabel = computed(() => {
  const drive = props.capacity?.volumeRoot.match(/^([a-z]):/i)?.[1]
  return drive ? `${drive.toUpperCase()} 盘可用` : '磁盘可用'
})

function bytes(value: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++ }
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`
}
</script>

<template>
  <section class="storage-panel" aria-label="曲库容量" :aria-busy="loading">
    <div class="storage-heading"><h2>存储空间</h2><button class="text-button" :disabled="loading" aria-label="刷新容量" @click="$emit('refresh')">{{ loading ? '读取中…' : '刷新 ↻' }}</button></div>
    <p v-if="error" class="storage-unavailable" role="status">{{ error }}</p>
    <template v-else-if="capacity">
      <div class="storage-metrics">
        <div><span>曲库音频占用</span><strong>{{ bytes(capacity.libraryBytes) }}</strong></div>
        <div><span>{{ volumeLabel }}</span><strong>{{ bytes(capacity.diskUsableBytes) }}</strong></div>
      </div>
      <p class="storage-policy">为系统预留 {{ bytes(capacity.reserveBytes) }}，空间不足时暂停上传。</p>
      <p v-if="!capacity.uploadAllowed" class="storage-warning" role="alert">磁盘空间不足，上传已暂停。释放空间后，点击“刷新”重试。</p>
    </template>
    <p v-else class="storage-unavailable" role="status">正在读取磁盘容量…</p>
    <p class="storage-note">音乐保存在本机，上传来源文件仍会另占空间。</p>
  </section>
</template>
