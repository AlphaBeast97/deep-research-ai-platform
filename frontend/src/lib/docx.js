import { hostOf, slugify } from './format.js'

/**
 * Markdown → .docx.
 *
 * The `docx` library is imported lazily (like Mermaid) so its ~300 kB stays out
 * of the main bundle until someone actually exports.
 *
 * Scope is deliberately the subset our writer emits: headings, paragraphs,
 * bullet/ordered lists, GFM tables, blockquotes, fenced code, and Mermaid
 * diagrams — the latter rasterised to PNG in the browser so they survive into
 * Word instead of degrading to source text.
 */

const INLINE_RE =
  /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g

const unescapeMd = (text) => String(text || '').replace(/\\([\\`*_{}[\]()#+\-.!>])/g, '$1')

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line)
const isTableSep = (line) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-')

const splitRow = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())

/** Split Markdown into block-level elements. */
export function parseBlocks(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    const fence = line.match(/^\s*```(\w*)\s*$/)
    if (fence) {
      const body = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      i++ // consume closing fence
      blocks.push({
        type: fence[1] === 'mermaid' ? 'mermaid' : 'code',
        text: body.join('\n'),
      })
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      i++
      continue
    }

    if (isTableRow(line) && isTableSep(lines[i + 1] || '')) {
      const header = splitRow(line)
      const rows = []
      i += 2
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'hr' })
      i++
      continue
    }

    if (/^\s*>/.test(line)) {
      const body = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', text: body.join(' ') })
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    if (!line.trim()) {
      i++
      continue
    }

    const text = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !isTableRow(lines[i])
    ) {
      text.push(lines[i].trim())
      i++
    }
    // A line that starts a block we don't collect into paragraphs (e.g. a lone
    // table row) would otherwise stall the loop — consume it as plain text.
    if (!text.length) {
      text.push(lines[i].trim())
      i++
    }
    blocks.push({ type: 'p', text: text.join(' ') })
  }

  return blocks
}

/** Turn inline Markdown into docx runs. */
function inlineRuns(docx, text, base = {}) {
  const { TextRun, ExternalHyperlink } = docx
  const runs = []
  const src = unescapeMd(text)
  let last = 0
  let match

  INLINE_RE.lastIndex = 0
  while ((match = INLINE_RE.exec(src))) {
    if (match.index > last) runs.push(new TextRun({ text: src.slice(last, match.index), ...base }))
    const token = match[0]

    if (token.startsWith('**') || token.startsWith('__')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true, ...base }))
    } else if (token.startsWith('`')) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: 'Consolas', ...base }))
    } else if (token.startsWith('*') || token.startsWith('_')) {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true, ...base }))
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      const label = link?.[1] ?? token
      const href = link?.[2] ?? ''
      if (href.startsWith('#')) {
        // Internal anchor (a citation): keep the bracketed number as text.
        runs.push(new TextRun({ text: `[${label}]`, ...base }))
      } else if (/^https?:\/\//i.test(href)) {
        runs.push(
          new ExternalHyperlink({
            link: href,
            children: [new TextRun({ text: label, style: 'Hyperlink', ...base })],
          }),
        )
      } else {
        runs.push(new TextRun({ text: label, ...base }))
      }
    }
    last = match.index + token.length
  }
  if (last < src.length) runs.push(new TextRun({ text: src.slice(last), ...base }))
  return runs.length ? runs : [new TextRun({ text: '', ...base })]
}

function tableBlock(docx, block) {
  const { Table, TableRow, TableCell, Paragraph, WidthType } = docx
  const rows = [block.header, ...block.rows].map(
    (cells, rowIndex) =>
      new TableRow({
        tableHeader: rowIndex === 0,
        children: cells.map(
          (cell) =>
            new TableCell({
              shading: rowIndex === 0 ? { fill: 'F4F4F5' } : undefined,
              children: [
                new Paragraph({
                  children: inlineRuns(docx, cell, rowIndex === 0 ? { bold: true } : {}),
                }),
              ],
            }),
        ),
      }),
  )
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
}

/** Convert parsed blocks into docx children, consuming diagrams in order. */
export function blocksToChildren(docx, blocks, diagramImages = []) {
  const { Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, BorderStyle } = docx
  const children = []
  let diagramIndex = 0

  const headingFor = (level) =>
    [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][
      Math.min(level, 4) - 1
    ]

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        children.push(
          new Paragraph({
            heading: headingFor(block.level),
            children: inlineRuns(docx, block.text),
            spacing: { before: 260, after: 100 },
          }),
        )
        break

      case 'p':
        children.push(
          new Paragraph({ children: inlineRuns(docx, block.text), spacing: { after: 160 } }),
        )
        break

      case 'ul':
        for (const item of block.items) {
          children.push(
            new Paragraph({ children: inlineRuns(docx, item), bullet: { level: 0 } }),
          )
        }
        break

      case 'ol':
        block.items.forEach((item, index) => {
          children.push(
            new Paragraph({
              indent: { start: 360 },
              spacing: { after: 40 },
              children: [new TextRun({ text: `${index + 1}. ` }), ...inlineRuns(docx, item)],
            }),
          )
        })
        break

      case 'quote':
        children.push(
          new Paragraph({
            children: inlineRuns(docx, block.text, { italics: true }),
            indent: { start: 360 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 12, color: 'D4D4D8', space: 8 },
            },
            spacing: { after: 160 },
          }),
        )
        break

      case 'code':
        for (const lineText of block.text.split('\n')) {
          children.push(
            new Paragraph({
              shading: { fill: 'F4F4F5' },
              spacing: { after: 0 },
              children: [new TextRun({ text: lineText || ' ', font: 'Consolas', size: 18 })],
            }),
          )
        }
        children.push(new Paragraph({ text: '', spacing: { after: 120 } }))
        break

      case 'mermaid': {
        const image = diagramImages[diagramIndex]
        diagramIndex++
        if (image) {
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 200 },
              children: [new ImageRun({ type: 'png', data: image.data, transformation: { width: image.width, height: image.height } })],
            }),
          )
        } else {
          // No raster available (e.g. the diagram had not finished rendering) —
          // keep the definition rather than silently dropping it.
          children.push(
            new Paragraph({
              children: [new TextRun({ text: 'Diagram (Mermaid source)', bold: true, size: 18 })],
            }),
          )
          for (const lineText of block.text.split('\n')) {
            children.push(
              new Paragraph({
                shading: { fill: 'F4F4F5' },
                spacing: { after: 0 },
                children: [new TextRun({ text: lineText || ' ', font: 'Consolas', size: 18 })],
              }),
            )
          }
          children.push(new Paragraph({ text: '', spacing: { after: 120 } }))
        }
        break
      }

      case 'table':
        children.push(tableBlock(docx, block))
        children.push(new Paragraph({ text: '', spacing: { after: 160 } }))
        break

      case 'hr':
        children.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D4D4D8' } },
            children: [new TextRun('')],
          }),
        )
        break

      default:
        break
    }
  }

  return children
}

function sourcesChildren(docx, sources) {
  if (!sources.length) return []
  const { Paragraph, TextRun, ExternalHyperlink, HeadingLevel } = docx
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun('Sources')],
      spacing: { before: 400, after: 120 },
    }),
    ...sources.map((source) => {
      const label = source.title || source.url || ''
      const link = /^https?:\/\//i.test(source.url || '')
        ? new ExternalHyperlink({
            link: source.url,
            children: [new TextRun({ text: label, style: 'Hyperlink' })],
          })
        : new TextRun({ text: label })
      return new Paragraph({
        spacing: { after: 90 },
        children: [
          new TextRun({ text: `[${source.index}] `, bold: true }),
          link,
          new TextRun({ text: `  —  ${hostOf(source.url || '')}`, color: '71717A', size: 18 }),
        ],
      })
    }),
  ]
}

/** Build the .docx as a Blob (separated from the download so it is testable). */
export async function buildDocxBlob({ title, report, sources = [], diagramImages = [] }) {
  const docx = await import('docx')
  const { Document, Packer, Paragraph, TextRun } = docx

  // The report's own H1 becomes the document title, so drop it from the body.
  const body = String(report || '').replace(/^#\s.*\n?/, '')
  const children = [
    new Paragraph({
      heading: docx.HeadingLevel.TITLE,
      children: [new TextRun({ text: title || 'Research report' })],
      spacing: { after: 240 },
    }),
    ...blocksToChildren(docx, parseBlocks(body), diagramImages),
    ...sourcesChildren(docx, sources),
  ]

  const doc = new Document({
    creator: 'MAD Researcher',
    title: title || 'Research report',
    description: 'Generated by MAD Researcher',
    sections: [{ children }],
  })

  return Packer.toBlob(doc)
}

/** Export the current report as a Word document. */
export async function downloadDocx({ title, report, sources = [], diagramImages = [] }) {
  const blob = await buildDocxBlob({ title, report, sources, diagramImages })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(title)}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────
//  Diagram rasterisation (SVG → PNG) so diagrams survive into Word
// ─────────────────────────────────────────────────────────────

const MAX_IMAGE_WIDTH = 620 // px at 96dpi ≈ 6.5in, a Letter page's text width

async function svgToPng(svg) {
  const rect = svg.getBoundingClientRect()
  const naturalWidth = Math.round(rect.width || Number(svg.getAttribute('width')) || 800)
  const naturalHeight = Math.round(rect.height || Number(svg.getAttribute('height')) || 400)
  const scale = Math.min(1, MAX_IMAGE_WIDTH / Math.max(1, naturalWidth))
  const width = Math.max(1, Math.round(naturalWidth * scale))
  const height = Math.max(1, Math.round(naturalHeight * scale))

  const clone = svg.cloneNode(true)
  clone.setAttribute('width', naturalWidth)
  clone.setAttribute('height', naturalHeight)
  if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const markup = new XMLSerializer().serializeToString(clone)
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

  const image = new Image()
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error('could not rasterise diagram'))
    image.src = url
  })

  const ratio = 2 // render at 2x for a crisp result in print
  const canvas = document.createElement('canvas')
  canvas.width = width * ratio
  canvas.height = height * ratio
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(ratio, ratio)
  ctx.drawImage(image, 0, 0, width, height)

  const base64 = canvas.toDataURL('image/png').split(',')[1]
  const binary = atob(base64)
  const data = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i)

  return { data, width, height }
}

/**
 * Rasterise every rendered diagram inside `root`, in document order, so they
 * can be matched positionally to the report's Mermaid blocks. Best effort: a
 * diagram that fails to rasterise yields `null` and the DOCX falls back to
 * showing its source.
 */
export async function rasterizeDiagrams(root) {
  if (!root) return []
  const svgs = [...root.querySelectorAll('figure.mermaid-figure svg')]
  const images = []
  for (const svg of svgs) {
    try {
      images.push(await svgToPng(svg))
    } catch {
      images.push(null)
    }
  }
  return images
}
