// Uses only the isolated 18080 backend and 15173 proxy, never the daily library.
// Set its reserve to 999TB for "low" mode, then to 5GB for "normal" mode.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const mode = process.argv[2]
assert(['low', 'normal'].includes(mode), 'Choose low or normal mode')
const settings = JSON.parse(await readFile('.local/delete-verification/settings.json', 'utf8'))
assert.match(settings.database, /^night_signal_delete_test_\d+$/)
const hash = value => createHash('sha256').update(value).digest('hex')
async function audioFiles() {
  const result = {}
  for (const name of (await readdir(settings.musicDir)).filter(name => name.endsWith('.mp3')).sort()) result[name] = hash(await readFile(join(settings.musicDir, name)))
  return result
}
const originalFiles = await audioFiles()
const sample = await readFile('backend/src/test/resources/test-tone.mp3')
for (const base of ['http://127.0.0.1:18080', 'http://127.0.0.1:15173']) {
  const before = await (await fetch(`${base}/api/v1/tracks`)).json()
  const statusResponse = await fetch(`${base}/api/v1/storage`)
  assert.equal(statusResponse.status, 200)
  const capacity = await statusResponse.json()
  assert.equal(capacity.uploadAllowed, mode === 'normal')
  assert(capacity.diskUsableBytes > 0)
  assert(capacity.libraryBytes > 0, 'Retained generated audio must be counted')
  const body = new FormData()
  body.append('file', new Blob([sample], { type: 'audio/mpeg' }), '容量保护验证.mp3')
  const uploaded = await fetch(`${base}/api/v1/tracks`, { method: 'POST', body })
  if (mode === 'low') {
    assert.equal(uploaded.status, 507)
    assert.match(uploaded.headers.get('content-type'), /^application\/problem\+json/)
    assert.equal((await uploaded.json()).code, 'INSUFFICIENT_STORAGE')
    assert.deepEqual(await (await fetch(`${base}/api/v1/tracks`)).json(), before)
    const playable = await fetch(`${base}${before[0].audioUrl}`)
    assert.equal(playable.status, 200)
    assert.equal(hash(Buffer.from(await playable.arrayBuffer())), hash(sample))
    const absent = await fetch(`${base}/api/v1/tracks/9223372036854775806`, { method: 'DELETE' })
    assert.equal(absent.status, 404)
    await absent.arrayBuffer()
    const largeBody = new FormData()
    largeBody.append('file', new Blob([Buffer.alloc(12 * 1024 * 1024)]), 'generated-large-test.mp3')
    const early = await fetch(`${base}/api/v1/tracks`, { method: 'POST', body: largeBody })
    assert.equal(early.status, 507)
    assert.equal((await early.json()).code, 'INSUFFICIENT_STORAGE')
  } else {
    assert.equal(uploaded.status, 201)
    const track = await uploaded.json()
    const larger = await (await fetch(`${base}/api/v1/storage`)).json()
    assert.equal(larger.libraryBytes, capacity.libraryBytes + track.sizeBytes)
    // Delete only the one disposable track just created by this integration test.
    assert.equal((await fetch(`${base}/api/v1/tracks/${track.id}`, { method: 'DELETE' })).status, 204)
    const restored = await (await fetch(`${base}/api/v1/storage`)).json()
    assert.equal(restored.libraryBytes, capacity.libraryBytes)
  }
  console.log(JSON.stringify({ base, mode, uploadAllowed: capacity.uploadAllowed, libraryBytes: capacity.libraryBytes, result: 'passed' }))
}
assert.deepEqual(await audioFiles(), originalFiles, 'Existing isolated audio must remain unchanged')
assert.deepEqual(await readdir('.local/storage-verification/multipart'), [], 'Rejected request must not leave multipart staging files')
