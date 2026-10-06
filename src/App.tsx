import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { seedHistoryIfEmpty } from './db/db'
import { AboutPage } from './pages/AboutPage'
import { AccuracyPage } from './pages/AccuracyPage'
import { AutoPage } from './pages/AutoPage'
import { ChartsPage } from './pages/ChartsPage'
import { DeskPage } from './pages/DeskPage'
import { LogPage } from './pages/LogPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OverviewPage } from './pages/OverviewPage'
import { PerformancePage } from './pages/PerformancePage'
import { SettingsPage } from './pages/SettingsPage'
import { useAppStore } from './store/useAppStore'

export default function App() {
  const theme = useAppStore((state) => state.theme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.title = 'Hedge Signal Desk'
    void seedHistoryIfEmpty()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OverviewPage />} />
          <Route path="/desk" element={<DeskPage />} />
          <Route path="/auto" element={<AutoPage />} />
          <Route path="/charts" element={<ChartsPage />} />
          <Route path="/log" element={<LogPage />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/accuracy" element={<AccuracyPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
