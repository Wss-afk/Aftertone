import type { MessageKey } from '../i18n/en'

export const SHORTCUTS_KEY = 'aftertone.keyboard-shortcuts'
export type ShortcutAction = 'toggle' | 'previous' | 'next' | 'backward' | 'forward' | 'quieter' | 'louder' | 'mute' | 'search' | 'help'

export const SHORTCUTS: { keys: string[]; label: MessageKey }[] = [
  { keys: ['Space', 'K'], label: '播放 / 暂停' },
  { keys: ['P', 'N'], label: '上一首 / 下一首' },
  { keys: ['J', 'L'], label: '后退 / 前进 5 秒' },
  { keys: ['-', '+', '='], label: '降低 / 提高音量 5%' },
  { keys: ['M'], label: '静音 / 取消静音' },
  { keys: ['/'], label: '聚焦搜索' },
  { keys: ['?'], label: '打开快捷键说明' },
]

export function readShortcutsEnabled(): boolean {
  try { return localStorage.getItem(SHORTCUTS_KEY) !== 'false' }
  catch { return true }
}
export function saveShortcutsEnabled(value: boolean) {
  try { localStorage.setItem(SHORTCUTS_KEY, String(value)) }
  catch { /* The preference still applies to this page when storage is blocked. */ }
}

const actions: Record<string, ShortcutAction> = {
  k: 'toggle', p: 'previous', n: 'next', j: 'backward', l: 'forward',
  '-': 'quieter', '+': 'louder', '=': 'louder', m: 'mute', '/': 'search', '?': 'help',
}

export function shortcutAction(event: KeyboardEvent): ShortcutAction | undefined {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey) return
  if (event.shiftKey && !['?', '/', '+'].includes(event.key)) return
  if (event.key === ' ' || event.code === 'Space') return 'toggle'
  const key = event.key.toLowerCase()
  return Object.hasOwn(actions, key) ? actions[key] : undefined
}
