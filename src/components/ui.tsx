import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Fades and lifts its children into view once, when scrolled to. Respects reduced-motion (see CSS). */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null), [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) { setOn(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect() } }, { threshold: 0.12 })
    io.observe(el); return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`reveal ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>
}
export const Section = ({ id, eyebrow, title, lead, children }: { id?: string; eyebrow?: string; title: string; lead?: string; children: ReactNode }) => (
  <section id={id} className="ab-section"><Reveal><div className="ab-head">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{lead && <p className="lead">{lead}</p>}</div></Reveal>{children}</section>
)
export const FeatureCard = ({ icon, title, children, delay = 0 }: { icon: string; title: string; children: ReactNode; delay?: number }) => (
  <Reveal delay={delay}><article className="feature"><span className="feature-icon"><Icon name={icon} size={22} /></span><h3>{title}</h3><p>{children}</p></article></Reveal>
)
export const Faq = ({ items }: { items: [string, string][] }) => (
  <div className="faq">{items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
)
export const WhatsAppIcon = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.1a8.1 8.1 0 01-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.1 8.1 0 1112 20.1z" /><path transform="translate(6.2 6.2) scale(.49)" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
)
