/**
 * The reading on each sign horoscope page (aw/horoscope-pages.js).
 *
 * The sign comes from data-sign on #sign-reading; the language from <html lang>.
 * The reading itself is astroHoroscopeReading() in astro-engine.js — the same
 * function horoscope.html uses, so a sign gets the same reading on both pages.
 * Needs astro-engine.js loaded first.
 */
document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('sign-reading');
  if (!root || typeof astroHoroscopeReading !== 'function') return;
  const sign = root.getAttribute('data-sign');
  const lang = document.documentElement.lang === 'hi' ? 'hi' : 'en';
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const $ = (id) => document.getElementById(id);

  function referenceDate(period) {
    const d = new Date();
    if (period === 'tomorrow') d.setDate(d.getDate() + 1);
    return d;
  }

  function dateLabel(period, d) {
    if (period === 'yearly') return String(d.getFullYear());
    if (period === 'monthly') return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    if (period === 'weekly') {
      // Monday to Sunday of the week containing d.
      const start = new Date(d); start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const o = { day: 'numeric', month: 'short' };
      return `${start.toLocaleDateString(locale, o)} – ${end.toLocaleDateString(locale, o)}`;
    }
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function render(period) {
    const d = referenceDate(period);
    const { sentence, meters } = astroHoroscopeReading(sign, d, period, lang);
    $('sign-sentence').textContent = sentence;
    $('sign-date').textContent = dateLabel(period, d);
    for (const k of ['love', 'career', 'money', 'health']) $(`sign-meter-${k}`).style.width = `${meters[k]}%`;
    root.querySelectorAll('[data-period]').forEach((b) => {
      const on = b.getAttribute('data-period') === period;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-period]');
    if (b) render(b.getAttribute('data-period'));
  });
  render('daily');
});
