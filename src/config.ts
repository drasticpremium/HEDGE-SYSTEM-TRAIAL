/** Contact details shown on the About page, footer and WhatsApp button. Add an email here to show it everywhere. */
export const CONTACT = {
  phones: [
    { display: '+233 55 490 4636', tel: '+233554904636', wa: '233554904636' },
    { display: '+233 55 631 6494', tel: '+233556316494', wa: '233556316494' },
  ],
  email: 'drasticpremium@gmail.com',
}
export const waLink = (number: string, text = 'Hello, I would like to know more about Hedge Signal Desk.') => `https://wa.me/${number}?text=${encodeURIComponent(text)}`
