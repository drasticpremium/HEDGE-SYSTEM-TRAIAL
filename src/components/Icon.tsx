const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z', desk: 'M3 5h18v11H3zM8 20h8M12 16v4', auto: 'M13 2L4 14h7l-1 8 9-12h-7z',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  bell: 'M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0',
  charts: 'M6 4v16M4 8h4v6H4zM14 2v18M12 6h4v8h-4zM20 7v13M18 10h4v6h-4z', log: 'M5 4h14v16H5zM8 9h8M8 13h8M8 17h5', performance: 'M3 17l6-6 4 4 8-9M15 6h6v6',
  accuracy: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z', settings: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M8 10v4M18 16v4', about: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5',
}
export const Icon = ({ name, size = 20 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>
)
