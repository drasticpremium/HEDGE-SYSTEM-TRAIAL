import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="panel card">
      <h2>Page not found</h2>
      <p>This route does not exist in the current desk.</p>
      <Link to="/" className="nav-link inline-link">Back home</Link>
    </div>
  )
}
