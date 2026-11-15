/**
 * The wiring for every free calculator.
 *
 * Loaded by calculators.html (all twelve cards plus the index and the
 * "needs a full birth chart" grid) and by each of the twelve single-calculator
 * pages that aw/calculator-pages.js generates (one card each). Every block is
 * guarded by its own button, so a page carries only the cards it shows.
 *
 * It used to be inline in calculators.html. It moved here so the twelve pages
 * run the exact same code instead of twelve copies of it drifting apart.
 * Needs astro-engine.js and script.js (ASTROWANI_NAV_ARROW) loaded first.
 */
document.addEventListener('DOMContentLoaded', () => {

  const CALC_LIST = [
    ['Love Calculator', 'love-calculator.html'], ['Numerology Calculator', 'numerology-calculator.html'], ['Rising Sign Calculator', 'rising-sign-calculator.html'],
    ['Dasha Calculator', '#dasha'], ['Mangal Dosha Calculator', '#mangal-dosha'], ['Moon Phase Calculator', 'moon-phase-calculator.html'],
    ['Flames Calculator', 'flames-calculator.html'], ['Friendship Calculator', 'friendship-calculator.html'], ['Ishta Devata Calculator', '#ishta-devata'],
    ['Transit Chart Calculator', '#transit-chart'], ['Atmakaraka & Darakaraka', '#atmakaraka'], ['Sun Sign Calculator', 'sun-sign-calculator.html'],
    ['Rashi Calculator', 'rashi-calculator.html'], ['Nakshatra Calculator', 'nakshatra-calculator.html'], ['Shani Sade Sati Calculator', '#sade-sati'],
    ['Birth/Natal Chart', '#natal-chart'], ['Lucky Vehicle Number', 'lucky-vehicle-number-calculator.html'], ['Kaal Sarp Dosh Calculator', '#kaal-sarp'],
    ['Lo Shu Grid Calculator', 'lo-shu-grid-calculator.html'], ['Name Compatibility', 'name-compatibility-calculator.html'],
  ];
  if (document.getElementById('calc-index')) document.getElementById('calc-index').innerHTML = CALC_LIST.map(([label, href]) =>
    `<a class="tool-index-chip" href="${href}">${label}${ASTROWANI_NAV_ARROW}</a>`).join('');

  const ADVANCED = [
    ['Dasha Calculator', 'dasha', 'Your Vimshottari Dasha timeline (which planet rules which years of your life) depends on the Moon\'s exact nakshatra position at birth.'],
    ['Mangal Dosha Calculator', 'mangal-dosha', 'Checking for Mangal Dosha needs Mars\'s exact house placement in your precise birth chart.'],
    ['Ishta Devata Calculator', 'ishta-devata', 'Your Ishta Devata (guiding deity) is derived from the Atmakaraka and the full strength of every planet in your chart.'],
    ['Transit Chart Calculator', 'transit-chart', 'A transit chart compares today\'s real planetary positions against your natal chart — both need a live ephemeris.'],
    ['Atmakaraka & Darakaraka Calculator', 'atmakaraka', 'These are found by ranking every planet\'s degree within its sign — it needs all nine graha positions at once.'],
    ['Shani Sade Sati Calculator', 'sade-sati', 'Sade Sati timing depends on precisely where Saturn transits relative to your natal Moon sign.'],
    ['Birth/Natal Chart', 'natal-chart', 'A full birth chart plots all nine planets across all twelve houses — the complete picture, not a single number.'],
    ['Kaal Sarp Dosh Calculator', 'kaal-sarp', 'This checks whether every planet falls between Rahu and Ketu — it needs all nine positions calculated together.'],
  ];
  if (document.getElementById('advanced-calc-grid')) document.getElementById('advanced-calc-grid').innerHTML = ADVANCED.map(([title, id, desc]) => `
    <div class="svc-tile" id="${id}" style="min-height:0;">
      <div class="svc-tile-top" style="max-width:100%;">
        <div class="svc-title">${title}</div>
        <div class="svc-desc" style="margin-bottom:16px;">${desc}</div>
        <div class="calc-advanced-note">Get this calculated precisely, live, by a verified astrologer.<br><a href="consult.html?mode=chat">Chat with an astrologer &rarr;</a></div>
      </div>
    </div>`).join('');

  // ---------- wiring ----------
  const $ = (id) => document.getElementById(id);
  const show = (id) => $(id).classList.add('is-visible');

  if ($('love-btn')) $('love-btn').addEventListener('click', () => {
    const n1 = $('love-name1').value.trim(), n2 = $('love-name2').value.trim();
    if (!n1 || !n2) return;
    const pct = astroLoveScore(n1, n2);
    $('love-pct').textContent = pct + '% match';
    $('love-sub').textContent = `${n1} & ${n2} — ${pct >= 75 ? 'a strong connection!' : pct >= 45 ? 'a promising spark.' : 'opposites finding their rhythm.'}`;
    $('love-bar').style.width = pct + '%';
    show('love-result');
  });

  if ($('flames-btn')) $('flames-btn').addEventListener('click', () => {
    const n1 = $('flames-name1').value.trim(), n2 = $('flames-name2').value.trim();
    if (!n1 || !n2) return;
    const { letter, label } = astroFlames(n1, n2);
    $('flames-letters').innerHTML = ['F', 'L', 'A', 'M', 'E', 'S'].map((l) =>
      `<div class="flames-letter${l === letter ? ' is-winner' : ''}">${l}</div>`).join('');
    $('flames-label').textContent = label;
    show('flames-result');
  });

  if ($('friend-btn')) $('friend-btn').addEventListener('click', () => {
    const n1 = $('friend-name1').value.trim(), n2 = $('friend-name2').value.trim();
    if (!n1 || !n2) return;
    const pct = astroFriendshipScore(n1, n2);
    $('friend-pct').textContent = pct + '% friendship score';
    $('friend-bar').style.width = pct + '%';
    show('friend-result');
  });

  if ($('nc-btn')) $('nc-btn').addEventListener('click', () => {
    const n1 = $('nc-name1').value.trim(), n2 = $('nc-name2').value.trim();
    if (!n1 || !n2) return;
    const { n1: a, n2: b, pct } = astroNameCompatibility(n1, n2);
    $('nc-pct').textContent = pct + '% harmony';
    $('nc-sub').textContent = `${n1} (number ${a}) & ${n2} (number ${b})`;
    show('nc-result');
  });

  if ($('num-btn')) $('num-btn').addEventListener('click', () => {
    const dob = $('num-dob').value; if (!dob) return;
    const lp = astroLifePathNumber(dob); if (!lp) return;
    $('num-value').textContent = `Life Path Number ${lp}`;
    $('num-sub').textContent = ASTRO_LIFE_PATH_MEANINGS[lp] || '';
    show('num-result');
  });

  if ($('loshu-btn')) $('loshu-btn').addEventListener('click', () => {
    const dob = $('loshu-dob').value; if (!dob) return;
    const r = astroLoShuGrid(dob); if (!r) return;
    $('loshu-table').innerHTML = r.grid.map((row) => `<tr>${row.map((c) => `<td>${c || '&nbsp;'}</td>`).join('')}</tr>`).join('');
    $('loshu-missing').textContent = r.missing.length ? `Missing numbers: ${r.missing.join(', ')}` : 'No missing numbers — a complete grid!';
    show('loshu-result');
  });

  if ($('sun-btn')) $('sun-btn').addEventListener('click', () => {
    const dob = $('sun-dob').value; if (!dob) return;
    const d = new Date(dob + 'T12:00:00');
    const z = astroSunSign(d.getMonth() + 1, d.getDate());
    $('sun-value').textContent = `${z.symbol} ${z.name}`;
    $('sun-sub').textContent = `${z.element} sign, ruled by ${z.lord}.`;
    show('sun-result');
  });

  if ($('moon-btn')) $('moon-btn').addEventListener('click', () => {
    const dateStr = $('moon-date').value; if (!dateStr) return;
    const r = astroMoonPhase(new Date(dateStr + 'T12:00:00'));
    $('moon-value').textContent = `${r.icon} ${r.name}`;
    $('moon-sub').textContent = `${r.illumination}% illuminated, day ${r.days} of the lunar cycle.`;
    show('moon-result');
  });

  if ($('lucky-btn')) $('lucky-btn').addEventListener('click', () => {
    const dob = $('lucky-dob').value; if (!dob) return;
    const r = astroLuckyVehicleNumbers(dob); if (!r) return;
    $('lucky-value').textContent = r.digits.join(', ');
    $('lucky-sub').textContent = `Based on Life Path Number ${r.lifePath} — these digits are considered most harmonious for you.`;
    show('lucky-result');
  });

  const citySel = $('asc-city');
  if (citySel) citySel.innerHTML = ASTRO_CITIES.map((c) => `<option value="${c.name}">${c.name}</option>`).join('');
  if ($('asc-btn')) $('asc-btn').addEventListener('click', () => {
    const dob = $('asc-dob').value, time = $('asc-time').value || '12:00'; if (!dob) return;
    const city = ASTRO_CITIES.find((c) => c.name === citySel.value) || ASTRO_CITIES[0];
    const d = new Date(dob + 'T00:00:00');
    const r = astroAscendant(d, time, city.lat, city.lon, 5.5);
    $('asc-value').textContent = r.siderealSign;
    $('asc-sub').textContent = `Tropical Ascendant: ${r.tropicalSign} (${r.tropicalDeg.toFixed(1)}°) · Sidereal degree: ${r.siderealDeg.toFixed(1)}° · Birth place: ${city.name}`;
    show('asc-result');
  });

  if ($('rashi-btn')) $('rashi-btn').addEventListener('click', () => {
    const dob = $('rashi-dob').value, time = $('rashi-time').value || '12:00'; if (!dob) return;
    const [hh, mm] = time.split(':').map(Number);
    const d = new Date(dob + `T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
    const jd = astroJulianDay(d);
    const r = astroRashi(astroMoonLongitude(jd), d.getFullYear());
    $('rashi-value').textContent = r.name;
    $('rashi-sub').textContent = 'Computed from an approximate Moon position for your birth date and time (IST assumed).';
    show('rashi-result');
  });

  if ($('nak-btn')) $('nak-btn').addEventListener('click', () => {
    const dob = $('nak-dob').value, time = $('nak-time').value || '12:00'; if (!dob) return;
    const [hh, mm] = time.split(':').map(Number);
    const d = new Date(dob + `T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`);
    const r = astroNakshatra(d, d.getFullYear());
    $('nak-value').textContent = `${r.name}, Pada ${r.pada}`;
    $('nak-sub').textContent = 'Computed from an approximate Moon position for your birth date and time (IST assumed).';
    show('nak-result');
  });

});

