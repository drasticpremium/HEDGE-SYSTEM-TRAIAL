import { useEffect, useRef } from 'react'
/** Real market data from TradingView (not the simulated feed). Fills its parent, so resizing the parent resizes the chart. */
export function TradingViewChart({ symbol, theme = 'dark' }: { symbol: string; theme?: 'dark' | 'light' }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="position:absolute;inset:0"></div>'
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'; s.async = true
    s.innerHTML = JSON.stringify({ autosize: true, symbol, interval: '1', timezone: 'Etc/UTC', theme, style: '1', locale: 'en', allow_symbol_change: true, hide_side_toolbar: false, withdateranges: true })
    el.appendChild(s)
    return () => { el.innerHTML = '' }
  }, [symbol, theme])
  return <div ref={ref} className="tradingview-widget-container" style={{ position: 'absolute', inset: 0 }} />
}
