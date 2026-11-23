<script setup lang="ts">
import { useI18n } from '../i18n'

withDefaults(defineProps<{ open: boolean; enabled?: boolean }>(), { enabled: true })
defineEmits<{ open: [] }>()
const { t } = useI18n()
</script>

<template>
  <button class="shortcuts-toggle" type="button" :aria-label="t('键盘快捷键')" :title="t(enabled ? '键盘快捷键（?）' : '键盘快捷键')" :aria-keyshortcuts="enabled ? '?' : undefined"
    aria-haspopup="dialog" aria-controls="keyboard-shortcuts" :aria-expanded="open" @click="$emit('open')"><span aria-hidden="true">?</span></button>
</template>

<style scoped>
.shortcuts-toggle { display: grid; place-items: center; flex: none; width: 36px; height: 36px; padding: 0; border-radius: 7px; color: var(--icon); font-size: 20px; line-height: 1; }
.shortcuts-toggle:hover, .shortcuts-toggle[aria-expanded='true'] { background: var(--hover-bg); color: var(--accent); }
.shortcuts-toggle:focus-visible { outline-offset: 3px; }
</style>
