// Isolated integration test. Refuses the real app port or a nonempty library.
// Requires a dedicated test backend at 127.0.0.1:18080 and a fresh test database.
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const base = 'http://127.0.0.1:18080'
const settings = JSON.parse(await readFile('.local/delete-verification/settings.json', 'utf8'))
assert.match(settings.database, /^night_signal_delete_test_\d+$/)
const list = () => fetch(`${base}/api/v1/tracks`).then(response => response.json())
assert.deepEqual(await list(), [], 'Use an empty isolated test database')
const bytes = await readFile('backend/src/test/resources/test-tone.mp3')
const digest = value => createHash('sha256').update(value).digest('hex')
async function upload(name) {
  const body = new FormData()
  body.append('file', new Blob([bytes], { type: 'audio/mpeg' }), name)
  const response = await fetch(`${base}/api/v1/tracks`, { method: 'POST', body })
  assert.equal(response.status, 201)
  return response.json()
}
const first = await upload('单首删除验证-A.mp3')
const survivor = await upload('保留验证-B.mp3')
await writeFile('.local/delete-verification/tracks.json', JSON.stringify({ first, survivor }, null, 2))
const beforeFiles = (await readdir(settings.musicDir)).filter(name => name.endsWith('.mp3'))
assert.equal(beforeFiles.length, 2)

const missing = await fetch(`${base}/api/v1/tracks/9223372036854775806`, { method: 'DELETE' })
assert.equal(missing.status, 404)
assert.equal((await missing.json()).code, 'TRACK_NOT_FOUND')

const deleted = await fetch(`${base}/api/v1/tracks/${first.id}`, { method: 'DELETE' })
assert.equal(deleted.status, 204)
assert.equal(await deleted.text(), '')
const after = await list()
assert.deepEqual(after.map(track => track.id), [survivor.id])
assert.equal((await fetch(`${base}${first.audioUrl}`)).status, 404)
assert.equal((await fetch(`${base}/api/v1/tracks/${first.id}`, { method: 'DELETE' })).status, 404)
const retained = await fetch(`${base}${survivor.audioUrl}`)
assert.equal(retained.status, 200)
assert.equal(digest(Buffer.from(await retained.arrayBuffer())), digest(bytes))
const afterFiles = (await readdir(settings.musicDir)).filter(name => name.endsWith('.mp3'))
assert.equal(afterFiles.length, 1, 'Only one explicitly selected test audio file should be removed')
assert(beforeFiles.includes(afterFiles[0]))
console.log(JSON.stringify({ deletedId: first.id, survivorId: survivor.id, deleted: 204, unknownOrRepeated: 404, survivorHashMatches: true, filesBefore: 2, filesAfter: 1 }, null, 2))
