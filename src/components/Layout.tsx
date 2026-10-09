import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ErrorBoundary } from './ErrorBoundary'
import { Logo } from './Logo'
import { Icon } from './Icon'
import { PAIRS } from '../engine/pairs'
import { useAppStore, type ThemeName } from '../store/useAppStore'
import { useServer } from '../store/server'
import { NotifyWatcher, Toasts } from './NotifyWatcher'

const navItems = [
  ['/', 'Overview', 'home'], ['/desk', 'Live Desk', 'desk'], ['/server', 'Auto Trader', 'server'], ['/copy', 'Copy Trades', 'copy'], ['/alerts', 'Alerts', 'bell'], ['/charts', 'Charts', 'charts'], ['/log', 'Log', 'log'],
  ['/performance', 'Performance', 'performance'], ['/accuracy', 'Accuracy', 'accuracy'], ['/settings', 'Settings', 'settings'], ['/about', 'About', 'about'],
] as const
const THEMES: ThemeName[] = ['midnight', 'emerald', 'amber', 'violet', 'light', 'contrast']
const DISCLAIMER = 'Educational tool, paper trading only, not financial advice. Binary options and leveraged forex carry a high risk of loss.'

export function Layout() {
  const loc = useLocation(), s = useAppStore(), srv = useServer((x) => x.data), running = !!srv?.enabled, cycle = srv?.cycle ?? null
  return (
    <div className="app-shell">
      <NotifyWatcher /><Toasts />
      <aside className="sidebar">
        <div className="sidebar-top"><Logo /></div>
        <nav className="nav">{navItems.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon name={icon} />{label}</NavLink>)}</nav>
        <footer className="site-footer">{DISCLAIMER}</footer>
      </aside>
      <div className="content-panel">
        <header className="toolbar">
          <div className="mobile-only"><Logo /></div>
          <span className={`chip ${running ? 'chip-ok' : 'chip-warn'}`}><i className={running ? 'pulse' : ''} />{running ? (cycle ? `In trade: ${cycle.pair} ${cycle.dir}` : 'Auto trader watching') : 'Auto trader paused'}</span>
          <div className="toolbar-ctl">
            <select aria-label="Pair" value={s.pair} onChange={(e) => s.setPair(e.target.value)}>{PAIRS.map((p) => <option key={p}>{p}</option>)}</select>
            <button type="button" className="ghost" onClick={() => s.setCurrencyUnit(s.currencyUnit === 'GH₵' ? 'USD' : 'GH₵')} title="Switch currency">{s.currencyUnit}</button>
            <select aria-label="Theme" value={s.theme} onChange={(e) => s.setTheme(e.target.value as ThemeName)}>{THEMES.map((t) => <option key={t}>{t}</option>)}</select>
          </div>
        </header>
        <main className="page-content"><ErrorBoundary resetKey={loc.pathname}><Outlet /></ErrorBoundary></main>
        <footer className="app-footer">{DISCLAIMER}</footer>
      </div>
      <nav className="bottom-nav" aria-label="Pages">{navItems.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `bn-item ${isActive ? 'active' : ''}`}><Icon name={icon} size={22} /><span>{label}</span></NavLink>)}</nav>
    </div>
  )
}
