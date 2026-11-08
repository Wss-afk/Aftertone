// Read-only persistence/Range checks plus invalid uploads (which must create no records).
// node scripts/verify-api.mjs <track-id> <original-mp3-path>
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'

const id = Number(process.argv[2])
const source = process.argv[3]
assert(Number.isSafeInteger(id) && id > 0 && source, 'Supply track ID and original MP3 path')
const original = await readFile(source)
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const results = []
for (const origin of ['http://127.0.0.1:8080', 'http://127.0.0.1:5173']) {
  const tracks = await (await fetch(`${origin}/api/v1/tracks`)).json()
  const track = tracks.find(track => track.id === id)
  assert(track, `Track ${id} missing at ${origin}`)
  assert.equal(track.sizeBytes, original.length)
  assert.match(track.createdAt, /Z$/)
  const url = `${origin}${track.audioUrl}`
  const full = await fetch(url)
  assert.equal(full.status, 200)
  assert.equal(full.headers.get('content-type'), 'audio/mpeg')
  assert.equal(full.headers.get('accept-ranges'), 'bytes')
  assert.equal(sha256(Buffer.from(await full.arrayBuffer())), sha256(original))
  const partial = await fetch(url, { headers: { Range: 'bytes=0-1023' } })
  assert.equal(partial.status, 206)
  assert.equal(partial.headers.get('content-range'), `bytes 0-1023/${original.length}`)
  assert.equal(partial.headers.get('content-type'), 'audio/mpeg')
  assert.equal(partial.headers.get('accept-ranges'), 'bytes')
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()), original.subarray(0, 1024))
  for (const range of ['bytes=999999999-', 'bytes=abc']) {
    const response = await fetch(url, { headers: { Range: range } })
    assert.equal(response.status, 416)
    assert.equal(response.headers.get('content-range'), `bytes */${original.length}`)
  }
  const suffix = await fetch(url, { headers: { Range: 'bytes=-1024' } })
  assert.equal(suffix.status, 206)
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), original.subarray(-1024))
  const missing = await fetch(`${origin}/api/v1/tracks/9223372036854775806/audio`, { headers: { Range: 'bytes=0-1023' } })
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).code, 'TRACK_NOT_FOUND')
  const failures = [
    { bytes: null, status: 400, code: 'FILE_REQUIRED' },
    { bytes: Buffer.alloc(0), status: 400, code: 'EMPTY_FILE' },
    { bytes: Buffer.from('plain text disguised as mp3'), status: 415, code: 'UNSUPPORTED_AUDIO' },
    { bytes: Buffer.from('ID3'), status: 415, code: 'UNSUPPORTED_AUDIO' },
    { bytes: Buffer.alloc(25 * 1024 * 1024 + 1), status: 413, code: 'UPLOAD_TOO_LARGE' },
    { bytes: Buffer.alloc(26 * 1024 * 1024 + 1), status: 413, code: 'UPLOAD_TOO_LARGE' },
  ]
  for (const expected of failures) {
    const body = new FormData()
    if (expected.bytes !== null) body.append('file', new Blob([expected.bytes], { type: 'audio/mpeg' }), '伪装.mp3')
    const response = await fetch(`${origin}/api/v1/tracks`, { method: 'POST', body }).catch(error => {
      throw new Error(`${origin}: ${expected.code} did not return a readable response`, { cause: error })
    })
    assert.equal(response.status, expected.status, `${origin}: ${expected.code}`)
    assert.match(response.headers.get('content-type'), /^application\/problem\+json/)
    assert.equal((await response.json()).code, expected.code)
  }
  const after = await (await fetch(`${origin}/api/v1/tracks`)).json()
  assert.equal(after.length, tracks.length, 'Invalid upload created a record')
  results.push({ origin, trackId: id, sizeBytes: original.length, sha256: sha256(original), full: 200, range: 206, invalidRange: 416, missing: 404, invalidUploads: '6 passed' })
}
await mkdir('.local', { recursive: true })
await writeFile('.local/api-verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2))
console.log(JSON.stringify(results, null, 2))
