type PageLock = { count: number; overflow: string; x: number; y: number }
const locks = new WeakMap<Document, PageLock>()

export function lockPageScroll(): () => void {
  let lock = locks.get(document)
  if (!lock) {
    lock = { count: 0, overflow: document.documentElement.style.overflow, x: window.scrollX, y: window.scrollY }
    locks.set(document, lock)
    document.documentElement.style.overflow = 'hidden'
  }
  lock.count++
  let released = false
  return () => {
    if (released) return
    released = true
    if (--lock.count) return
    document.documentElement.style.overflow = lock.overflow
    if (window.scrollX !== lock.x || window.scrollY !== lock.y) window.scrollTo(lock.x, lock.y)
    locks.delete(document)
  }
}
