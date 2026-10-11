import { hostOf, slugify } from './format.js'
import { citedSources } from './citations.js'
import { repairMermaidBlocks } from './mermaid.js'

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

// Source titles/snippets come from the web, so they are untrusted text. The
// print window shares this origin, so everything interpolated into it is escaped.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch])

/**
 * Trigger a browser download of the report as a Markdown file.
 *
 * Mermaid blocks are repaired on the way out, so a diagram that only renders
 * because the UI fixed it up does not leave the app broken: the `.md` is meant
 * to be opened elsewhere (GitHub renders Mermaid natively).
 */
export function downloadMarkdown({ title, report }) {
  const body = `# ${title}\n\n${repairMermaidBlocks(report).replace(/^#\s.*\n/, '')}`
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(title)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Build the `<section id="sources">` appended to a printed report.
 *
 * Citations in the report are anchors to `#source-n`. In the app those scroll
 * the side panel, but the printed document has no side panel — so without this
 * section every `[n]` in a saved PDF points at nothing. Rendering the list with
 * the same ids is what makes the citations resolve in the exported artifact.
 */
export function sourcesSection(sources = []) {
  if (!sources.length) return ''
  const items = sources
    .map((s) => {
      const index = escapeHtml(s.index ?? '')
      const title = escapeHtml(s.title || s.url)
      const url = escapeHtml(s.url || '')
      const host = escapeHtml(hostOf(s.url || ''))
      return `<li id="source-${index}"><span class="src-num">${index}</span><div><a href="${url}">${title}</a><span class="src-host">${host}</span></div></li>`
    })
    .join('')
  return `<section id="sources"><h2>Sources</h2><ol>${items}</ol></section>`
}

const PRINT_STYLES = `
  body{font:15px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:760px;margin:40px auto;padding:0 24px}
  h1{font-size:30px;margin-bottom:4px}
  h2{font-size:20px;margin-top:32px;border-bottom:1px solid #e5e5e5;padding-bottom:6px}
  h3{font-size:16px;margin-top:22px}
  a{color:#6d28d9}
  .citation-chip,.citation-ref{all:unset;color:#6d28d9;font-weight:700;font-size:11px;vertical-align:super;line-height:0}
  blockquote{border-left:3px solid #d4d4d8;margin:0;padding:2px 14px;color:#52525b;background:#fafafa}
  code{background:#f4f4f5;padding:1px 5px;border-radius:4px;font-size:13px}
  pre{background:#f4f4f5;padding:12px;border-radius:6px;overflow:auto}
  ul,ol{padding-left:22px}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #e5e5e5;padding:6px 10px;text-align:left}
  .mermaid-figure{border:1px solid #e5e5e5;border-radius:8px;padding:12px;margin:16px 0;page-break-inside:avoid}
  .mermaid-figure svg{max-width:100%;height:auto}
  /* Sources appendix */
  #sources{margin-top:44px;border-top:2px solid #111;padding-top:14px}
  #sources h2{border-bottom:none;margin-top:0}
  #sources ol{list-style:none;padding-left:0;margin:0}
  #sources li{display:flex;gap:10px;margin-bottom:9px;font-size:13px;page-break-inside:avoid}
  #sources .src-num{flex:none;display:inline-block;min-width:20px;height:20px;line-height:20px;text-align:center;border-radius:5px;background:#ede9fe;color:#6d28d9;font-weight:700;font-size:11px}
  #sources .src-host{display:block;color:#71717a;font-size:11.5px}
  #sources a{text-decoration:none;font-weight:600}
  @media print{ a{text-decoration:none} }
`

/**
 * Open the rendered report in a print window so the browser can "Save as PDF".
 * The report HTML is copied verbatim (including Mermaid's rendered SVG), so the
 * print window carries its own stylesheet instead of relying on the app's CSS.
 *
 * The sources list is appended so citation anchors resolve inside the PDF —
 * without it, a saved PDF has `[n]` markers that point at nothing. It is
 * filtered here rather than by the caller, so no call site can forget: the
 * appendix lists what the report cites and nothing else.
 */
export function printReport({ title, html, report = '', sources = [] }) {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) return
  const safeTitle = escapeHtml(title)
  // The report's own H1 is dropped so the title is not printed twice — we emit
  // the heading ourselves above the body.
  const body = String(html || '').replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '')
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${safeTitle}</title>
    <style>${PRINT_STYLES}</style></head><body>
    <h1>${safeTitle}</h1>
    ${body}
    ${sourcesSection(citedSources(sources, report))}
    </body></html>`)
  win.document.close()
  win.focus()
  // Give the copied SVG (diagrams) a beat to lay out before the print dialog.
  setTimeout(() => win.print(), 400)
}
