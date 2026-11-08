// Original sine-wave test audio; contains no third-party music.
// Install encoder: npm install --prefix .cache/test-tools @breezystack/lamejs@1.2.7
import { Mp3Encoder } from '../.cache/test-tools/node_modules/@breezystack/lamejs/dist/lamejs.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const output = resolve(process.argv[2] ?? '.local/test-audio/夜航验证音.mp3')
const seconds = Number(process.argv[3] ?? 30)
if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120) throw new Error('Duration must be 0–120 seconds')
const rate = 44100
const encoder = new Mp3Encoder(1, rate, 128)
const chunks = []
for (let offset = 0; offset < rate * seconds; offset += 1152) {
  const samples = new Int16Array(Math.min(1152, rate * seconds - offset))
  for (let i = 0; i < samples.length; i++) {
    const t = (offset + i) / rate
    const envelope = Math.min(1, t * 5, (seconds - t) * 5)
    samples[i] = Math.round(5000 * envelope * Math.sin(2 * Math.PI * 440 * t))
  }
  chunks.push(Buffer.from(encoder.encodeBuffer(samples)))
}
chunks.push(Buffer.from(encoder.flush()))
await mkdir(dirname(output), { recursive: true })
const bytes = Buffer.concat(chunks)
await writeFile(output, bytes)
console.log(JSON.stringify({ path: output, size: bytes.length, seconds }))
