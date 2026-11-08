import { afterEach, expect, it, vi } from 'vitest'
import { getStorageStatus } from '../api/storage'

afterEach(() => vi.unstubAllGlobals())

it('reads the storage status endpoint', async () => {
  const status = { libraryBytes: 100, uploadAllowed: true }
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(status)))
  vi.stubGlobal('fetch', fetch)
  await expect(getStorageStatus()).resolves.toEqual(status)
  expect(fetch).toHaveBeenCalledWith('/api/v1/storage')
})

it('keeps a server-provided capacity error readable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: '暂时无法读取磁盘容量' }), { status: 503 })))
  await expect(getStorageStatus()).rejects.toThrow('暂时无法读取磁盘容量')
})
