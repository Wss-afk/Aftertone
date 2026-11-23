<script setup lang="ts">
import { useI18n } from '../i18n'
import { THEMES, useTheme } from '../composables/useTheme'

const { t } = useI18n()

const { theme, setTheme } = useTheme()
</script>

<template>
  <div class="theme-selector">
    <label for="app-theme">{{ t('主题') }}</label>
    <select id="app-theme" :value="theme" @change="setTheme(($event.target as HTMLSelectElement).value)">
      <option v-for="option in THEMES" :key="option.id" :value="option.id">{{ t(option.label) }}</option>
    </select>
  </div>
</template>

<style scoped>
.theme-selector { display: flex; align-items: center; gap: 9px; font-size: 11px; letter-spacing: .04em; }
label { color: var(--muted); white-space: nowrap; }
select { max-width: 140px; padding: 8px 10px; border: 1px solid var(--active-line); border-radius: 6px; background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
select:hover { border-color: var(--control-line); }
select:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
