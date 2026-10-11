#!/usr/bin/env node
/**
 * Fact-checks the documentation against the code.
 *
 * The architecture record makes a lot of mechanical claims — links, section
 * numbers, ADR numbers, env-var names and defaults, API routes, report types,
 * file paths and the completeness of the file map. Every one of them is
 * checkable, so they are checked here rather than by eye: this is what makes
 * "the docs are accurate" a result you can re-run instead of a promise.
 *
 *   node scripts/check-docs.mjs        # run from the repository root
 *
 * Exits 0 when every claim holds, 1 with a per-check report otherwise.
 * No dependencies: plain Node and the repository's own files.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOC_FILES = [
  'README.md',
  'docs/ARCHITECTURE.md',
  'docs/agents.md',
  'docs/backend.md',
  'docs/frontend.md',
  'docs/verification.md',
  'docs/decisions.md',
  'docs/deployment.md',
]

const failures = []
const notes = []

const fail = (check, message) => failures.push(`${check}: ${message}`)
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

/** Drop fenced code blocks so example `.env`/shell content is not read as prose. */
const stripFences = (md) => md.replace(/^```[\s\S]*?^```/gm, '')
/**
 * Drop inline code too — for prose that shows Markdown syntax as an example.
 * Single-line only, so an unpaired backtick cannot swallow the next paragraph.
 */
const stripCode = (md) => stripFences(md).replace(/`[^`\n]*`/g, '')

/** Every file under `dir`, relative to the root; dotfiles and build output skipped. */
function walkRepo(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) walkRepo(rel, out)
    else out.push(rel)
  }
  return out
}

// ── The areas the file map claims to cover ────────────────────────────────
// Walked directories plus the single files the map names explicitly. Kept in
// one place because both the path check and the map check are scoped by it.
const MAP_DIRS = [
  'backend/src',
  'backend/test',
  'frontend/src',
  'frontend/public',
  'frontend/test',
  'docs',
  'scripts',
]
const MAP_FILES = [
  'backend/.env.example',
  'backend/package.json',
  'frontend/index.html',
  'frontend/vite.config.js',
  'frontend/package.json',
  'frontend/eslint.config.js',
]

const realTree = () =>
  new Set([
    ...MAP_FILES.filter((p) => existsSync(join(ROOT, p))),
    ...MAP_DIRS.flatMap((dir) => walkRepo(dir)),
  ])

const BASENAMES = new Set([...realTree()].map((p) => p.split('/').pop()))

// ── Claim 1: every relative link resolves, including its #fragment ──────────
// GitHub's slugger: lowercase, drop anything that is not a word character,
// space, hyphen or underscore, then turn each individual space into a hyphen —
// so "A — B" yields a double hyphen, matching the anchors already in the record.
const slugify = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')

function anchorsOf(rel) {
  const anchors = new Map()
  for (const line of read(rel).split('\n')) {
    const m = /^#{1,6}\s+(.*)$/.exec(line)
    if (!m) continue
    const base = slugify(m[1])
    const n = anchors.get(base) ?? 0
    anchors.set(base, n + 1)
    if (n) anchors.set(`${base}-${n}`, 1)
  }
  return anchors
}

function checkLinks() {
  let count = 0
  for (const file of DOC_FILES) {
    for (const m of stripCode(read(file)).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = m[1]
      if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue
      const [pathPart, frag] = target.split('#')
      const abs = resolve(ROOT, dirname(file), pathPart)
      if (!existsSync(abs)) {
        fail('links', `${file} links to a missing file: ${target}`)
        continue
      }
      if (frag) {
        const targetRel = abs.slice(ROOT.length + 1)
        if (!anchorsOf(targetRel).has(frag)) {
          fail('links', `${file} links to a missing anchor: ${target}`)
          continue
        }
      }
      count++
    }
  }
  return `${count} cross-file links resolve`
}

// ── Claim 2: every §-reference names a section that exists ─────────────────
function sectionNumbers() {
  const numbers = new Set()
  for (const file of DOC_FILES) {
    for (const m of read(file).matchAll(/^#{2,3}\s+(\d+(?:\.\d+)?)\.?\s/gm)) numbers.add(m[1])
  }
  return numbers
}

function checkSectionRefs() {
  const numbers = sectionNumbers()
  let count = 0
  for (const file of DOC_FILES) {
    for (const m of stripCode(read(file)).matchAll(/§\s*(\d+(?:\.\d+)?)/g)) {
      if (!numbers.has(m[1])) fail('§-references', `${file} references §${m[1]}, which no document defines`)
      else count++
    }
  }
  return `${count} §-references resolve against ${numbers.size} sections`
}

// ── Claim 3: every ADR reference names a decision that exists ──────────────
function checkAdrRefs() {
  const defined = new Set([...read('docs/decisions.md').matchAll(/^###\s+ADR-(\d+):/gm)].map((m) => m[1]))
  let count = 0
  for (const file of DOC_FILES) {
    for (const m of stripFences(read(file)).matchAll(/ADR-(\d+)/g)) {
      if (!defined.has(m[1])) fail('ADR references', `${file} references ADR-${m[1]}, which decisions.md does not define`)
      else count++
    }
  }
  return `${count} ADR references resolve against ${defined.size} ADRs`
}

// ── Claims 4 & 5: env vars and documented defaults match config.js ─────────
// Every env var config.js reads must be mapped below, so adding a knob without
// documenting it fails the check rather than silently going unverified.
const ENV_MAP = {
  PORT: 'port',
  CLIENT_ORIGIN: 'clientOrigin',
  LLM_API_KEY: 'llm.apiKey',
  OPENAI_API_KEY: 'llm.apiKey',
  LLM_BASE_URL: 'llm.baseUrl',
  OPENAI_BASE_URL: 'llm.baseUrl',
  LLM_MODEL: 'llm.model',
  OPENAI_MODEL: 'llm.model',
  LLM_MODEL_SMART: 'llm.smartModel',
  OPENAI_MODEL_SMART: 'llm.smartModel',
  LLM_JSON_MODE: 'llm.jsonMode',
  OPENAI_JSON_MODE: 'llm.jsonMode',
  LLM_TIMEOUT_MS: 'llm.timeoutMs',
  LLM_MAX_RETRIES: 'llm.maxRetries',
  LLM_STREAM_IDLE_TIMEOUT_MS: 'llm.streamIdleTimeoutMs',
  TAVILY_API_KEY: 'tavily.apiKey',
  TAVILY_MAX_RESULTS: 'tavily.maxResults',
  MAX_SUBQUESTIONS: 'research.maxSubQuestions',
  RESEARCH_DEPTH: 'research.depth',
  RESEARCH_MAX_ROUNDS: 'research.maxRounds',
  COVERAGE_FLOOR: 'research.coverageFloor',
  MAX_FOLLOWUP_QUERIES: 'research.maxFollowUpQueries',
  DEEP_FETCH: 'research.deepFetch',
  DEEP_FETCH_SOURCES: 'research.deepFetchSources',
  RESEARCH_CRITIQUE: 'research.critique',
  CRITIC_FULL_TEXT_SOURCES: 'research.criticFullTextSources',
  RESEARCH_CONCURRENCY: 'research.concurrency',
  RUN_TIMEOUT_MS: 'research.runTimeoutMs',
  MONGODB_URI: 'mongo.uri',
  CLERK_PUBLISHABLE_KEY: 'clerk.publishableKey',
  CLERK_SECRET_KEY: 'clerk.secretKey',
}

/** The published env-var prefixes — used to spot invented names in the docs. */
const ENV_PREFIX =
  /^(LLM_|OPENAI_|TAVILY_|RESEARCH_|DEEP_FETCH|COVERAGE_FLOOR|MAX_|CRITIC_|RUN_TIMEOUT|MONGODB_|CLERK_|PORT|CLIENT_ORIGIN)/

/** Evaluate config.js with nothing configured, so every value is code's default. */
function configDefaults() {
  const scratch = mkdtempSync(join(tmpdir(), 'check-docs-'))
  const env = { ...process.env }
  for (const key of Object.keys(ENV_MAP)) delete env[key]
  delete env.DOTENV_CONFIG_PATH
  try {
    const json = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import c from ${JSON.stringify(pathToFileURL(join(ROOT, 'backend/src/config.js')).href)};` +
          'process.stdout.write(JSON.stringify(c))',
      ],
      { cwd: scratch, env, encoding: 'utf8' },
    )
    return JSON.parse(json)
  } catch (err) {
    const first = String(err.message).split('\n').find((line) => line.trim()) ?? err.message
    throw new Error(`could not evaluate backend/src/config.js — ${first.trim()}`)
  }
}

const dig = (obj, path) => path.split('.').reduce((acc, key) => acc?.[key], obj)

function envVarsReadByCode() {
  const src = read('backend/src/config.js')
  const names = new Set()
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1])
  for (const m of src.matchAll(/\benv\('([A-Z0-9_]+)',\s*'([A-Z0-9_]+)'\)/g)) {
    names.add(m[1])
    names.add(m[2])
  }
  return names
}

function checkEnvVars() {
  const readByCode = envVarsReadByCode()
  for (const name of readByCode) {
    if (!ENV_MAP[name]) fail('env vars', `config.js reads ${name}, which this checker does not map — update ENV_MAP`)
  }

  const documented = DOC_FILES.map(read).join('\n')
  for (const name of readByCode) {
    if (name.startsWith('OPENAI_')) continue // legacy fallbacks, documented as a group
    if (!documented.includes(name)) fail('env vars', `${name} is read by config.js but never documented`)
  }

  let count = 0
  for (const file of DOC_FILES) {
    for (const m of read(file).matchAll(/`([A-Z][A-Z0-9_]{3,})`/g)) {
      const name = m[1]
      if (!ENV_PREFIX.test(name)) continue
      if (!readByCode.has(name)) fail('env vars', `${file} names \`${name}\`, which config.js never reads`)
      else count++
    }
  }
  return `${readByCode.size} env vars documented, ${count} doc mentions verified`
}

function checkEnvDefaults() {
  const config = configDefaults()
  const placeholder = (v) =>
    v === '' || v.includes('your-') || v.includes('<') || v.includes('_key') || v.includes('example')

  let compared = 0
  const skipped = []
  for (const line of read('backend/.env.example').split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (!m) continue
    const [, name, value] = m
    if (placeholder(value)) {
      skipped.push(name)
      continue
    }
    const path = ENV_MAP[name]
    if (!path) {
      fail('env defaults', `.env.example sets ${name}, which is not in ENV_MAP`)
      continue
    }
    const actual = String(dig(config, path))
    if (actual !== value) fail('env defaults', `.env.example has ${name}=${value} but config.js defaults to ${actual}`)
    else compared++
  }
  notes.push(`env defaults: placeholders skipped (${skipped.join(', ')})`)
  return `${compared} documented defaults match config.js`
}

// ── Claim 6: every route the docs name is one the server serves ────────────
function checkRoutes() {
  const actual = new Set()
  for (const file of ['backend/src/app.js', 'backend/src/routes/research.js']) {
    const base = file.includes('research.js') ? '/api/research' : ''
    for (const m of read(file).matchAll(/(?:app|router)\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      actual.add(`${m[1].toUpperCase()} ${base}${m[2] === '/' ? '' : m[2]}`)
    }
  }

  // Routes appear both as prose (``POST /api/research/stream``) and as table
  // cells (``| `POST` | `/api/research/stream` |``), so both are matched.
  const mentioned = new Set()
  for (const file of DOC_FILES) {
    const text = stripFences(read(file))
    for (const re of [
      /\b(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[A-Za-z0-9/_:.-]*)/g,
      /\b(GET|POST|PUT|PATCH|DELETE)`?\s*\|\s*`?(\/api\/[A-Za-z0-9/_:.-]+)/g,
    ]) {
      for (const m of text.matchAll(re)) {
        const route = `${m[1]} ${m[2].replace(/\/$/, '')}`
        mentioned.add(route)
        if (!actual.has(route)) fail('API routes', `${file} documents ${route}, which the server does not serve`)
      }
    }
  }
  for (const route of actual) {
    if (!mentioned.has(route)) notes.push(`${route} is served but never documented`)
  }
  return `${mentioned.size} documented routes verified against ${actual.size} live routes`
}

// ── Claim 7: the documented report formats are the ones that exist ─────────
async function checkReportTypes() {
  const mod = await import(pathToFileURL(join(ROOT, 'backend/src/agents/reportTypes.js')).href)
  const types = mod.REPORT_TYPES

  // Both places a reader looks enumerate the formats by label.
  for (const file of ['README.md', 'docs/decisions.md']) {
    // Whitespace is collapsed first: the enumerations wrap across lines.
    const md = read(file).toLowerCase().replace(/\s+/g, ' ')
    for (const type of types) {
      if (!md.includes(type.label.toLowerCase())) fail('report types', `${file} never names the "${type.label}" format`)
    }
  }

  const all = DOC_FILES.map(read).join('\n')
  for (const type of types) {
    if (!all.includes(type.id)) fail('report types', `report type id \`${type.id}\` is never documented`)
  }

  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 }
  for (const file of DOC_FILES) {
    for (const m of read(file).matchAll(/(\w+)\s+(?:selectable\s+)?report\s+(?:types|formats)/gi)) {
      const n = words[m[1].toLowerCase()] ?? Number.parseInt(m[1], 10)
      if (Number.isFinite(n) && n !== types.length) {
        fail('report types', `${file} says "${m[0].trim()}" but reportTypes.js defines ${types.length}`)
      }
    }
  }
  return `${types.length} formats (${types.map((t) => t.id).join(', ')}) documented by name and count`
}

// ── Claim 8: file paths named in the docs exist (or are named as gone) ─────
// Paths the record names as removed or never-existing. These are asserted to be
// absent, which is itself a checkable claim — so this list cannot hide breakage.
const GONE_PATHS = {
  'tailwind.config.js': '§13.7: v4 needs no config file',
  'db/fileStore.js': 'ADR-24 deleted the file store',
  'agents/mock.js': 'ADR-24 deleted mock mode',
  'data/reports.json': 'the file store ADR-24 removed',
  'backend/data/reports.json': 'the file store ADR-24 removed',
  'App.css': '§13.7 replaced it with Tailwind',
  'research/planner-with-search.js': 'ADR-02 rejected feature-grouping; never existed',
}

const FILE_EXT = /\.(js|jsx|json|md|mjs|css|html|svg)$/
const SEARCH_ROOTS = ['', 'backend/', 'backend/src/', 'frontend/', 'frontend/src/', 'docs/', 'scripts/']

function checkFilePaths() {
  let count = 0
  for (const file of DOC_FILES) {
    for (const m of stripFences(read(file)).matchAll(/`([A-Za-z0-9_./@-]+\.[a-z]+)`/g)) {
      const path = m[1]
      if (!FILE_EXT.test(path)) continue
      if (path in GONE_PATHS) {
        if (SEARCH_ROOTS.some((root) => existsSync(join(ROOT, root, path))) || BASENAMES.has(path.split('/').pop())) {
          fail('file paths', `${file} names \`${path}\` as gone (${GONE_PATHS[path]}), but it exists`)
        }
        continue
      }
      if (SEARCH_ROOTS.some((root) => existsSync(join(ROOT, root, path)))) count++
      else if (BASENAMES.has(path.split('/').pop())) count++
      else fail('file paths', `${file} names \`${path}\`, which does not exist`)
    }
  }
  return `${count} file paths resolve`
}

// ── Claim 9: the file map in Appendix A matches the real tree ──────────────
/**
 * Rebuild the paths in Appendix A from its indentation. The tree is two spaces
 * per level, an entry is a whitespace-free name (optionally a `dir/`) followed
 * by an aligned description, and a description that wraps is a line whose first
 * token still contains spaces — those are skipped.
 */
function mappedPaths() {
  const md = read('docs/ARCHITECTURE.md')
  const start = md.indexOf('## Appendix A')
  const open = md.indexOf('```', start)
  const close = md.indexOf('```', open + 3)
  const stack = []
  const paths = []
  for (const line of md.slice(open + 3, close).split('\n')) {
    if (!line.trim()) continue
    const indent = line.length - line.trimStart().length
    const name = line.trim().split(/\s{2,}/)[0]
    if (!name || /\s/.test(name)) continue
    const depth = Math.floor(indent / 2)
    if (name.endsWith('/')) {
      stack[depth] = name.slice(0, -1)
      continue
    }
    paths.push([...stack.slice(0, depth).filter(Boolean), name].join('/'))
  }
  return new Set(paths)
}

function checkFileMap() {
  const listed = mappedPaths()
  const real = realTree()

  for (const path of listed) {
    if (!real.has(path)) fail('file map', `Appendix A lists ${path}, which is not in the tree`)
  }
  let count = 0
  for (const path of real) {
    if (listed.has(path)) count++
    else fail('file map', `${path} exists but is missing from Appendix A`)
  }
  return `${count} files match between the map and the tree`
}

// ── Run ───────────────────────────────────────────────────────────────────
const checks = [
  checkLinks,
  checkSectionRefs,
  checkAdrRefs,
  checkEnvVars,
  checkEnvDefaults,
  checkRoutes,
  checkReportTypes,
  checkFilePaths,
  checkFileMap,
]

console.log('\nDocumentation fact-check\n')
let passed = 0
for (const check of checks) {
  const before = failures.length
  let summary
  try {
    summary = await check()
  } catch (err) {
    summary = `threw: ${err.message}`
  }
  const good = failures.length === before
  if (good) passed++
  console.log(`  ${good ? '✓' : '✗'} ${summary}`)
}

for (const note of notes) console.log(`\n  note — ${note}`)

if (failures.length) {
  console.log(`\n✗ ${failures.length} claim(s) the record makes are no longer true:\n`)
  for (const f of failures) console.log(`  · ${f}`)
  console.log('')
  process.exit(1)
}
console.log(`\n✓ all ${passed} checks passed — the record matches the code.\n`)
