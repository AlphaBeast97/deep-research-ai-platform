import { slugify } from './format.js'

/** Trigger a browser download of the report as a Markdown file. */
export function downloadMarkdown({ title, report }) {
  const body = `# ${title}\n\n${report.replace(/^#\s.*\n/, '')}`
  const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slugify(title)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Open the rendered report in a print window so the browser can "Save as PDF".
 * The report HTML is copied verbatim (including Mermaid's rendered SVG), so the
 * print window carries its own stylesheet instead of relying on the app's CSS.
 */
export function printReport({ title, html }) {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) return
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      body{font:15px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:760px;margin:40px auto;padding:0 24px}
      h1{font-size:30px;margin-bottom:4px}
      h2{font-size:20px;margin-top:32px;border-bottom:1px solid #e5e5e5;padding-bottom:6px}
      h3{font-size:16px;margin-top:22px}
      a{color:#6d28d9}
      .citation-chip{all:unset;color:#6d28d9;font-weight:600}
      blockquote{border-left:3px solid #d4d4d8;margin:0;padding:2px 14px;color:#52525b;background:#fafafa}
      code{background:#f4f4f5;padding:1px 5px;border-radius:4px;font-size:13px}
      pre{background:#f4f4f5;padding:12px;border-radius:6px;overflow:auto}
      ul,ol{padding-left:22px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #e5e5e5;padding:6px 10px;text-align:left}
      .mermaid-figure{border:1px solid #e5e5e5;border-radius:8px;padding:12px;margin:16px 0;page-break-inside:avoid}
      .mermaid-figure svg{max-width:100%;height:auto}
    </style></head><body>${html}</body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 300)
}
