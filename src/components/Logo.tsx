export function Logo() {
  return (
    <div className="brand" aria-label="Hedge Signal Desk logo">
      <svg viewBox="0 0 64 64" className="brand-mark" role="img" aria-hidden="true">
        <rect x="6" y="6" width="52" height="52" rx="14" />
        <path d="M22 39 L22 25 L28 25 L28 39" />
        <path d="M36 25 L36 39 L42 39 L42 25" />
        <path d="M16 32 H48" />
        <path d="M22 21 L28 25 L22 29" />
        <path d="M42 21 L36 25 L42 29" />
      </svg>
      <div className="brand-text">
        <span>Hedge Signal Desk</span>
      </div>
    </div>
  )
}
