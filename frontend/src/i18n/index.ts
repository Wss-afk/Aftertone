import { inject, provide, readonly, ref, type InjectionKey } from 'vue'
import { en, type MessageKey, type Params, type Translation } from './en'

export const LOCALE_KEY = 'aftertone.locale'
export type Locale = 'zh-CN' | 'en'
export type Message = { key: MessageKey; params: Params }
export type MessageValue = string | Message | Error
export function message(key: MessageKey, params: Params = {}): Message { return { key, params } }
export function fromError(error: unknown, fallback: MessageKey): MessageValue {
  return error instanceof Error ? error : message(fallback)
}

function savedLocale(): Locale {
  try { return localStorage.getItem(LOCALE_KEY) === 'en' ? 'en' : 'zh-CN' }
  catch { return 'zh-CN' }
}

export function createI18n() {
  const locale = ref<Locale>(savedLocale())
  function t(key: MessageKey, params: Params = {}): string {
    const template: Translation = locale.value === 'en' ? en[key] : key
    const value = typeof template === 'function' ? template(params) : template
    return value.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(params[name] ?? placeholder))
  }
  function text(value: MessageValue | undefined): string {
    if (!value) return ''
    if (typeof value !== 'string' && !(value instanceof Error)) return t(value.key, value.params)
    const raw = value instanceof Error ? value.message : value
    if (locale.value === 'zh-CN') return raw
    if (Object.hasOwn(en, raw)) return t(raw as MessageKey)
    if (value instanceof Error) {
      const code = 'code' in value && typeof value.code === 'string' ? value.code : ''
      if (code && Object.hasOwn(apiErrors, code)) return apiErrors[code]!
      const status = 'status' in value && typeof value.status === 'number' ? value.status : undefined
      if (status) return t('请求失败（{status}），请重试。', { status })
      if (/\p{Script=Han}/u.test(raw)) return 'Something went wrong. Please try again.'
    }
    return raw
  }
  function setLocale(value: string) {
    if (value !== 'zh-CN' && value !== 'en') return
    locale.value = value
    document.documentElement.lang = value
    try { localStorage.setItem(LOCALE_KEY, value) }
    catch { /* Switching languages still works when storage is unavailable. */ }
  }
  return { locale: readonly(locale), t, text, setLocale }
}

type I18n = ReturnType<typeof createI18n>
const key: InjectionKey<I18n> = Symbol('aftertone.i18n')
export function provideI18n() {
  const i18n = createI18n()
  provide(key, i18n)
  return i18n
}
export function useI18n(): I18n { return inject(key, undefined) ?? createI18n() }

const apiErrors: Record<string, string> = {
  TRACK_NOT_FOUND: 'This track could not be found.',
  PLAYLIST_NOT_FOUND: 'This playlist could not be found. Refresh and try again.',
  PLAYLIST_NAME_EXISTS: 'A playlist with this name already exists. Choose another name.',
  INVALID_PLAYLIST_NAME: 'Enter a playlist name of 1–80 characters, without control characters.',
  INVALID_TITLE: 'Enter a title of 1–255 characters, without line breaks or control characters.',
  INVALID_ARTIST: 'Artist names must be at most 255 characters, without line breaks or control characters.',
  INVALID_ALBUM: 'Album names must be at most 255 characters, without line breaks or control characters.',
  INVALID_FAVORITE: 'Choose whether to add this track to favorites.',
  INVALID_COVER_ACTION: 'Choose either changing or removing the artwork.',
  INVALID_COVER: 'Choose a valid JPG or PNG image, up to 5 MB.',
  COVER_TOO_LARGE: 'Artwork must be 5 MB or smaller.',
  COVER_DIMENSIONS: 'The artwork dimensions are too large. Choose a smaller image.',
  COVER_NOT_FOUND: 'This track’s artwork could not be found.',
  AUDIO_NOT_FOUND: 'The track exists, but its audio file is unavailable.',
  EMPTY_FILE: 'Empty files cannot be imported.',
  FILE_TOO_LARGE: 'The file is too large. Audio files must be 25 MB or smaller.',
  UPLOAD_TOO_LARGE: 'The upload is too large. Audio files must be 25 MB or smaller.',
  FILE_REQUIRED: 'Choose an audio file to import.',
  MISSING_FILE: 'Choose an audio file to import.',
  INVALID_REQUEST: 'The request is invalid. Check your input and try again.',
  INSUFFICIENT_STORAGE: 'There is not enough disk space. Free some space and refresh storage.',
  STORAGE_UNAVAILABLE: 'Storage is unavailable. Check the music directory and try again.',
  DUPLICATE_TRACK: 'This audio is already in your library. The duplicate was skipped.',
  UNSUPPORTED_AUDIO: 'This audio could not be read. Check the file or choose another audio file.',
  AUDIO_PROCESSING_UNAVAILABLE: 'Audio processing is unavailable. Please try again later.',
  AUDIO_PROCESSING_TIMEOUT: 'Audio processing timed out. Try again or choose another file.',
  AUDIO_PROCESSING_INTERRUPTED: 'Audio processing was interrupted. Please try again.',
  PROCESSED_AUDIO_TOO_LARGE: 'The processed audio is too large. Choose a shorter track.',
  UPLOAD_FAILED: 'The audio could not be saved. Please try again.',
  DELETE_FAILED: 'Deletion is incomplete. Refresh the library and try again.',
  RENAME_FAILED: 'Track information could not be saved. Refresh the library and try again.',
  FAVORITE_SAVE_FAILED: 'Your favorite could not be saved. Refresh the library and try again.',
  INTERNAL_ERROR: 'The server could not complete the request. Please try again.',
}
