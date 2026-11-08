<script setup lang="ts">
import { ref, watch } from 'vue'
const props = defineProps<{ url?: string | null }>()
const failed = ref(false)
watch(() => props.url, () => { failed.value = false })
</script>

<template>
  <span class="artwork" aria-hidden="true">
    <img v-if="url && !failed" :src="url" alt="" loading="lazy" decoding="async" @error="failed = true" />
    <span v-else class="artwork-placeholder">♪</span>
  </span>
</template>
