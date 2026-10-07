/** BUY = blue, SELL = red. Used for both the Quotex and the Exness side. */
export const Pill = ({ side }: { side: 'BUY' | 'SELL' }) => <span className={`pill ${side === 'BUY' ? 'pill-buy' : 'pill-sell'}`}>{side}</span>
