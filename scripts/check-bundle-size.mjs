import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const distDir = path.resolve('dist')
const assetsDir = path.join(distDir, 'assets')
// Firestore is lazy-loaded after authentication; its SDK chunk is ~550 KiB raw.
const maxJsBytes = 600 * 1024
const warnCssBytes = 90 * 1024

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
  }

  return `${(bytes / 1024).toFixed(1)} KiB`
}

async function getAssetEntries() {
  const files = await readdir(assetsDir)
  const entries = await Promise.all(
    files.map(async (file) => {
      const absolutePath = path.join(assetsDir, file)
      const stats = await stat(absolutePath)
      return {
        file: `assets/${file}`,
        bytes: stats.size,
        ext: path.extname(file),
      }
    }),
  )

  return entries.sort((a, b) => b.bytes - a.bytes)
}

const entries = await getAssetEntries()
const jsEntries = entries.filter((entry) => entry.ext === '.js')
const cssEntries = entries.filter((entry) => entry.ext === '.css')

const oversizedJs = jsEntries.filter((entry) => entry.bytes > maxJsBytes)
const oversizedCss = cssEntries.filter((entry) => entry.bytes > warnCssBytes)

console.log('Bundle size report')
console.log('Top JavaScript assets:')
for (const entry of jsEntries.slice(0, 12)) {
  console.log(`- ${entry.file}: ${formatBytes(entry.bytes)}`)
}

if (cssEntries.length > 0) {
  console.log('CSS assets:')
  for (const entry of cssEntries) {
    console.log(`- ${entry.file}: ${formatBytes(entry.bytes)}`)
  }
}

if (oversizedCss.length > 0) {
  console.warn(
    `CSS warning: ${oversizedCss
      .map((entry) => `${entry.file} ${formatBytes(entry.bytes)}`)
      .join(', ')} exceeds ${formatBytes(warnCssBytes)}`,
  )
}

if (oversizedJs.length > 0) {
  console.error(
    `Bundle size check failed: ${oversizedJs
      .map((entry) => `${entry.file} ${formatBytes(entry.bytes)}`)
      .join(', ')} exceeds ${formatBytes(maxJsBytes)}`,
  )
  process.exitCode = 1
}
