import { useEffect, useRef } from 'react'
/** Real market data from TradingView. It is NOT the simulated feed the auto trader uses. */
export function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    el.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>'
    const s = document.createElement('script')
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'; s.async = true
    s.innerHTML = JSON.stringify({ autosize: true, symbol, interval: '1', timezone: 'Etc/UTC', theme: 'dark', style: '1', locale: 'en', allow_symbol_change: true })
    el.appendChild(s)
    return () => { el.innerHTML = '' }
  }, [symbol])
  return <div ref={ref} className="tradingview-widget-container" style={{ height: 520, width: '100%' }} />
}
