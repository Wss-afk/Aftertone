// Dedicated test backend/proxy only. prepare -> UI edit -> checkpoint -> restart -> verify.
import assert from 'node:assert/strict'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const mode = process.argv[2]
assert(['prepare', 'checkpoint', 'verify'].includes(mode))
const host = 'http://127.0.0.1:18080'
const proxy = 'http://127.0.0.1:15173'
const directory = '.local/metadata-verification'
const settings = JSON.parse(await readFile('.local/delete-verification/settings.json', 'utf8'))
assert.match(settings.database, /^night_signal_delete_test_\d+$/)
assert.equal(resolve(settings.musicDir).toLowerCase(), resolve('.local/delete-verification/music').toLowerCase())
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function json(url, options, status = 200) {
  const response = await fetch(url, options)
  const body = await response.json()
  assert.equal(response.status, status, JSON.stringify(body))
  return body
}
const list = () => json(`${host}/api/v1/tracks`)
const patch = (base, id, values, status = 200) => json(`${base}/api/v1/tracks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) }, status)
async function hashes() {
  const names = (await readdir(settings.musicDir)).filter(name => /^[0-9a-f-]{36}\.mp3$/.test(name)).sort()
  return Object.fromEntries(await Promise.all(names.map(async name => [name, digest(await readFile(resolve(settings.musicDir, name)))])))
}
function onlyInformationChanged(original, updated) { assert.deepEqual({ ...updated, title: original.title, artist: original.artist }, original) }

if (mode === 'prepare') {
  const before = await list()
  assert(before.every(track => typeof track.artist === 'string'), 'Migration must expose an artist for existing tracks')
  assert(!before.some(track => track.originalFilename === '标签导入验证.mp3'), 'Already prepared')
  const source = await readFile(`${directory}/tagged-source.m4a`)
  const body = new FormData()
  body.append('file', new Blob([source], { type: 'audio/mpeg' }), '标签导入验证.mp3')
  const original = await json(`${host}/api/v1/tracks`, { method: 'POST', body }, 201)
  assert.equal(original.title, '自动标签曲目 🎵')
  assert.equal(original.artist, '标签歌手')
  const ids = (await list()).map(track => track.id)
  const files = await hashes()
  for (const base of [host, proxy]) {
    const updated = await patch(base, original.id, { title: '　菜单验证音　', artist: '　测试歌手　' })
    assert.equal(updated.title, '菜单验证音'); assert.equal(updated.artist, '测试歌手')
    onlyInformationChanged(original, updated)
    for (const artist of ['🎵'.repeat(256), '甲\n乙']) {
      assert.equal((await patch(base, original.id, { title: '不应保存', artist }, 400)).code, 'INVALID_ARTIST')
    }
    assert.equal((await patch(base, original.id, { title: '菜单验证音' })).artist, '测试歌手')
    assert.equal((await patch(base, original.id, { title: '菜单验证音', artist: '' })).artist, '')
    await patch(base, original.id, { title: '菜单验证音', artist: '测试歌手' })
  }
  assert.deepEqual(await hashes(), files)
  await writeFile(`${directory}/state.json`, JSON.stringify({ before, original, ids, files }, null, 2))
  console.log(JSON.stringify({ taggedUpload: '201', convertedTagsRetained: true, directAndProxyArtistEditing: true, filesUnchanged: true }))
} else {
  const state = JSON.parse(await readFile(`${directory}/state.json`, 'utf8'))
  const tracks = await list()
  const track = tracks.find(item => item.id === state.original.id)
  assert(track); onlyInformationChanged(state.original, track)
  assert.deepEqual(tracks.map(item => item.id), state.ids)
  assert.deepEqual(tracks.filter(item => item.id !== track.id), state.before)
  assert.deepEqual(await hashes(), state.files)
  const audio = await fetch(`${host}${track.audioUrl}`)
  assert.equal(audio.status, 200)
  const bytes = Buffer.from(await audio.arrayBuffer())
  assert.equal(bytes.length, track.sizeBytes)
  assert(Object.values(state.files).includes(digest(bytes)))
  const range = await fetch(`${proxy}${track.audioUrl}`, { headers: { Range: 'bytes=0-1023' } })
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 1024)
  if (mode === 'checkpoint') {
    assert.equal(track.title, '菜单验证音 · 已修改'); assert.equal(track.artist, '网页测试歌手')
    state.saved = track
    await writeFile(`${directory}/state.json`, JSON.stringify(state, null, 2))
  } else assert.deepEqual(track, state.saved)
  console.log(JSON.stringify({ phase: mode, title: track.title, artist: track.artist, otherRecordsAndAudioUnchanged: true, audio200And206: true }))
}
