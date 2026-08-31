// astrowani-backend/src/freeCallRoutes.js
//
// Free 12-minute introductory call — the customer-facing booking API and the
// admin management API. Replaces the free 5-minute scripted bot chat.
//
// THE ONE RULE: the server decides which slots exist and which are free. The app
// renders what it is told and re-checks nothing, because a client cannot be the
// authority on a shared resource. Two customers tapping the same slot at the same
// instant are separated by a partial UNIQUE index in Postgres, not by a
// read-then-write check here — see sql/free_call_booking_schema.sql.
//
// WHAT THIS DELIBERATELY DOES NOT DO: place the call. The astrologer rings the
// customer directly on the phone number snapshotted at booking time. There is no
// session, no wallet, no billing anywhere in this file.

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { findCustomerByPhone } = require('./customerLookup');
const { requireAdmin } = require('./adminRoutes');

const JWT_SECRET = process.env.JWT_SECRET;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fxpoustnddrgumhwdcma.supabase.co';
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// The offer runs on Indian business hours regardless of where the phone is. Slot
// grids are generated against this offset and stored as real instants, so a
// customer whose device is in another timezone still books 3pm IST.
const FREE_CALL_TZ_OFFSET_MIN = 330; // IST, UTC+5:30

const DEFAULTS = {
  enabled: false,
  durationMinutes: 12,
  slotMinutes: 30,
  openHour: 10,
  closeHour: 20,
  daysAhead: 7,
  minLeadMinutes: 60,
  // WHO TAKES THE CALL, decided at the moment of booking:
  //   'manual' — nobody; the admin hands each one out.
  //   'single' — always assignedAstrologerId.
  //   'pool'   — split automatically across poolAstrologerIds, least-loaded first.
  // An admin can reassign any individual booking afterwards regardless of mode.
  //
  // The mode also sets how many customers one slot holds: 'pool' gives a slot as
  // many places as there are astrologers in the pool (two astrologers => two
  // people can both take 3pm), while the other two modes hold one.
  assignmentMode: 'manual',
  assignedAstrologerId: '',
  poolAstrologerIds: [],
  // The name/photo the CUSTOMER sees on the offer card. Deliberately separate
  // from the assignment above: assignment is internal routing, and in 'manual'
  // mode nobody is assigned yet when the customer is looking at the card.
  astrologerName: 'Acharya Vishal Sharma',
  astrologerImage: '',
  astrologerExperience: '15 years',
  astrologerSpecialities: 'Vedic Astrology, Career, Marriage',
  headerText: 'Your first 12-minute call is on us',
  bodyText: 'Pick a date and time that suits you. Our astrologer will call you directly — you do not have to do anything else.',
  ctaText: 'Book my free call',
  successText: 'Booked! Our astrologer will call you at the time you chose.',
};

const h = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[freeCallRoutes] ${req.method} ${req.path}:`, err.message);
  res.status(500).json({ success: false, message: 'Something went wrong' });
});

// "That table does not exist yet." PostgREST reports this as PGRST205 (its schema
// cache) rather than Postgres's own 42P01, and it answers with the former in
// practice — checking only 42P01 turned a not-yet-migrated database into a 500.
// Both are matched so this holds whichever layer reports it.
const isMissingTable = (error) =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205');

const clampInt = (v, lo, hi, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
};

/**
 * Reads and sanitises the offer config. Every numeric field is clamped, because
 * these come from a free-text admin JSON blob and a nonsense value (closeHour 99,
 * slotMinutes 0) would otherwise generate an infinite or empty slot grid.
 */
async function loadOffer() {
  let raw = null;
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', 'free_call_offer').limit(1);
    if (data && data.length) raw = data[0].value;
  } catch (_) { /* falls through to defaults */ }

  let parsed = {};
  if (raw) {
    try { parsed = JSON.parse(raw) || {}; } catch (_) { parsed = {}; }
  }
  const merged = { ...DEFAULTS, ...parsed };

  merged.enabled = merged.enabled === true || merged.enabled === 'true';
  merged.durationMinutes = clampInt(merged.durationMinutes, 1, 180, DEFAULTS.durationMinutes);
  merged.slotMinutes = clampInt(merged.slotMinutes, 5, 240, DEFAULTS.slotMinutes);
  merged.openHour = clampInt(merged.openHour, 0, 23, DEFAULTS.openHour);
  merged.closeHour = clampInt(merged.closeHour, 1, 24, DEFAULTS.closeHour);
  merged.daysAhead = clampInt(merged.daysAhead, 1, 60, DEFAULTS.daysAhead);
  merged.minLeadMinutes = clampInt(merged.minLeadMinutes, 0, 10080, DEFAULTS.minLeadMinutes);
  if (!['single', 'pool'].includes(merged.assignmentMode)) merged.assignmentMode = 'manual';
  if (typeof merged.assignedAstrologerId !== 'string') merged.assignedAstrologerId = '';
  if (!Array.isArray(merged.poolAstrologerIds)) merged.poolAstrologerIds = [];
  merged.poolAstrologerIds = merged.poolAstrologerIds.filter((id) => typeof id === 'string' && id);
  // An empty pool would mean a capacity of zero, i.e. nothing bookable at all.
  // Falling back to manual keeps the offer working and leaves the bookings in the
  // admin's queue, which is recoverable; a dead offer is not.
  if (merged.assignmentMode === 'pool' && merged.poolAstrologerIds.length === 0) {
    merged.assignmentMode = 'manual';
  }
  if (merged.closeHour <= merged.openHour) {
    merged.openHour = DEFAULTS.openHour;
    merged.closeHour = DEFAULTS.closeHour;
  }
  return merged;
}

/** JWT → the real customers row. Same pattern as orderRoutes/astroRoutes. */
async function resolveCustomer(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  let decoded;
  try {
    decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
  } catch (_) {
    return null;
  }
  let customer = null;
  if (decoded.phone) {
    customer = await findCustomerByPhone(db, decoded.phone, 'id, name, mobile');
  }
  const userId = decoded.userId || decoded._id || decoded.id;
  if (!customer && userId && String(userId).includes('-')) {
    const { data } = await db.from('customers').select('id, name, mobile').eq('id', userId).single();
    if (data) customer = data;
  }
  return customer;
}

/** Astrologer id from the vendor JWT. Same shape as remedyReferralRoutes. */
function resolveAstrologerId(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ', ''), JWT_SECRET);
    return decoded.astroId || decoded.vendorId || decoded.id || null;
  } catch (_) {
    return null;
  }
}

/* ─────────────────────────── slot grid arithmetic ────────────────────────────
 * All of this works in "business minutes since the UTC epoch", i.e. UTC shifted
 * by FREE_CALL_TZ_OFFSET_MIN. Doing it with local Date getters would silently
 * follow the SERVER's timezone, which is not necessarily India.
 */

/** 'YYYY-MM-DD' for an instant, in business time. */
function businessDateKey(instant) {
  const shifted = new Date(instant.getTime() + FREE_CALL_TZ_OFFSET_MIN * 60000);
  return shifted.toISOString().slice(0, 10);
}

/** A 'YYYY-MM-DD' + hour/minute in business time → the real UTC instant. */
function businessInstant(dateKey, hour, minute) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hour, minute, 0, 0);
  return new Date(asUtc - FREE_CALL_TZ_OFFSET_MIN * 60000);
}

/** The list of date keys the offer is currently open for, starting today. */
function offerDateKeys(offer, now = new Date()) {
  const keys = [];
  const todayKey = businessDateKey(now);
  const [y, m, d] = todayKey.split('-').map(Number);
  for (let i = 0; i < offer.daysAhead; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    keys.push(dt.toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * Every slot on one business date. A slot is offered only if it fits entirely
 * inside the working window (a 12-minute call cannot start at 19:55 when the day
 * closes at 20:00) and starts at least minLeadMinutes from now.
 */
function buildSlots(offer, dateKey, now = new Date()) {
  const out = [];
  const earliest = now.getTime() + offer.minLeadMinutes * 60000;
  const windowEnd = businessInstant(dateKey, offer.closeHour, 0).getTime();

  for (let mins = offer.openHour * 60; mins < offer.closeHour * 60; mins += offer.slotMinutes) {
    const start = businessInstant(dateKey, Math.floor(mins / 60), mins % 60);
    const end = new Date(start.getTime() + offer.durationMinutes * 60000);
    if (end.getTime() > windowEnd) continue;
    out.push({
      start,
      end,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      label: formatSlotLabel(start),
      past: start.getTime() < earliest,
    });
  }
  return out;
}

function formatSlotLabel(instant) {
  const shifted = new Date(instant.getTime() + FREE_CALL_TZ_OFFSET_MIN * 60000);
  let hh = shifted.getUTCHours();
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 === 0 ? 12 : hh % 12;
  return `${hh}:${mm} ${ampm}`;
}

/** Only approved, unsuspended astrologers may be handed new work. */
async function activeAstrologers(ids) {
  if (!ids || !ids.length) return [];
  const { data } = await db
    .from('astrologers')
    .select('id, first_name, last_name, approval_status, is_suspended')
    .in('id', ids);
  return (data || []).filter(
    (a) => !a.is_suspended && (!a.approval_status || a.approval_status === 'approved'),
  );
}

/**
 * How many customers one slot can hold. In pool mode this is the number of
 * ACTIVE pool members — the whole point of a pool is that adding an astrologer
 * adds capacity, rather than several astrologers sharing the same single place.
 * Suspending someone therefore reduces capacity, which is correct: an inactive
 * astrologer cannot take a call.
 */
async function slotCapacity(offer) {
  if (offer.assignmentMode !== 'pool') return 1;
  const active = await activeAstrologers(offer.poolAstrologerIds);
  return Math.max(1, active.length);
}

/**
 * The astrologers a new booking could go to, best candidate first. Empty means
 * "leave it unassigned", which is a normal outcome (manual mode), not an error.
 *
 * Pool ordering is LEAST-LOADED, not round-robin: it counts each member's live
 * upcoming bookings and puts the emptiest first. Least-loaded self-corrects when
 * a call is cancelled, reassigned or someone joins the pool late, whereas a
 * round-robin cursor drifts permanently out of balance the first time a booking
 * is cancelled. Over 100 bookings and two astrologers this lands on 50/50.
 *
 * Returns a LIST rather than one astrologer because the caller retries down it:
 * two customers booking the same slot at the same instant can both pick the same
 * emptiest astrologer, and the loser needs somewhere else to go.
 */
async function assigneeCandidates(offer) {
  try {
    if (offer.assignmentMode === 'single') {
      if (!offer.assignedAstrologerId) return [];
      const active = await activeAstrologers([offer.assignedAstrologerId]);
      if (!active.length) {
        console.warn('[freeCallRoutes] assigned astrologer is not active; booking left unassigned');
      }
      return active;
    }

    if (offer.assignmentMode === 'pool') {
      const active = await activeAstrologers(offer.poolAstrologerIds);
      if (!active.length) return [];

      // Live upcoming load per member. Only future, still-'booked' calls count —
      // completed and missed ones are finished work and must not keep pushing new
      // customers away from an astrologer forever.
      const { data: load } = await db
        .from('free_call_bookings')
        .select('astrologer_id')
        .eq('status', 'booked')
        .gte('slot_start', new Date().toISOString())
        .in('astrologer_id', active.map((a) => a.id));

      const counts = new Map(active.map((a) => [a.id, 0]));
      (load || []).forEach((r) => {
        if (counts.has(r.astrologer_id)) counts.set(r.astrologer_id, counts.get(r.astrologer_id) + 1);
      });
      return [...active].sort((a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0));
    }

    return [];
  } catch (_) {
    // Assignment is never worth failing a booking over — an unassigned booking
    // sits in the admin's queue and is one click from fixed.
    return [];
  }
}

const astrologerFullName = (a) =>
  a ? [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || null : null;

/** How many live bookings each slot already holds, keyed by slot instant. */
async function slotUsage(slots) {
  const used = new Map();
  if (!slots.length) return used;
  const { data } = await db
    .from('free_call_bookings')
    .select('slot_start')
    .neq('status', 'cancelled')
    .gte('slot_start', slots[0].startIso)
    .lte('slot_start', slots[slots.length - 1].startIso);
  (data || []).forEach((r) => {
    const k = new Date(r.slot_start).getTime();
    used.set(k, (used.get(k) || 0) + 1);
  });
  return used;
}

/** The customer's own live booking, if any. */
async function findLiveBooking(customerId) {
  const { data } = await db
    .from('free_call_bookings')
    .select('*')
    .eq('customer_id', customerId)
    .neq('status', 'cancelled')
    .order('slot_start', { ascending: false })
    .limit(1);
  return data && data.length ? data[0] : null;
}

/**
 * Eligibility: brand-new customers only — nobody who has ever had a session.
 * Fails CLOSED. If the sessions table can't be read we do not know whether this
 * customer is new, and wrongly handing out a free astrologer call is worse than
 * wrongly withholding an offer the customer can still be shown later.
 */
async function isNewCustomer(customerId) {
  try {
    const { count, error } = await db
      .from('chat_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('caller_id', customerId);
    if (error) return false;
    return (count || 0) === 0;
  } catch (_) {
    return false;
  }
}

const publicOffer = (offer) => ({
  enabled: offer.enabled,
  durationMinutes: offer.durationMinutes,
  astrologerName: offer.astrologerName,
  astrologerImage: offer.astrologerImage,
  astrologerExperience: offer.astrologerExperience,
  astrologerSpecialities: offer.astrologerSpecialities,
  headerText: offer.headerText,
  bodyText: offer.bodyText,
  ctaText: offer.ctaText,
  successText: offer.successText,
});

const publicBooking = (b) => b && ({
  id: b.id,
  slotStart: b.slot_start,
  slotEnd: b.slot_end,
  durationMinutes: b.duration_minutes,
  status: b.status,
  astrologerName: b.astrologer_name,
  label: `${formatSlotLabel(new Date(b.slot_start))}`,
  dateKey: businessDateKey(new Date(b.slot_start)),
});

module.exports = function registerFreeCallRoutes(app) {
  /* ── Customer: is the offer on, am I eligible, have I already booked? ────── */
  app.get('/api/free-call/offer', h(async (req, res) => {
    const offer = await loadOffer();
    if (!offer.enabled) {
      // A disabled offer is not an error — the app just shows nothing.
      return res.status(200).json({ success: true, enabled: false, eligible: false, booking: null });
    }
    const customer = await resolveCustomer(req);
    if (!customer) {
      return res.status(200).json({
        success: true, enabled: true, eligible: false, booking: null, offer: publicOffer(offer),
      });
    }
    const booking = await findLiveBooking(customer.id);
    const eligible = !booking && (await isNewCustomer(customer.id));
    return res.status(200).json({
      success: true,
      enabled: true,
      eligible,
      booking: publicBooking(booking),
      offer: publicOffer(offer),
    });
  }));

  /* ── Customer: the slot grid ──────────────────────────────────────────────
   * Returns every date the offer is open for and, for the requested date, every
   * slot with a `taken` flag. Taken slots are still returned rather than removed
   * so the app can grey them out — a customer seeing "3:00 PM — taken" trusts the
   * grid more than one where times silently vanish.
   */
  app.get('/api/free-call/slots', h(async (req, res) => {
    const offer = await loadOffer();
    if (!offer.enabled) return res.status(200).json({ success: true, enabled: false, dates: [], slots: [] });

    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const now = new Date();
    const dates = offerDateKeys(offer, now);
    const dateKey = dates.includes(req.query.date) ? req.query.date : dates[0];

    const slots = buildSlots(offer, dateKey, now);
    // A slot is full when it holds as many bookings as there are astrologers to
    // take them — one in single/manual mode, one per pool member in pool mode.
    const capacity = await slotCapacity(offer);
    const used = await slotUsage(slots);

    return res.status(200).json({
      success: true,
      enabled: true,
      date: dateKey,
      dates: dates.map((k) => ({ key: k, label: dateLabel(k) })),
      slots: slots.map((s) => ({
        start: s.startIso,
        end: s.endIso,
        label: s.label,
        taken: (used.get(s.start.getTime()) || 0) >= capacity,
        past: s.past,
      })),
    });
  }));

  /* ── Customer: book ───────────────────────────────────────────────────────
   * Validation order matters: eligibility and slot validity are checked before
   * the insert so the common refusals get a clear message, but the ACTUAL
   * anti-double-book guarantee is the unique index. A 23505 here is not a bug,
   * it is the race being caught correctly.
   */
  app.post('/api/free-call/book', h(async (req, res) => {
    const offer = await loadOffer();
    if (!offer.enabled) {
      return res.status(403).json({ success: false, code: 'OFFER_CLOSED', message: 'This offer is no longer available.' });
    }
    const customer = await resolveCustomer(req);
    if (!customer) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const existing = await findLiveBooking(customer.id);
    if (existing) {
      return res.status(409).json({
        success: false, code: 'ALREADY_BOOKED',
        message: 'You have already booked your free call.',
        booking: publicBooking(existing),
      });
    }
    if (!(await isNewCustomer(customer.id))) {
      return res.status(403).json({
        success: false, code: 'NOT_ELIGIBLE',
        message: 'This offer is for first-time customers only.',
      });
    }

    const startIso = req.body?.slotStart;
    const start = startIso ? new Date(startIso) : null;
    if (!start || isNaN(start.getTime())) {
      return res.status(400).json({ success: false, code: 'BAD_SLOT', message: 'Pick a time slot.' });
    }

    // The slot must be one this server would actually offer — never trust a
    // timestamp from the body. This rejects hand-crafted 3am slots outright.
    const now = new Date();
    const dateKey = businessDateKey(start);
    if (!offerDateKeys(offer, now).includes(dateKey)) {
      return res.status(400).json({ success: false, code: 'BAD_SLOT', message: 'That date is not open for booking.' });
    }
    const match = buildSlots(offer, dateKey, now).find((s) => s.start.getTime() === start.getTime());
    if (!match) {
      return res.status(400).json({ success: false, code: 'BAD_SLOT', message: 'That time is not available.' });
    }
    if (match.past) {
      return res.status(409).json({ success: false, code: 'SLOT_PAST', message: 'That time has passed. Please pick another.' });
    }

    const baseRow = {
      customer_id: customer.id,
      slot_start: match.startIso,
      slot_end: match.endIso,
      duration_minutes: offer.durationMinutes,
      status: 'booked',
      customer_name: customer.name || null,
      customer_phone: customer.mobile || null,
      // The name the customer was SHOWN on the offer card. Not the assignee —
      // see the DEFAULTS note. Snapshotted so editing the offer later never
      // rewrites what a past customer was promised.
      astrologer_name: offer.astrologerName || null,
    };

    // Candidates are ordered emptiest-first. We walk down them because the
    // database, not this code, is what decides whether an astrologer is free at
    // this slot: a 23505 on the (slot_start, astrologer_id) index means someone
    // else just took that astrologer's place, so we try the next one. `null` is
    // the final attempt — manual mode, or a pool that is genuinely full.
    const candidates = await assigneeCandidates(offer);
    const attempts = candidates.length ? candidates.map((a) => a.id) : [null];

    let data = null;
    let lastError = null;
    for (const astrologerId of attempts) {
      const result = await db
        .from('free_call_bookings')
        .insert({ ...baseRow, astrologer_id: astrologerId })
        .select('*')
        .single();

      if (!result.error) { data = result.data; break; }
      lastError = result.error;

      if (result.error.code === '23505') {
        // Losing the per-customer race is terminal: they already have a booking,
        // and no other astrologer changes that.
        if (String(result.error.message).includes('customer_live_uniq')) break;
        continue; // that astrologer is busy at this slot — try the next.
      }
      break; // anything else is a real failure, not a race.
    }

    if (!data) {
      const error = lastError;
      if (error && error.code === '23505') {
        if (String(error.message).includes('customer_live_uniq')) {
          const mine = await findLiveBooking(customer.id);
          return res.status(409).json({
            success: false, code: 'ALREADY_BOOKED',
            message: 'You have already booked your free call.',
            booking: publicBooking(mine),
          });
        }
        // Every candidate was busy at this slot, so the slot really is full.
        return res.status(409).json({
          success: false, code: 'SLOT_TAKEN',
          message: 'Someone just booked that slot. Please pick another time.',
        });
      }
      if (isMissingTable(error)) {
        console.error('[freeCallRoutes] free_call_bookings table missing — run sql/free_call_booking_schema.sql');
        return res.status(503).json({ success: false, message: 'Booking is not available yet.' });
      }
      throw new Error(error ? error.message : 'Booking failed');
    }

    return res.status(201).json({ success: true, booking: publicBooking(data), message: offer.successText });
  }));

  /* ── Admin: list, with search + filters + real-calendar sorting ──────────── */
  app.get('/api/admin/free-call-bookings', requireAdmin, h(async (req, res) => {
    const { status, from, to, q } = req.query;
    const limit = clampInt(req.query.limit, 1, 500, 200);

    // The joined astrologer is the ASSIGNEE (who makes the call), which is a
    // different thing from the astrologer_name column (what the customer was
    // shown on the offer card). The admin table shows both.
    let query = db
      .from('free_call_bookings')
      .select('*, assignee:astrologer_id (id, first_name, last_name, phone_number)', { count: 'exact' });
    if (status && status !== 'all') query = query.eq('status', status);
    if (req.query.astrologerId === 'unassigned') query = query.is('astrologer_id', null);
    else if (req.query.astrologerId) query = query.eq('astrologer_id', req.query.astrologerId);
    if (from) query = query.gte('slot_start', new Date(from).toISOString());
    if (to) {
      // `to` is an inclusive calendar day from a date input, so extend to its end.
      const end = new Date(to);
      end.setUTCHours(23, 59, 59, 999);
      query = query.lte('slot_start', end.toISOString());
    }
    if (q) {
      const term = `%${String(q).trim()}%`;
      query = query.or(`customer_name.ilike.${term},customer_phone.ilike.${term},astrologer_name.ilike.${term},admin_note.ilike.${term}`);
    }

    // Upcoming first: the admin's job is the next call, not the oldest one.
    const { data, error, count } = await query.order('slot_start', { ascending: false }).limit(limit);
    if (error) {
      // The admin page renders a "run the migration" banner off `tableMissing`,
      // so this must be a 200 with a flag, not an error the page can only show
      // as a generic failure.
      if (isMissingTable(error)) {
        return res.status(200).json({ success: true, bookings: [], total: 0, tableMissing: true });
      }
      throw new Error(error.message);
    }

    return res.status(200).json({
      success: true,
      total: count || 0,
      bookings: (data || []).map((b) => ({
        ...b,
        assigneeName: astrologerFullName(b.assignee),
        slotLabel: formatSlotLabel(new Date(b.slot_start)),
        dateKey: businessDateKey(new Date(b.slot_start)),
      })),
    });
  }));

  /* ── Admin: mark done / missed / cancelled, reschedule, add a note ────────
   * Rescheduling goes through the SAME unique index as customer booking, so an
   * admin cannot move a booking onto a slot another customer already holds.
   */
  app.patch('/api/admin/free-call-bookings/:id', requireAdmin, h(async (req, res) => {
    const { status, slotStart, adminNote, astrologerId } = req.body || {};
    const patch = {};

    // `astrologerId: null` unassigns. Any approved, unsuspended astrologer can be
    // given a booking — this is the "admin decides who handles it" control, and
    // it works whether the offer is in single or manual mode.
    if (astrologerId !== undefined) {
      if (astrologerId === null || astrologerId === '') {
        patch.astrologer_id = null;
      } else {
        const { data: astro } = await db
          .from('astrologers')
          .select('id, is_suspended, approval_status')
          .eq('id', astrologerId)
          .single();
        if (!astro) return res.status(400).json({ success: false, message: 'Unknown astrologer' });
        if (astro.is_suspended || (astro.approval_status && astro.approval_status !== 'approved')) {
          return res.status(400).json({
            success: false,
            message: 'That astrologer is suspended or not approved, so cannot be given bookings.',
          });
        }
        patch.astrologer_id = astro.id;
      }
    }

    if (status !== undefined) {
      if (!['booked', 'completed', 'missed', 'cancelled'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      patch.status = status;
      patch.completed_at = status === 'completed' ? new Date().toISOString() : null;
    }
    if (adminNote !== undefined) patch.admin_note = adminNote;

    const { data: current, error: readErr } = await db
      .from('free_call_bookings').select('*').eq('id', req.params.id).single();
    if (readErr || !current) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (slotStart) {
      const start = new Date(slotStart);
      if (isNaN(start.getTime())) return res.status(400).json({ success: false, message: 'Invalid time' });
      const offer = await loadOffer();
      patch.slot_start = start.toISOString();
      patch.slot_end = new Date(start.getTime() + (current.duration_minutes || offer.durationMinutes) * 60000).toISOString();
      // Only stamp the original the FIRST time, so it keeps meaning "when the
      // customer was originally promised", not "the previous admin edit".
      if (!current.rescheduled_from) patch.rescheduled_from = current.slot_start;
      patch.reschedule_count = (current.reschedule_count || 0) + 1;
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }

    const { data, error } = await db
      .from('free_call_bookings').update(patch).eq('id', req.params.id)
      .select('*, assignee:astrologer_id (id, first_name, last_name, phone_number)').single();
    if (error) {
      if (error.code === '23505') {
        // With one booking per astrologer per slot, a clash now means "that
        // astrologer already has a call at that time", not "the slot is gone".
        return res.status(409).json({
          success: false, code: 'SLOT_TAKEN',
          message: patch.astrologer_id !== undefined
            ? 'That astrologer already has a free call at this time.'
            : 'That astrologer already has a call at the new time. Assign someone else, or pick another slot.',
        });
      }
      throw new Error(error.message);
    }

    return res.status(200).json({
      success: true,
      booking: {
        ...data,
        assigneeName: astrologerFullName(data.assignee),
        slotLabel: formatSlotLabel(new Date(data.slot_start)),
        dateKey: businessDateKey(new Date(data.slot_start)),
      },
    });
  }));

  /* ── Vendor: my assigned free calls ───────────────────────────────────────
   * The astrologer_id comes from the verified vendor JWT, never the query — an
   * astrologer must not be able to read another's list, which here means reading
   * customers' phone numbers.
   *
   * Returns upcoming calls first. Past ones are kept for a week so an astrologer
   * who forgot to mark one done can still find it.
   */
  app.get('/api/vendor/free-call-bookings', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from('free_call_bookings')
      .select('*')
      .eq('astrologer_id', astrologerId)
      .neq('status', 'cancelled')
      .gte('slot_start', since)
      .order('slot_start', { ascending: true });

    if (error) {
      if (isMissingTable(error)) return res.status(200).json({ success: true, bookings: [] });
      throw new Error(error.message);
    }

    const now = Date.now();
    return res.status(200).json({
      success: true,
      bookings: (data || []).map((b) => ({
        id: b.id,
        slotStart: b.slot_start,
        slotEnd: b.slot_end,
        durationMinutes: b.duration_minutes,
        status: b.status,
        customerName: b.customer_name,
        customerPhone: b.customer_phone,
        adminNote: b.admin_note,
        slotLabel: formatSlotLabel(new Date(b.slot_start)),
        dateKey: businessDateKey(new Date(b.slot_start)),
        isPast: new Date(b.slot_start).getTime() < now,
      })),
    });
  }));

  /* ── Vendor: mark one of my calls done or missed ──────────────────────────
   * Deliberately narrower than the admin PATCH: an astrologer can record what
   * happened, but cannot reschedule or cancel. Moving a customer's appointment
   * is a conversation the admin has, not a button in the vendor app.
   */
  app.patch('/api/vendor/free-call-bookings/:id', h(async (req, res) => {
    const astrologerId = resolveAstrologerId(req);
    if (!astrologerId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { status } = req.body || {};
    if (!['completed', 'missed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be completed or missed' });
    }

    // The astrologer_id filter is the authorisation check: an id that is not
    // theirs simply updates zero rows and 404s.
    const { data, error } = await db
      .from('free_call_bookings')
      .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
      .eq('id', req.params.id)
      .eq('astrologer_id', astrologerId)
      .select('id, status')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ success: false, message: 'Booking not found' });
    return res.status(200).json({ success: true, booking: data });
  }));

  /* ── Admin: the slot grid, for the reschedule picker ─────────────────────── */
  app.get('/api/admin/free-call-slots', requireAdmin, h(async (req, res) => {
    const offer = await loadOffer();
    const now = new Date();
    const dates = offerDateKeys(offer, now);
    const dateKey = req.query.date || dates[0];
    // Admins may reschedule outside the customer-facing lead time, so `past` is
    // reported but not enforced — a call can legitimately be moved to 20 minutes
    // from now after a phone conversation.
    const slots = buildSlots(offer, dateKey, now);
    const capacity = await slotCapacity(offer);
    const used = await slotUsage(slots);
    return res.status(200).json({
      success: true,
      date: dateKey,
      capacity,
      dates: dates.map((k) => ({ key: k, label: dateLabel(k) })),
      slots: slots.map((s) => ({
        start: s.startIso,
        label: s.label,
        used: used.get(s.start.getTime()) || 0,
        taken: (used.get(s.start.getTime()) || 0) >= capacity,
        past: s.past,
      })),
    });
  }));
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return { day: DAY_NAMES[dt.getUTCDay()], date: d, month: MON_NAMES[m - 1] };
}

module.exports.loadOffer = loadOffer;
module.exports.FREE_CALL_TZ_OFFSET_MIN = FREE_CALL_TZ_OFFSET_MIN;
// Exported for tests only. The slot arithmetic is the part of this file most
// likely to be wrong in a way nobody notices (it must not follow the server's
// own timezone), so it is testable without a database.
module.exports._internals = { buildSlots, offerDateKeys, businessDateKey, businessInstant, formatSlotLabel, DEFAULTS };
module.exports.assigneeCandidates = assigneeCandidates;
module.exports.slotCapacity = slotCapacity;
