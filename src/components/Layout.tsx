import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from './Logo'
import { Icon } from './Icon'
import { PAIRS } from '../engine/pairs'
import { useAppStore, type ThemeName } from '../store/useAppStore'
import { useTrader } from '../store/trader'

const navItems = [
  ['/', 'Overview', 'home'], ['/desk', 'Live Desk', 'desk'], ['/auto', 'Auto', 'auto'], ['/server', '24/7 Server', 'server'], ['/charts', 'Charts', 'charts'], ['/log', 'Log', 'log'],
  ['/performance', 'Performance', 'performance'], ['/accuracy', 'Accuracy', 'accuracy'], ['/settings', 'Settings', 'settings'], ['/about', 'About', 'about'],
] as const
const THEMES: ThemeName[] = ['midnight', 'emerald', 'amber', 'violet', 'light', 'contrast']
const DISCLAIMER = 'Educational tool, paper trading only, not financial advice. Binary options and leveraged forex carry a high risk of loss.'

export function Layout() {
  const s = useAppStore(), running = useTrader((t) => t.running), cycle = useTrader((t) => t.cycle)
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top"><Logo /></div>
        <nav className="nav">{navItems.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon name={icon} />{label}</NavLink>)}</nav>
        <footer className="site-footer">{DISCLAIMER}</footer>
      </aside>
      <div className="content-panel">
        <header className="toolbar">
          <div className="mobile-only"><Logo /></div>
          <span className={`chip ${running ? 'chip-ok' : 'chip-warn'}`}><i className={running ? 'pulse' : ''} />{running ? (cycle ? `In trade: ${cycle.pair} ${cycle.dir}` : 'Auto trader scanning') : 'Auto trader paused'}</span>
          <div className="toolbar-ctl">
            <select aria-label="Pair" value={s.pair} onChange={(e) => s.setPair(e.target.value)}>{PAIRS.map((p) => <option key={p}>{p}</option>)}</select>
            <button type="button" className="ghost" onClick={() => s.setCurrencyUnit(s.currencyUnit === 'GH₵' ? 'USD' : 'GH₵')} title="Switch currency">{s.currencyUnit}</button>
            <select aria-label="Theme" value={s.theme} onChange={(e) => s.setTheme(e.target.value as ThemeName)}>{THEMES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
        </header>
        <main className="page-content"><Outlet /></main>
        <footer className="app-footer">{DISCLAIMER}</footer>
      </div>
      <nav className="bottom-nav" aria-label="Pages">{navItems.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `bn-item ${isActive ? 'active' : ''}`}><Icon name={icon} size={22} /><span>{label}</span></NavLink>)}</nav>
    </div>
  )
}
