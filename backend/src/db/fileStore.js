import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../data')
const DATA_FILE = path.join(DATA_DIR, 'reports.json')

/**
 * Tiny JSON-file store. Keeps the whole dataset in memory and writes the
 * document back to disk on every mutation. Perfect for local dev: zero setup,
 * and swapping to MongoDB later is a single env var (see mongoStore.js).
 */
async function readAll() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

async function writeAll(records) {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(DATA_FILE, JSON.stringify(records, null, 2), 'utf8')
}

export const name = 'file'

export async function connect() {
  await fs.mkdir(DATA_DIR, { recursive: true })
  return DATA_FILE
}

export async function save(record) {
  const records = await readAll()
  const idx = records.findIndex((r) => r.id === record.id)
  if (idx === -1) records.unshift(record)
  else records[idx] = record
  await writeAll(records)
  return record
}

export async function list() {
  const records = await readAll()
  return records
    .map(({ id, query, title, createdAt, status, sources }) => ({
      id,
      query,
      title,
      createdAt,
      status,
      sourceCount: Array.isArray(sources) ? sources.length : 0,
    }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export async function get(id) {
  const records = await readAll()
  return records.find((r) => r.id === id) || null
}

export async function remove(id) {
  const records = await readAll()
  const next = records.filter((r) => r.id !== id)
  const changed = next.length !== records.length
  if (changed) await writeAll(next)
  return changed
}
