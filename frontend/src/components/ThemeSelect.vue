<script setup lang="ts">
import { THEMES, useTheme } from '../composables/useTheme'

const { theme, setTheme } = useTheme()
</script>

<template>
  <div class="theme-selector">
    <label for="app-theme">主题</label>
    <select id="app-theme" :value="theme" @change="setTheme(($event.target as HTMLSelectElement).value)">
      <option v-for="option in THEMES" :key="option.id" :value="option.id">{{ option.label }}</option>
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
