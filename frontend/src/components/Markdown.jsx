import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import Mermaid from './Mermaid.jsx'

const MERMAID = /language-mermaid/

/**
 * Rewrite inline citation tokens like [2] or [1, 4] into markdown links that
 * point at the matching source card (#source-2). This lets the report render
 * citations as interactive chips without a custom remark plugin.
 */
function linkifyCitations(text) {
  if (!text) return ''
  return text.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (match, group) => {
    const nums = group.split(',').map((n) => n.trim())
    // Leave fenced-code-ish or obviously non-citation brackets alone.
    if (nums.length > 6) return match
    return nums.map((n) => `[${n}](#source-${n})`).join('')
  })
}

function scrollToSource(id) {
  const el = document.getElementById(`source-${id}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 1200)
}

/**
 * A citation marker.
 *
 * Rendered as a real `<a href="#source-n">` rather than a button: the in-app
 * click is intercepted to scroll instead of jumping, but the href survives into
 * exported HTML (print/PDF/DOCX), where the sources appendix provides the same
 * `#source-n` ids so the reference resolves in the saved artifact too.
 */
function Citation({ n }) {
  return (
    <a
      href={`#source-${n}`}
      className="citation-chip inline-grid h-[17px] min-w-[17px] cursor-pointer place-items-center rounded-[5px] border border-accent/35 bg-accent/15 px-1 align-super text-[10.5px] leading-none font-bold text-accent no-underline transition-colors hover:bg-accent hover:text-white"
      title={`Jump to source ${n}`}
      onClick={(e) => {
        e.preventDefault()
        scrollToSource(n)
      }}
    >
      {n}
    </a>
  )
}

const components = {
  a({ href, children, ...props }) {
    const match = typeof href === 'string' && href.match(/^#source-(\d+)$/)
    if (match) {
      return <Citation n={match[1]} />
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-accent-2 underline decoration-dotted underline-offset-2 hover:text-accent"
        {...props}
      >
        {children}
      </a>
    )
  },

  // Fenced code blocks. Mermaid blocks become rendered diagrams.
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children
    if (typeof child?.props?.className === 'string' && MERMAID.test(child.props.className)) {
      return <>{children}</>
    }
    return (
      <pre className="my-3 overflow-x-auto rounded-control border border-line bg-surface-2 p-3 text-[13px] leading-relaxed">
        {children}
      </pre>
    )
  },

  code({ className, children, ...props }) {
    if (typeof className === 'string' && MERMAID.test(className)) {
      return <Mermaid chart={String(children).replace(/\n$/, '')} />
    }
    const text = String(children)
    // Inline code (no language class, single line) gets the chip treatment;
    // block code inherits its styling from <pre>.
    const isInline = !className && !text.includes('\n')
    if (isInline) {
      return (
        <code className="rounded-[5px] border border-line-soft bg-surface-2 px-[5px] py-px font-mono text-[0.88em]">
          {children}
        </code>
      )
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
}

export default function Markdown({ children }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkifyCitations(children)}
      </ReactMarkdown>
    </div>
  )
}
