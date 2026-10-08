import { useState } from 'react'
import { notify, useNotify, type Prefs } from '../store/notify'
import { useServer } from '../store/server'

export function AlertsPage() {
  const { prefs, setPref } = useNotify(), srv = useServer((s) => s.data), control = useServer((s) => s.control)
  const [perm, setPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission), [token, setToken] = useState(sessionStorage.adminToken ?? ''), [msg, setMsg] = useState('')
  const toggle = (k: keyof Prefs, label: string) => <label className="watch-item"><input type="checkbox" checked={prefs[k]} onChange={(e) => setPref(k, e.target.checked)} /> {label}</label>
  const ask = async () => { if (typeof Notification !== 'undefined') setPerm(await Notification.requestPermission()) }
  const install = async () => { const p = (window as any).__installPrompt; if (p) { p.prompt(); (window as any).__installPrompt = null } else setMsg('To install: Chrome/Edge menu > Install app. On iPhone: Share > Add to Home Screen.') }
  return (
    <div className="page-grid">
      <section className="panel card"><h2>In-site pop-ups</h2>
        {toggle('signals', 'New trade signals')}{toggle('cycles', 'Closed cycles (profit or loss)')}{toggle('hourly', 'Hourly P&L report (09:00-17:00 GMT, Mon-Fri)')}{toggle('browser', 'System notifications (desktop and phone)')}{toggle('sound', 'Sound')}
        <p>System notification permission: <strong>{perm}</strong></p>
        <div className="button-row"><button type="button" className="btn" onClick={ask}>Allow notifications</button><button type="button" className="btn" onClick={() => notify('Test alert', 'If you can see this, pop-ups work.', 'ok')}>Send test pop-up</button></div>
        <p className="mut">Pop-ups appear while the site or the installed app is open. For alerts when it is closed, use Telegram below.</p></section>
      <section className="panel card"><h2>Install as an app</h2>
        <p>Install it so it opens like a normal app on your laptop or phone, with its own icon and notifications.</p>
        <button type="button" className="btn primary" onClick={install}>Install app</button>
        <p className="mut">Android and desktop Chrome/Edge: use the button or the browser menu. iPhone: Share, then Add to Home Screen (notifications need iOS 16.4 or newer and the installed app).</p></section>
      <section className="panel card wide"><h2>Telegram alerts (works with the site closed, on phone and desktop)</h2>
        <p>Status: <strong className={srv?.telegram ? 'up' : 'down'}>{srv?.telegram ? 'Connected' : 'Not set up'}</strong>. The server sends every new signal, every closed cycle, and an hourly profit/loss report.</p>
        <ol className="steps"><li>In Telegram, open <b>@BotFather</b>, send <code>/newbot</code>, follow the prompts and copy the token.</li>
          <li>Open your new bot and press Start, then send it any message.</li>
          <li>In a browser open <code>https://api.telegram.org/bot&lt;YOUR_TOKEN&gt;/getUpdates</code> and find <code>"chat":{'{'}"id":123456789</code>. That number is your chat id.</li>
          <li>In Cloudflare, Settings, <b>Runtime variables and secrets</b>, add secrets <code>TELEGRAM_BOT_TOKEN</code> and <code>TELEGRAM_CHAT_ID</code>, then Deploy.</li>
          <li>Enter your admin token below and press the test button.</li></ol>
        <div className="button-row"><input type="password" placeholder="Admin token" value={token} onChange={(e) => setToken(e.target.value)} /><button type="button" className="btn" onClick={async () => { sessionStorage.adminToken = token; setMsg((await control({ action: 'telegram_test' }, token)) || 'Done') }}>Send Telegram test</button></div>
        {msg && <p>{msg}</p>}
        <p className="mut">WhatsApp is not offered: it needs a paid business account and Meta approval. Telegram is free and reliable.</p></section>
    </div>
  )
}
