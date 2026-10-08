import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
createRoot(document.getElementById('root')!).render(<App />)

if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js')
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); (window as any).__installPrompt = e })
