import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from './Logo'

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/desk', label: 'Live Desk' },
  { to: '/auto', label: 'Auto' },
  { to: '/charts', label: 'Charts' },
  { to: '/log', label: 'Trade Log' },
  { to: '/performance', label: 'Performance' },
  { to: '/accuracy', label: 'Accuracy' },
  { to: '/settings', label: 'Settings' },
  { to: '/about', label: 'About' },
]

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <Logo />
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <footer className="site-footer">
          Educational tool, paper trading only, not financial advice. Binary options and leveraged forex carry a high risk of loss.
        </footer>
      </aside>

      <div className="content-panel">
        <header className="topbar">
          <Logo />
        </header>
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          Educational tool, paper trading only, not financial advice. Binary options and leveraged forex carry a high risk of loss.
        </footer>
      </div>
    </div>
  )
}
