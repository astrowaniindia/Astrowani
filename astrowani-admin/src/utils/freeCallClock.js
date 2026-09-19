// Clock times for the free-call window, as "HH:MM" (24-hour, IST). Mirrors the
// backend's parseClock (astrowani-backend/src/freeCallRoutes.js): reads "11:30",
// "24:00" (midnight), a whole hour (11) and the old "1130" form.
export function clockToMinutes(v) {
  if (v === null || v === undefined || v === '') return null;
  const str = String(v).trim();
  let h;
  let m;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(str);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (/^\d{3,4}$/.test(str)) {
    h = Math.floor(Number(str) / 100);
    m = Number(str) % 100;
  } else {
    const n = Number(str);
    if (!Number.isFinite(n)) return null;
    h = Math.floor(n);
    m = Math.round((n - h) * 60);
  }
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) return null;
  const t = h * 60 + m;
  return t <= 1440 ? t : null;
}

export const minutesToClock = (t) =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;

// "11:30" -> "11:30 AM", "24:00" -> "12:00 midnight"
export function prettyClock(v) {
  const t = clockToMinutes(v);
  if (t === null) return '—';
  if (t === 1440) return '12:00 midnight';
  const h = Math.floor(t / 60);
  const m = String(t % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}
