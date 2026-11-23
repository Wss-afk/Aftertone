<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '../i18n'
import { SHORTCUTS } from '../utils/keyboardShortcuts'
import { lockPageScroll } from '../utils/pageScrollLock'

const props = defineProps<{ open: boolean; enabled: boolean }>()
const emit = defineEmits<{ close: []; enabled: [value: boolean] }>()
const { t } = useI18n()
const dialog = ref<HTMLDialogElement>()
let releaseScroll: (() => void) | undefined
let returnFocus: HTMLElement | undefined

function restorePage() {
  releaseScroll?.()
  releaseScroll = undefined
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
  returnFocus = undefined
}

watch(() => props.open, open => {
  if (open && !dialog.value?.open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    releaseScroll = lockPageScroll()
    dialog.value?.showModal()
  } else if (!open) {
    if (dialog.value?.open) dialog.value.close()
    restorePage()
  }
}, { flush: 'post' })
onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
  restorePage()
})
</script>

<template>
  <dialog id="keyboard-shortcuts" ref="dialog" class="shortcuts-dialog" aria-labelledby="shortcuts-title" aria-describedby="shortcuts-description"
    @cancel.prevent="emit('close')" @close="emit('close')">
    <header class="shortcuts-heading">
      <h2 id="shortcuts-title">{{ t('键盘快捷键') }}</h2>
      <button class="shortcuts-close" type="button" autofocus :aria-label="t('关闭快捷键说明')" @click="emit('close')">{{ t('关闭') }}</button>
    </header>
    <p id="shortcuts-description">{{ t('选歌后可使用播放快捷键；搜索和说明随时可用。') }}</p>
    <dl class="shortcuts-list">
      <div v-for="shortcut in SHORTCUTS" :key="shortcut.label">
        <dt>{{ t(shortcut.label) }}</dt>
        <dd><template v-for="(key, index) in shortcut.keys" :key="key"><span v-if="index" aria-hidden="true">/</span><kbd>{{ key === 'Space' ? t('空格') : key }}</kbd></template></dd>
      </div>
    </dl>
    <label class="shortcuts-preference"><input id="enable-shortcuts" type="checkbox" :checked="enabled" @change="emit('enabled', ($event.target as HTMLInputElement).checked)" />{{ t('启用键盘快捷键') }}</label>
    <p class="shortcuts-note">{{ t('输入框、下拉菜单、操作菜单和弹窗保留自己的按键；全屏播放器支持播放快捷键。滑块保留方向键、Home 和 End，浏览器组合键照常使用。按钮聚焦时，空格仍激活按钮。') }}</p>
    <p class="shortcuts-note">{{ t('偏好保存在当前浏览器。关闭快捷键后，仍可用问号按钮打开此说明。') }}</p>
  </dialog>
</template>

<style scoped>
.shortcuts-dialog { width: min(560px, calc(100% - 40px)); max-height: calc(100dvh - 40px); padding: 28px; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--active-line); border-radius: 12px; background: var(--surface-raised); color: var(--text); box-shadow: 0 24px 80px var(--shadow-strong); }
.shortcuts-dialog::backdrop { background: var(--modal-backdrop); }
.shortcuts-heading { display: flex; position: sticky; top: 0; z-index: 1; align-items: center; justify-content: space-between; gap: 20px; background: var(--surface-raised); box-shadow: 0 -28px 0 var(--surface-raised); }
.shortcuts-heading h2 { font-size: 22px; }
.shortcuts-close { min-height: 36px; padding: 8px; color: var(--muted); font-size: 12px; }
#shortcuts-description, .shortcuts-note { color: var(--muted); font-size: 12px; line-height: 1.8; }
#shortcuts-description { margin-top: 14px; }
.shortcuts-list { margin: 22px 0; }
.shortcuts-list > div { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 11px 0; border-bottom: 1px solid var(--line); }
dt { font-size: 14px; }
dd { display: flex; align-items: center; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; gap: 7px; margin: 0; }
kbd { display: inline-flex; justify-content: center; align-items: center; min-width: 28px; padding: 4px 7px; border: 1px solid var(--control-line); border-radius: 5px; background: var(--surface-inset); color: var(--text); font: inherit; font-size: 12px; }
.shortcuts-preference { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 14px; cursor: pointer; }
.shortcuts-preference input { width: 17px; height: 17px; margin: 0; accent-color: var(--accent); }
.shortcuts-note + .shortcuts-note { margin-top: 8px; }
@media (max-width: 560px) {
  .shortcuts-dialog { padding: 22px; }
  .shortcuts-heading h2 { font-size: 20px; }
  .shortcuts-list > div { gap: 12px; }
  dt { font-size: 12px; }
  kbd { min-width: 25px; padding: 4px 6px; font-size: 11px; }
}
</style>
