import { useEffect, useRef, useState } from 'react'
import { TradingViewChart } from '../components/TradingViewChart'
import { useAppStore } from '../store/useAppStore'

export function ChartsPage() {
  const pair = useAppStore((s) => s.pair), theme = useAppStore((s) => s.theme)
  const frame = useRef<HTMLDivElement>(null), [fs, setFs] = useState(false)
  useEffect(() => { const h = () => setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h) }, [])
  const toggle = () => (document.fullscreenElement ? void document.exitFullscreen() : void frame.current?.requestFullscreen())
  return (
    <div className="page-grid">
      <section className="panel card wide">
        <div className="row-between"><h2>{pair} live market (TradingView)</h2><button type="button" className="btn" onClick={toggle}>{fs ? 'Exit full screen' : 'Full screen'}</button></div>
        <p className="mut">Real market data. The auto trader uses a separate simulated feed. Drag the bottom-right corner to resize. Change the pair in the top bar.</p>
        <div ref={frame} className="tv-frame"><TradingViewChart symbol={`FX:${pair}`} theme={theme === 'light' ? 'light' : 'dark'} /></div>
      </section>
    </div>
  )
}
