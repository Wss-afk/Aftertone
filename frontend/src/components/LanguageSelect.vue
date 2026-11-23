<script setup lang="ts">
import { useI18n } from '../i18n'

const { locale, setLocale, t } = useI18n()
</script>

<template>
  <div class="language-selector">
    <label for="app-language">{{ t('语言') }}</label>
    <select id="app-language" :value="locale" @change="setLocale(($event.target as HTMLSelectElement).value)">
      <option value="zh-CN" lang="zh-CN">简体中文</option>
      <option value="en" lang="en">English</option>
    </select>
  </div>
</template>

<style scoped>
.language-selector { display: flex; align-items: center; gap: 9px; font-size: 11px; }
label { color: var(--muted); white-space: nowrap; }
select { max-width: 140px; padding: 8px 10px; border: 1px solid var(--active-line); border-radius: 6px; background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
select:hover { border-color: var(--control-line); }
select:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
</style>
