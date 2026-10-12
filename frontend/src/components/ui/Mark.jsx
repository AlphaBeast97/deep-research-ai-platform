/**
 * The brand mark: a document with one line highlighted — the product's whole
 * idea (research that shows its work) in one glyph. Shared by the landing
 * header and the app header; `public/favicon.svg` is the same artwork.
 */
export default function Mark({ className = 'h-11 w-11' }) {
  return (
    <svg viewBox="0 0 44 44" className={className} role="img" aria-label="MAD Researcher">
      <defs>
        <linearGradient id="mad-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0e7c6b" />
          <stop offset="1" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect width="44" height="44" rx="12" fill="url(#mad-mark)" />
      <rect x="12" y="15" width="20" height="3" rx="1.5" fill="#ffffff" opacity="0.95" />
      <rect x="12" y="21" width="20" height="3" rx="1.5" fill="#f0b429" />
      <rect x="12" y="27" width="12" height="3" rx="1.5" fill="#ffffff" opacity="0.95" />
    </svg>
  )
}
