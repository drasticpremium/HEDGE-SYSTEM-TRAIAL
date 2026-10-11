import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CONTACT, waLink } from '../config'
import { Icon } from '../components/Icon'
import { Faq, FeatureCard, Reveal, Section, WhatsAppIcon } from '../components/ui'

const FAQ: [string, string][] = [
  ['What is Hedge Signal Desk?', 'It is a trading desk built around using a Quotex binary and an Exness position at the same time on EUR/USD. It watches the live market, gives clear signals at set times, logs every trade on both sides, and sends alerts to your phone.'],
  ['Does the site place real trades for me?', 'No. The site never connects to a broker and never places an order. You make every trade yourself, on your own accounts, in your own time.'],
  ['Can I make money with it?', 'No one can promise that. Binary options and leveraged forex carry a high risk of loss, and you can lose your whole stake. That is exactly why every result is recorded and measured instead of guessed.'],
  ['Will you share how the system works?', 'The method behind the system stays private. If you are interested in being part of the journey, get in touch and we will talk.'],
  ['Are you connected to Quotex or Exness?', 'No. They are independent third-party platforms. This project is not affiliated with, endorsed by or sponsored by either of them.'],
  ['Does it work on my phone?', 'Yes. The site is built for both laptop and phone, and you can install it like an app. Alerts can also reach you on Telegram.'],
  ['How do I get involved?', 'Send a message on WhatsApp or use the contact form below. Tell me a little about yourself and what you are looking for.'],
]

export function AboutPage() {
  const loc = useLocation(), [form, setForm] = useState({ name: '', phone: '', message: '' }), [sent, setSent] = useState(false)
  useEffect(() => { if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }, [loc.hash])
  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const text = `Hello, my name is ${form.name.trim()}${form.phone.trim() ? ` (${form.phone.trim()})` : ''}.\n\n${form.message.trim()}`
    window.open(waLink(CONTACT.phones[0].wa, text), '_blank', 'noopener'); setSent(true)
  }
  return (
    <div className="about">
      <header className="about-hero">
        <span className="eyebrow rise" style={{ animationDelay: '0ms' }}>Hedge Signal Desk</span>
        <h1 className="rise" style={{ animationDelay: '80ms' }}>Two platforms. One disciplined system.</h1>
        <p className="lead rise" style={{ animationDelay: '160ms' }}>Hedge Signal Desk watches the live EUR/USD market and runs a Quotex binary and an Exness position side by side, so every decision is tracked, measured and accountable. I am building it in the open and I am looking for people who want to ride this journey with me.</p>
        <div className="cta-row rise" style={{ animationDelay: '240ms' }}>
          <a className="btn primary" href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }) }}>Join the journey</a>
          <a className="btn wa" href={waLink(CONTACT.phones[0].wa)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} /> Message on WhatsApp</a>
        </div>
      </header>

      <Reveal><div className="trust">
        {[['spark', 'Live market data', 'Decisions use real EUR/USD prices, not simulations.'], ['log', 'Every cycle logged', 'Both sides recorded separately, with exportable results.'], ['bell', 'Instant alerts', 'Signals and results reach Telegram and your phone.'], ['server', 'Runs on its own', 'The server keeps working while you are away.']].map(([i, t, d]) => (
          <div key={t} className="trust-item"><Icon name={i} size={22} /><div><strong>{t}</strong><span>{d}</span></div></div>))}
      </div></Reveal>

      <Section id="what" eyebrow="What it is for" title="Built to trade two platforms as one" lead="The desk exists for one idea: using a Quotex binary and an Exness position at the same time, and managing them together instead of as two separate bets.">
        <div className="card-grid">
          <FeatureCard icon="desk" title="Binary + Exness together" delay={0}>The system is designed around running a Quotex binary and an opposite Exness position at the same time.</FeatureCard>
          <FeatureCard icon="auto" title="Signals on schedule" delay={70}>Clear signals at set times, with everything you need to act: side, size and levels, in a simple card.</FeatureCard>
          <FeatureCard icon="performance" title="Honest measurement" delay={140}>Binary and Exness results are tracked side by side, so you can see what is really working.</FeatureCard>
          <FeatureCard icon="copy" title="Signal-source testing" delay={210}>Follow a Telegram signal source and test it on real prices before you ever trust it.</FeatureCard>
          <FeatureCard icon="bell" title="Phone and laptop" delay={280}>Install it like an app and get alerts wherever you are, including Telegram.</FeatureCard>
          <FeatureCard icon="shield" title="You stay in control" delay={350}>Nothing is ever placed for you. You decide what to trade, where and when.</FeatureCard>
        </div>
      </Section>

      <Section id="about" eyebrow="About the project" title="A journey, not a hype">
        <Reveal><div className="about-copy">
          <p>Hedge Signal Desk began as a personal tool to take emotion out of trading two platforms at once. It grew into a full desk with live data, automatic logging and alerts, built so that results can be checked instead of trusted blindly.</p>
          <p>I am putting together a small circle of people who like a systematic, measured approach and want to be part of what comes next. The method itself stays private. If this sounds interesting to you, contact me and let's talk.</p>
        </div></Reveal>
        <div className="steps-row">
          {[['1', 'Say hello', 'Message me on WhatsApp or use the form below.'], ['2', 'Let us talk', 'Tell me about yourself and what you are looking for.'], ['3', 'Join the journey', 'If we fit, you ride along with me from there.']].map(([n, t, d], i) => (
            <Reveal key={n} delay={i * 90}><div className="step"><span className="step-n">{n}</span><h3>{t}</h3><p>{d}</p></div></Reveal>))}
        </div>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Questions people ask"><Reveal><Faq items={FAQ} /></Reveal></Section>

      <Section id="contact" eyebrow="Contact" title="Interested? Let's talk." lead="Message me directly. I usually reply fastest on WhatsApp.">
        <div className="contact-grid">
          <Reveal><div className="contact-cards">
            {CONTACT.phones.map((p) => (
              <div key={p.tel} className="contact-card"><strong>{p.display}</strong>
                <div className="cta-row"><a className="btn wa" href={waLink(p.wa)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={18} /> WhatsApp</a><a className="btn" href={`tel:${p.tel}`}><Icon name="phone" size={18} /> Call</a></div></div>))}
            {CONTACT.email && <div className="contact-card"><strong>{CONTACT.email}</strong><div className="cta-row"><a className="btn" href={`mailto:${CONTACT.email}`}><Icon name="mail" size={18} /> Email</a></div></div>}
          </div></Reveal>
          <Reveal delay={90}><form className="contact-form" onSubmit={send}>
            <label>Your name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
            <label>Phone (optional)<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></label>
            <label>Message<textarea required rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Tell me a little about yourself and what you are looking for." /></label>
            <button type="submit" className="btn primary">Send on WhatsApp</button>
            {sent && <p className="ok-note" role="status">Opening WhatsApp with your message. Just press send there.</p>}
          </form></Reveal>
        </div>
      </Section>
    </div>
  )
}
