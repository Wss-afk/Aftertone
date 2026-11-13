import { ref } from 'vue'

export const THEME_KEY = 'aftertone.theme'
export const THEMES = [
  { id: 'rainy-night', label: '雨夜蓝灰', background: '#171b1d' },
  { id: 'forest', label: '森林绿', background: '#121514' },
] as const
export type Theme = typeof THEMES[number]['id']

function isTheme(value: unknown): value is Theme {
  return THEMES.some(theme => theme.id === value)
}

function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY)
    if (isTheme(value)) return value
  } catch { /* Theme selection also works when browser storage is blocked. */ }
  return 'rainy-night'
}

function applyTheme(value: Theme) {
  document.documentElement.dataset.theme = value
  const selected = THEMES.find(theme => theme.id === value)!
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', selected.background)
}

export function useTheme() {
  const theme = ref<Theme>(savedTheme())
  applyTheme(theme.value)

  function setTheme(value: string) {
    if (!isTheme(value)) return
    theme.value = value
    applyTheme(value)
    try { localStorage.setItem(THEME_KEY, value) }
    catch { /* The selected theme remains active for this page session. */ }
  }

  return { theme, setTheme }
}
