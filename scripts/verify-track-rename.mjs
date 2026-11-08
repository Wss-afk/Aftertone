// Uses only the dedicated local test backend/proxy and a generated test tone.
// prepare -> browser verification -> checkpoint -> restart test backend -> verify.
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const mode = process.argv[2]
assert(['prepare', 'checkpoint', 'verify'].includes(mode), 'Use prepare, checkpoint or verify')
const base = 'http://127.0.0.1:18080'
const proxy = 'http://127.0.0.1:15173'
const directory = '.local/rename-verification'
const settings = JSON.parse(await readFile('.local/delete-verification/settings.json', 'utf8'))
assert.match(settings.database, /^night_signal_delete_test_\d+$/)
assert.equal(resolve(settings.musicDir).toLowerCase(), resolve('.local/delete-verification/music').toLowerCase())
await mkdir(directory, { recursive: true })
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function json(url, options, expected = 200) {
  const response = await fetch(url, options)
  const body = await response.json()
  assert.equal(response.status, expected, JSON.stringify(body))
  return body
}
const list = (host = base) => json(`${host}/api/v1/tracks`)
const patch = (host, id, title, expected = 200) => json(`${host}/api/v1/tracks/${id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
}, expected)
async function hashes() {
  const names = (await readdir(settings.musicDir)).filter(name => /^[0-9a-f-]{36}\.mp3$/.test(name)).sort()
  return Object.fromEntries(await Promise.all(names.map(async name => [name, digest(await readFile(resolve(settings.musicDir, name)))])))
}
async function checkAudio(track, expectedHash) {
  const response = await fetch(`${base}${track.audioUrl}`)
  assert.equal(response.status, 200)
  assert.equal(digest(Buffer.from(await response.arrayBuffer())), expectedHash)
  const partial = await fetch(`${proxy}${track.audioUrl}`, { headers: { Range: 'bytes=0-1023' } })
  assert.equal(partial.status, 206)
  assert.equal((await partial.arrayBuffer()).byteLength, 1024)
}
function sameAudioAndMetadata(original, renamed) {
  assert.deepEqual({ ...renamed, title: original.title }, original)
}

if (mode === 'prepare') {
  const before = await list()
  assert(!before.some(track => track.originalFilename === '重命名验证音.mp3'), 'This test tone already exists; use checkpoint/verify for this run')
  const beforeHashes = await hashes()
  const tone = await readFile(`${directory}/rename-tone.mp3`)
  const body = new FormData()
  body.append('file', new Blob([tone], { type: 'audio/mpeg' }), '重命名验证音.mp3')
  const original = await json(`${base}/api/v1/tracks`, { method: 'POST', body }, 201)
  const ids = (await list()).map(track => track.id)
  const files = await hashes()
  let updated
  for (const host of [base, proxy]) {
    updated = await patch(host, original.id, '　夜航 · 重命名验证 🎵　')
    assert.equal(updated.title, '夜航 · 重命名验证 🎵')
    sameAudioAndMetadata(original, updated)
    for (const title of [null, '', ' \u00a0　', '歌'.repeat(256), '🎵'.repeat(256), '甲\n乙']) {
      assert.equal((await patch(host, original.id, title, 400)).code, 'INVALID_TITLE')
    }
    assert.equal((await patch(host, '9223372036854775806', '不存在', 404)).code, 'TRACK_NOT_FOUND')
    assert.equal((await json(`${host}/api/v1/tracks/${original.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{' }, 400)).code, 'INVALID_REQUEST')
  }
  assert.deepEqual((await list()).map(track => track.id), ids)
  assert.deepEqual(await hashes(), files)
  await checkAudio(updated, digest(tone))
  await writeFile(`${directory}/state.json`, JSON.stringify({ before, beforeHashes, original, files, ids, toneHash: digest(tone), updated }, null, 2))
  console.log(JSON.stringify({ directAndProxy: '200 / 400 / 404', trackId: original.id, unchangedAudioAndOrder: true }))
} else {
  const state = JSON.parse(await readFile(`${directory}/state.json`, 'utf8'))
  const tracks = await list()
  const track = tracks.find(item => item.id === state.original.id)
  assert(track)
  sameAudioAndMetadata(state.original, track)
  assert.deepEqual(tracks.map(item => item.id), state.ids)
  assert.deepEqual(tracks.filter(item => item.id !== state.original.id), state.before)
  assert.deepEqual(await hashes(), state.files)
  for (const [name, hash] of Object.entries(state.beforeHashes)) assert.equal(state.files[name], hash)
  await checkAudio(track, state.toneHash)
  if (mode === 'checkpoint') {
    assert.equal(track.title, '夜航 · 网页保存验证 🎵')
    state.updated = track
    await writeFile(`${directory}/state.json`, JSON.stringify(state, null, 2))
  } else {
    assert.deepEqual(track, state.updated, 'The saved title and metadata must survive restart')
  }
  console.log(JSON.stringify({ phase: mode, title: track.title, metadataAndFilesUnchanged: true, playbackAndRange: true }))
}
