import { useState } from 'react'
/** The admin token is only kept for this browser tab (sessionStorage). */
export function AdminToken() {
  const [t, setT] = useState<string>(sessionStorage.adminToken ?? '')
  return <input type="password" placeholder="Admin token" value={t} onChange={(e) => { setT(e.target.value); sessionStorage.adminToken = e.target.value }} />
}
