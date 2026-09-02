// The in-app support bot. RULES, NOT AN LLM.
//
// WHY IT IS BUILT THIS WAY. This replies about money — a charge someone did not
// expect, a refund, a withdrawal that has not landed. A generative model that is
// mostly right is the wrong tool for that: the one time it invents a refund
// promise, the customer is owed it, and there is no way to argue with a
// screenshot. So every sentence this bot can say is written here, by hand, and
// reviewable. It costs nothing per message, needs no API key, and cannot say
// anything a person did not approve first.
//
// It is still SPECIFIC, which is the part scripted support usually gets wrong.
// "Sorry for the inconvenience" resolves nothing. So an intent may run a
// read-only lookup against the person's OWN records and fill the real numbers
// into a fixed template — their actual last charge, their actual order status,
// their actual balance. Fixed words, real data.
//
// THE FOUR RULES
//
// 1. IT NEVER MOVES MONEY, and never promises that money will move. Every lookup
//    is a READ. Refunds, credits, payouts and cancellations go to a person.
// 2. EVERY LOOKUP IS SCOPED TO THE CALLER. The id comes from the verified JWT and
//    is closed over — no intent takes an id, so no phrasing can reach another
//    person's records.
// 3. IT HANDS OVER RATHER THAN GUESSING. No confident match, two unclear replies
//    in a row, anything about money owed, anything about safety — a person.
// 4. IT NEVER GOES SILENT. Every path returns either an answer or a handover.
//
// LANGUAGE. Matching covers English, Hindi (Devanagari) and romanised Hinglish,
// because that is how people actually type here. Replies come back in Hindi when
// the person wrote in Devanagari, otherwise English.

const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const rupees = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
const dateOf = (t) => (t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) : '');
const timeOf = (t) => (t ? new Date(t).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '');

const hasDevanagari = (s) => /[ऀ-ॿ]/.test(s || '');

/**
 * Lowercase, strip punctuation, collapse spaces.
 *
 * \p{M} (combining marks) MUST be kept. Devanagari matras are marks, not
 * letters, so stripping them turns "रिफंड चाहिए" into "र फ ड च ह ए" and every
 * Hindi keyword silently stops matching — the bot then falls through to "I
 * didn't follow that" for every Hindi message, which looks like the bot simply
 * not understanding Hindi rather than a broken regex.
 */
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Read-only lookups, all scoped to the caller ────────────────────────────
const lookups = {
  async balance(party) {
    const table = party.kind === 'customer' ? 'customers' : 'astrologers';
    const { data } = await db.from(table).select('wallet_balance').eq('id', party.id).maybeSingle();
    return data ? Number(data.wallet_balance || 0) : null;
  },

  async lastSessions(party, limit = 3) {
    const col = party.kind === 'customer' ? 'caller_id' : 'vendor_id';
    const { data } = await db
      .from('chat_sessions')
      .select('id, started_at, ended_at, duration_minutes, total_charged, per_minute_charge, vendor_id, caller_id')
      .eq(col, party.id)
      .order('started_at', { ascending: false })
      .limit(limit);
    const rows = data || [];
    if (!rows.length) return [];
    const otherIds = [...new Set(rows.map((r) => (party.kind === 'customer' ? r.vendor_id : r.caller_id)).filter(Boolean))];
    const names = {};
    if (otherIds.length) {
      if (party.kind === 'customer') {
        const { data: a } = await db.from('astrologers').select('id, first_name, last_name').in('id', otherIds);
        (a || []).forEach((x) => { names[x.id] = `${x.first_name || ''} ${x.last_name || ''}`.trim(); });
      } else {
        const { data: c } = await db.from('customers').select('id, name').in('id', otherIds);
        (c || []).forEach((x) => { names[x.id] = x.name || 'a customer'; });
      }
    }
    return rows.map((r) => {
      const startedMs = r.started_at ? new Date(r.started_at).getTime() : null;
      const endedMs = r.ended_at ? new Date(r.ended_at).getTime() : null;
      return {
        with: names[party.kind === 'customer' ? r.vendor_id : r.caller_id] || 'an astrologer',
        startedAt: r.started_at,
        seconds: startedMs && endedMs ? Math.round((endedMs - startedMs) / 1000) : null,
        billedMinutes: r.duration_minutes,
        charged: r.total_charged,
        rate: r.per_minute_charge,
      };
    });
  },

  async lastOrder(party) {
    if (party.kind !== 'customer') return null;
    const { data } = await db
      .from('orders')
      .select('id, item_title, status, payment_status, grand_total, total, created_at')
      .eq('customer_id', party.id)
      .order('created_at', { ascending: false })
      .limit(1);
    return (data || [])[0] || null;
  },

  async lastRecharge(party) {
    if (party.kind !== 'customer') return null;
    const { data } = await db
      .from('wallet_recharges')
      .select('amount, status, created_at')
      .eq('customer_id', party.id)
      .order('created_at', { ascending: false })
      .limit(1);
    return (data || [])[0] || null;
  },

  async lastWithdrawal(party) {
    if (party.kind !== 'vendor') return null;
    const { data } = await db
      .from('withdrawal_requests')
      .select('amount, status, created_at')
      .eq('astrologer_id', party.id)
      .order('created_at', { ascending: false })
      .limit(1);
    return (data || [])[0] || null;
  },

  async vendorState(party) {
    const { data } = await db
      .from('astrologers')
      .select('approval_status, is_suspended, is_available, is_online, is_chat_enabled, is_call_enabled, is_video_call_enabled, chat_charge_per_minute, call_charge_per_minute, video_charge_per_minute, charges_locked_at, today_earnings, wallet_balance')
      .eq('id', party.id).maybeSingle();
    return data || null;
  },

  async freeCallBooking(party) {
    if (party.kind !== 'customer') return null;
    const { data } = await db
      .from('free_call_bookings')
      .select('slot_start, status, astrologer_name')
      .eq('customer_id', party.id)
      .order('slot_start', { ascending: false })
      .limit(1);
    return (data || [])[0] || null;
  },
};

// ── The intent catalogue ───────────────────────────────────────────────────
//
// `any` = the phrases that identify this intent. A multi-word phrase is worth
// more than a single word, so "paise kat gaye" beats a stray "paise".
// `escalate` = never answered by the bot; it exists so the handover is
// classified and prioritised correctly instead of falling into a generic bucket.
//
// Ordered roughly by how often it comes up, but matching is by score, not order.
const INTENTS = [
  // ---------------------------------------------------------------- money out
  {
    id: 'unexplained_charge',
    category: 'billing',
    app: 'both',
    any: ['money deducted', 'money was deducted', 'amount deducted', 'balance deducted', 'paise kat', 'paisa kat', 'kat gaye', 'kat gaya', 'deducted wrongly', 'wrongly deducted', 'why was i charged', 'why charged', 'extra charge', 'charged extra', 'पैसे कट', 'पैसा कट', 'कट गए', 'शुल्क', 'गलत कटौती'],
    async reply(party, lang) {
      const sessions = await lookups.lastSessions(party, 3);
      const bal = await lookups.balance(party);
      if (!sessions.length) {
        return lang === 'hi'
          ? `आपके खाते में अभी तक कोई परामर्श दर्ज नहीं है, और आपका मौजूदा बैलेंस ${rupees(bal)} है। अगर फिर भी पैसे कटे हैं तो यह रिचार्ज या ऑर्डर से जुड़ा हो सकता है — मैं इसे टीम को भेज रहा हूं।`
          : `I can't see any consultation on your account yet, and your balance right now is ${rupees(bal)}. If money still left your wallet it may be a recharge or an order, so let me get a person to check it properly.`;
      }
      const s = sessions[0];
      const dur = s.seconds != null
        ? (s.seconds < 60 ? `${s.seconds} seconds` : `${Math.round(s.seconds / 60)} minutes`)
        : 'unknown length';
      const lines = lang === 'hi'
        ? [
            `आपकी आखिरी बातचीत ${dateOf(s.startedAt)} को ${timeOf(s.startedAt)} पर ${s.with} के साथ थी।`,
            s.charged != null ? `उसके लिए ${rupees(s.charged)} लिए गए${s.rate ? ` (${rupees(s.rate)} प्रति मिनट)` : ''}${s.billedMinutes != null ? `, ${s.billedMinutes} मिनट के हिसाब से` : ''}।` : 'उस सत्र का शुल्क अभी दर्ज नहीं हुआ है।',
            `अभी आपका बैलेंस ${rupees(bal)} है।`,
            'अगर यह आपको गलत लगता है तो नीचे लिखें — मैं इसे तुरंत टीम को भेज दूंगा।',
          ]
        : [
            `Your last consultation was with ${s.with} on ${dateOf(s.startedAt)} at ${timeOf(s.startedAt)}, and it ran about ${dur}.`,
            s.charged != null ? `That was billed ${rupees(s.charged)}${s.rate ? ` at ${rupees(s.rate)} per minute` : ''}${s.billedMinutes != null ? `, counted as ${s.billedMinutes} minute(s)` : ''}.` : 'That session has no charge recorded against it yet.',
            `Your balance right now is ${rupees(bal)}.`,
            "If that doesn't look right to you, say so and I'll put a person on it straight away.",
          ];
      return lines.join('\n\n');
    },
  },
  {
    id: 'charged_but_call_failed',
    category: 'call_quality',
    app: 'customer',
    priority: 'high',
    any: ['call did not connect', 'call not connected', 'call didnt connect', 'charged but call', 'call failed but', 'call cut', 'call disconnected', 'call drop', 'dropped call', 'baat nahi hui', 'baat nhi hui', 'call nahi laga', 'कॉल नहीं लगी', 'कॉल कट', 'बात नहीं हुई'],
    async reply(party, lang) {
      const sessions = await lookups.lastSessions(party, 1);
      if (!sessions.length) {
        return lang === 'hi'
          ? 'मुझे आपके खाते में कोई सत्र नहीं मिला। मैं इसे टीम को भेज रहा हूं ताकि वे कॉल रिकॉर्ड देख सकें।'
          : "I can't find a session on your account for that. Let me get a person to look at the call records.";
      }
      const s = sessions[0];
      const secs = s.seconds;
      const short = secs != null && secs < 60;
      if (short && s.charged) {
        return lang === 'hi'
          ? `आप सही कह रहे हैं — वह कॉल केवल ${secs} सेकंड चली और उसके लिए ${rupees(s.charged)} लिए गए। यह ठीक नहीं है। मैं इसे अभी टीम को भेज रहा हूं ताकि वे इसे देखें।`
          : `You're right — that call lasted only ${secs} seconds and ${rupees(s.charged)} was charged for it. That isn't right. I'm sending this to a person now so they can review it properly.`;
      }
      return lang === 'hi'
        ? `आपकी आखिरी कॉल ${dateOf(s.startedAt)} को ${s.with} के साथ थी${secs != null ? `, लगभग ${secs} सेकंड` : ''}${s.charged != null ? `, शुल्क ${rupees(s.charged)}` : ''}। मैं इसे टीम को भेज रहा हूं ताकि वे कॉल की गुणवत्ता और शुल्क दोनों जांच सकें।`
        : `Your last call was with ${s.with} on ${dateOf(s.startedAt)}${secs != null ? `, about ${secs} seconds long` : ''}${s.charged != null ? `, charged ${rupees(s.charged)}` : ''}. I'm passing this to a person to check both the call quality and the charge.`;
    },
    escalateAfter: true, // answer with the facts, then hand over anyway
  },
  {
    id: 'refund',
    category: 'refund',
    app: 'both',
    priority: 'high',
    escalate: true,
    any: ['refund', 'money back', 'return my money', 'paise wapas', 'paisa wapas', 'wapas chahiye', 'रिफंड', 'पैसे वापस', 'पैसा वापस'],
    reason: 'Refund requested.',
  },
  {
    id: 'recharge_failed',
    category: 'billing',
    app: 'customer',
    priority: 'urgent',
    any: ['recharge failed', 'recharge not credited', 'money debited but', 'debited from bank', 'payment failed but money', 'paid but not added', 'wallet not credited', 'recharge nahi hua', 'रिचार्ज नहीं', 'पैसे कटे लेकिन'],
    async reply(party, lang) {
      const r = await lookups.lastRecharge(party);
      const bal = await lookups.balance(party);
      if (!r) {
        return lang === 'hi'
          ? `मुझे आपके खाते पर कोई हालिया रिचार्ज दर्ज नहीं मिला और बैलेंस ${rupees(bal)} है। अगर बैंक से पैसे कटे हैं तो यह टीम को देखना होगा — मैं भेज रहा हूं।`
          : `I can't see a recharge recorded on your account, and your balance is ${rupees(bal)}. If your bank shows money leaving, a person needs to trace it — sending this over now.`;
      }
      return lang === 'hi'
        ? `आपका आखिरी रिचार्ज ${rupees(r.amount)} का था (${dateOf(r.created_at)}), स्थिति: ${r.status}। अभी बैलेंस ${rupees(bal)} है। बैंक से कटे पैसे का मिलान टीम करेगी — मैं इसे भेज रहा हूं।`
        : `Your last recharge was ${rupees(r.amount)} on ${dateOf(r.created_at)}, currently "${r.status}". Your balance is ${rupees(bal)}. Money that left your bank has to be matched by a person, so I'm sending this across now.`;
    },
    escalateAfter: true,
  },
  {
    id: 'balance_query',
    category: 'billing',
    app: 'both',
    any: ['my balance', 'wallet balance', 'how much balance', 'balance kitna', 'kitna balance', 'बैलेंस', 'कितना बैलेंस'],
    async reply(party, lang) {
      const bal = await lookups.balance(party);
      if (party.kind === 'vendor') {
        return lang === 'hi'
          ? `आपका भुगतान बैलेंस अभी ${rupees(bal)} है। निकासी आप Wallet स्क्रीन से कर सकते हैं।`
          : `Your payout balance is ${rupees(bal)} right now. You can request a withdrawal from the Wallet screen.`;
      }
      return lang === 'hi'
        ? `आपका वॉलेट बैलेंस अभी ${rupees(bal)} है। रिचार्ज ऊपर वॉलेट आइकन से किया जा सकता है।`
        : `Your wallet balance is ${rupees(bal)} right now. You can top up from the wallet icon at the top of the home screen.`;
    },
  },
  {
    id: 'how_billing_works',
    category: 'billing',
    app: 'customer',
    any: ['how does billing', 'how am i charged', 'per minute', 'charges kaise', 'billing kaise', 'how billing works', 'rate kya', 'कैसे शुल्क', 'प्रति मिनट'],
    reply: (party, lang) => (lang === 'hi'
      ? 'हर ज्योतिषी की अपनी प्रति-मिनट दर होती है, जो उनके कार्ड पर दिखती है। जैसे ही बातचीत जुड़ती है, हर मिनट के लिए वॉलेट से उतनी राशि कटती है। बैलेंस खत्म होने पर सत्र अपने आप बंद हो जाता है, इसलिए कभी ऋणात्मक नहीं होता।'
      : "Each astrologer sets their own per-minute rate, shown on their card. Billing starts once the consultation actually connects, and that rate is taken from your wallet for each minute. When the balance runs out the session ends by itself, so you can never go negative."),
  },
  {
    id: 'referral_bonus',
    category: 'billing',
    app: 'customer',
    any: ['referral', 'refer bonus', 'referral bonus not', 'invite bonus', 'रेफरल', 'रेफर'],
    reply: (party, lang) => (lang === 'hi'
      ? 'रेफरल इनाम तब मिलता है जब आपका मित्र आपके कोड से जुड़कर अपना पहला सत्र पूरा करता है — केवल ऐप डाउनलोड करने पर नहीं। अगर उन्होंने सत्र पूरा कर लिया है और फिर भी नहीं मिला, तो बताइए, मैं टीम को भेज दूंगा।'
      : "The referral reward lands once your friend signs up with your code and completes their first consultation — not just on installing the app. If they've already had a session and it still hasn't arrived, tell me and I'll pass it to a person."),
  },

  // ------------------------------------------------------------ calls / chat
  {
    id: 'astrologer_not_answering',
    category: 'call_quality',
    app: 'customer',
    any: ['not answering', 'no one answered', 'astrologer not picking', 'not picking up', 'request missed', 'koi nahi utha', 'jawab nahi', 'नहीं उठाया', 'जवाब नहीं'],
    reply: (party, lang) => (lang === 'hi'
      ? 'अगर ज्योतिषी 60 सेकंड में जवाब नहीं देते तो अनुरोध अपने आप रद्द हो जाता है और आपसे कुछ नहीं लिया जाता। आप किसी और ज्योतिषी को आज़मा सकते हैं जिनका बटन हरा दिख रहा हो। अगर आपसे शुल्क लिया गया है तो बताइए — यह गंभीर बात है।'
      : "If an astrologer doesn't answer within 60 seconds the request cancels itself and you are not charged anything. You can try another astrologer whose button is showing as available. If you were charged for one that never answered, tell me — that one matters and I'll get a person on it."),
  },
  {
    id: 'poor_quality',
    category: 'call_quality',
    app: 'both',
    any: ['audio not clear', 'cannot hear', 'cant hear', 'no sound', 'video not working', 'poor quality', 'network issue', 'awaaz nahi', 'sunai nahi', 'आवाज नहीं', 'सुनाई नहीं'],
    reply: (party, lang) => (lang === 'hi'
      ? 'ज्यादातर यह नेटवर्क या माइक की अनुमति से होता है। एक बार जांचें: फोन सेटिंग्स में Astrowani को माइक्रोफ़ोन (और वीडियो के लिए कैमरा) की अनुमति मिली हो, और वाई-फाई की जगह अच्छा मोबाइल नेटवर्क आज़माएं। अगर हर कॉल में ऐसा हो रहा है तो बताइए — मैं टीम को भेजूंगा।'
      : "That is almost always network or a missing permission. Two things worth checking: that Astrowani has microphone permission in your phone settings (and camera for video), and whether switching between Wi-Fi and mobile data helps. If it happens on every single call, say so and I'll get a person to look at your account."),
  },
  {
    id: 'chat_not_working',
    category: 'chat_quality',
    app: 'both',
    any: ['chat not working', 'message not sending', 'messages not delivered', 'chat stuck', 'message nahi ja raha', 'चैट नहीं', 'संदेश नहीं'],
    reply: (party, lang) => (lang === 'hi'
      ? 'पहले ऐप को पूरी तरह बंद करके दोबारा खोलें — चैट लाइव कनेक्शन पर चलती है जो नेटवर्क बदलने पर टूट सकता है। अगर फिर भी संदेश नहीं जा रहे, तो बताइए कि किस ज्योतिषी के साथ, और मैं इसे टीम को भेज दूंगा।'
      : "First, close the app completely and reopen it — chat runs on a live connection that can drop when the network changes. If messages still won't send, tell me which astrologer it was with and I'll pass it to a person."),
  },

  // --------------------------------------------------- astrologer / conduct
  {
    id: 'report_astrologer',
    category: 'astrologer_conduct',
    app: 'customer',
    priority: 'urgent',
    escalate: true,
    any: ['report astrologer', 'rude', 'abusive', 'misbehaved', 'harass', 'asked for money', 'personal number', 'whatsapp number', 'outside app', 'cheated me', 'fraud', 'scam', 'बदतमीजी', 'धोखा', 'शिकायत'],
    reason: 'Reporting an astrologer / conduct complaint.',
  },
  {
    id: 'customer_conduct',
    category: 'astrologer_conduct',
    app: 'vendor',
    priority: 'high',
    escalate: true,
    any: ['customer was abusive', 'customer abused', 'customer rude', 'abusive', 'harassing me', 'threatened me', 'misbehav', 'ग्राहक बदतमीजी', 'बदतमीजी', 'धमकी'],
    reason: 'Astrologer reporting the conduct of a customer.',
  },
  {
    id: 'prediction_wrong',
    category: 'astrologer_conduct',
    app: 'customer',
    priority: 'high',
    escalate: true,
    any: ['prediction was wrong', 'wrong prediction', 'gave wrong', 'not satisfied with', 'bad reading', 'galat batay', 'गलत भविष्यवाणी', 'संतुष्ट नहीं'],
    reason: 'Unhappy with the quality of a consultation.',
  },

  // ------------------------------------------------------------------ orders
  {
    id: 'order_status',
    category: 'order',
    app: 'customer',
    any: ['where is my order', 'order status', 'not delivered', 'delivery', 'track order', 'order kab', 'order kaha', 'ऑर्डर कहां', 'ऑर्डर कब', 'डिलीवरी'],
    async reply(party, lang) {
      const o = await lookups.lastOrder(party);
      if (!o) {
        return lang === 'hi'
          ? 'आपके खाते पर कोई ऑर्डर दर्ज नहीं है। अगर आपने अभी-अभी भुगतान किया है और ऑर्डर नहीं दिख रहा, तो यह गंभीर है — बताइए, मैं तुरंत टीम को भेजूंगा।'
          : "There are no orders on your account. If you just paid for something and no order appeared, that matters — say so and I'll get a person on it immediately.";
      }
      const label = {
        placed: 'placed', confirmed: 'confirmed', packed: 'packed',
        shipped: 'shipped', out_for_delivery: 'out for delivery',
        completed: 'delivered', cancelled: 'cancelled',
        pending_payment: 'waiting for payment',
      }[o.status] || o.status;
      return lang === 'hi'
        ? `आपका आखिरी ऑर्डर "${o.item_title}" (${dateOf(o.created_at)}, ${rupees(o.grand_total ?? o.total)}) अभी "${label}" स्थिति में है। पूरा विवरण My Orders में दिखता है। कुछ और जानना हो तो बताइए।`
        : `Your last order, "${o.item_title}" placed on ${dateOf(o.created_at)} for ${rupees(o.grand_total ?? o.total)}, is currently "${label}". You can see the full tracking under My Orders. Tell me if something about it looks wrong.`;
    },
  },
  {
    id: 'order_problem',
    category: 'order',
    app: 'customer',
    priority: 'high',
    escalate: true,
    any: ['wrong item', 'damaged', 'broken', 'cancel my order', 'cancel order', 'item missing', 'galat saman', 'टूटा', 'गलत सामान', 'ऑर्डर रद्द'],
    reason: 'Problem with a delivered or placed order (wrong/damaged/cancellation).',
  },

  // ----------------------------------------------------------------- reports
  {
    id: 'report_not_delivered',
    category: 'order',
    app: 'customer',
    priority: 'high',
    escalate: true,
    any: ['report not received', 'report not delivered', 'kundli not received', 'paid for report', 'pdf not', 'रिपोर्ट नहीं मिली', 'कुंडली नहीं'],
    reason: 'Paid astrology report not delivered.',
  },

  // ----------------------------------------------------------------- account
  {
    id: 'otp_problem',
    category: 'account',
    app: 'both',
    any: ['otp not received', 'otp nahi aaya', 'not getting otp', 'otp issue', 'cannot login', 'cant login', 'login nahi ho', 'unable to login', 'ओटीपी नहीं', 'लॉगिन नहीं'],
    reply: (party, lang) => (lang === 'hi'
      ? 'ओटीपी आने में कभी-कभी एक मिनट लग जाता है। कृपया देखें कि नंबर सही है, फोन में नेटवर्क है, और मैसेज स्पैम/ब्लॉक सूची में तो नहीं गया। एक मिनट बाद Resend दबाएं। अगर तीन बार कोशिश के बाद भी नहीं आ रहा तो बताइए — मैं टीम को भेजूंगा, वे नंबर की जांच करेंगे।'
      : "An OTP can take up to a minute. Worth checking the number is right, that the phone has signal, and that the message hasn't gone to a blocked or spam list. Wait a minute and use Resend. If it still hasn't arrived after three tries, tell me and I'll get a person to check the number on our side."),
  },
  {
    id: 'change_number',
    category: 'account',
    app: 'both',
    escalate: true,
    any: ['change my number', 'change phone number', 'update mobile number', 'new number', 'number badal', 'नंबर बदल'],
    reason: 'Wants to change the registered phone number (identity change — must be verified by a person).',
  },
  {
    id: 'update_profile',
    category: 'account',
    app: 'customer',
    any: ['update profile', 'change my details', 'wrong birth details', 'change date of birth', 'birth time wrong', 'edit profile', 'जन्म विवरण', 'प्रोफ़ाइल बदल'],
    reply: (party, lang) => (lang === 'hi'
      ? 'आप अपना नाम, जन्म तिथि, समय और स्थान मेन्यू में "My Profile" से खुद बदल सकते हैं। कुंडली इन्हीं से बनती है, इसलिए जन्म समय जितना सटीक हो उतना अच्छा। केवल मोबाइल नंबर खुद नहीं बदला जा सकता — उसके लिए मैं टीम को जोड़ सकता हूं।'
      : 'You can change your name, date of birth, birth time and birth place yourself from "My Profile" in the menu. Your chart is built from those, so the more exact the birth time the better. The only thing you cannot change yourself is the mobile number — tell me if you need that and I will bring in a person.'),
  },
  {
    id: 'delete_account',
    category: 'account',
    app: 'both',
    priority: 'high',
    escalate: true,
    any: ['delete my account', 'close my account', 'remove my data', 'deactivate', 'खाता हटा', 'अकाउंट डिलीट'],
    reason: 'Account deletion / data removal request.',
  },
  {
    id: 'account_blocked',
    category: 'account',
    app: 'both',
    priority: 'urgent',
    escalate: true,
    any: ['account blocked', 'account suspended', 'account locked', 'banned', 'suspend', 'खाता बंद', 'निलंबित'],
    reason: 'Account access problem (blocked / suspended).',
  },

  // -------------------------------------------------------------- free calls
  {
    id: 'free_call',
    category: 'other',
    app: 'customer',
    any: ['free call', 'free consultation', 'free minutes', 'muft', 'मुफ्त', 'फ्री कॉल'],
    async reply(party, lang) {
      const b = await lookups.freeCallBooking(party);
      if (b && b.status === 'booked') {
        return lang === 'hi'
          ? `आपकी निशुल्क कॉल ${dateOf(b.slot_start)} को ${timeOf(b.slot_start)} पर तय है${b.astrologer_name ? `, ${b.astrologer_name} के साथ` : ''}। वे आपको इसी नंबर पर कॉल करेंगे। समय बदलना हो तो बताइए।`
          : `Your free call is booked for ${dateOf(b.slot_start)} at ${timeOf(b.slot_start)}${b.astrologer_name ? ` with ${b.astrologer_name}` : ''}. They will call you on your registered number. Tell me if you need to move it.`;
      }
      return lang === 'hi'
        ? 'निशुल्क परिचयात्मक कॉल नए ग्राहकों के लिए है और होम स्क्रीन पर दिखने वाले उपहार बॉक्स से बुक होती है। अगर वह आपको नहीं दिख रहा, तो बताइए — मैं जांच के लिए भेज दूंगा।'
        : "The free introductory call is for new customers and is booked from the gift box on the home screen. If you can't see it there, tell me and I'll have a person check your account.";
    },
  },

  // -------------------------------------------------------------- vendor side
  {
    id: 'withdrawal_missing',
    category: 'payout',
    app: 'vendor',
    priority: 'urgent',
    any: ['withdrawal', 'withdraw', 'payout', 'money not received', 'bank', 'paisa nahi aaya', 'निकासी', 'भुगतान नहीं'],
    async reply(party, lang) {
      const w = await lookups.lastWithdrawal(party);
      const bal = await lookups.balance(party);
      if (!w) {
        return lang === 'hi'
          ? `आपके खाते पर कोई निकासी अनुरोध दर्ज नहीं है। आपका मौजूदा भुगतान बैलेंस ${rupees(bal)} है। अगर आपने अनुरोध किया था और वह नहीं दिख रहा, तो मैं इसे टीम को भेज रहा हूं।`
          : `There is no withdrawal request recorded on your account, and your payout balance is ${rupees(bal)}. If you did request one and it isn't showing, I'm sending this to a person now.`;
      }
      const st = { pending: 'pending review', approved: 'approved and queued for transfer', paid: 'paid out', rejected: 'rejected' }[w.status] || w.status;
      return lang === 'hi'
        ? `आपका आखिरी निकासी अनुरोध ${rupees(w.amount)} का था (${dateOf(w.created_at)}), स्थिति: ${st}। मौजूदा बैलेंस ${rupees(bal)}। बैंक में पैसा न पहुंचे तो यह टीम देखेगी — मैं भेज रहा हूं।`
        : `Your last withdrawal was ${rupees(w.amount)} on ${dateOf(w.created_at)}, currently ${st}. Your payout balance is ${rupees(bal)}. If the money hasn't reached your bank, a person needs to trace it — sending this over.`;
    },
    escalateAfter: true,
  },
  {
    id: 'no_requests',
    category: 'technical',
    app: 'vendor',
    any: ['not getting requests', 'no requests', 'not receiving calls', 'no customers', 'request nahi aa', 'कोई अनुरोध नहीं', 'रिक्वेस्ट नहीं'],
    async reply(party, lang) {
      const v = await lookups.vendorState(party);
      if (!v) return null;
      const problems = [];
      if (v.approval_status !== 'approved') problems.push(lang === 'hi' ? 'आपका खाता अभी स्वीकृत नहीं है' : 'your account is not approved yet');
      if (v.is_suspended) problems.push(lang === 'hi' ? 'आपका खाता निलंबित है' : 'your account is suspended');
      if (v.is_online === false) problems.push(lang === 'hi' ? 'आप ऑफलाइन दिख रहे हैं' : 'you are showing as offline');
      if (!v.is_chat_enabled && !v.is_call_enabled && !v.is_video_call_enabled) problems.push(lang === 'hi' ? 'कोई भी सेवा चालू नहीं है' : 'none of your services are switched on');
      const noRates = !Number(v.chat_charge_per_minute) && !Number(v.call_charge_per_minute) && !Number(v.video_charge_per_minute);
      if (noRates) problems.push(lang === 'hi' ? 'आपकी कोई दर तय नहीं है' : 'you have no per-minute rate set');

      if (!problems.length) {
        return lang === 'hi'
          ? 'आपका खाता स्वीकृत है, आप ऑनलाइन हैं और सेवाएं चालू हैं — इस तरफ से सब ठीक दिख रहा है। मैं इसे टीम को भेज रहा हूं ताकि वे नोटिफिकेशन की जांच करें।'
          : 'Your account is approved, you are online and your services are on — everything looks correct from here. Let me get a person to check notification delivery for your device.';
      }
      return (lang === 'hi'
        ? `मुझे यह मिला: ${problems.join('; ')}। ग्राहक आपको तभी देख पाते हैं जब खाता स्वीकृत हो, आप ऑनलाइन हों, दर तय हो और कम से कम एक सेवा चालू हो।`
        : `Here's what I can see: ${problems.join('; ')}. Customers can only reach you when the account is approved, you are online, a rate is set, and at least one service is switched on.`);
    },
  },
  {
    id: 'approval_status',
    category: 'account',
    app: 'vendor',
    any: ['approval', 'approved', 'profile pending', 'verification', 'kab approve', 'स्वीकृति', 'अनुमोदन'],
    async reply(party, lang) {
      const v = await lookups.vendorState(party);
      if (!v) return null;
      if (v.approval_status === 'approved' && !v.is_suspended) {
        return lang === 'hi' ? 'आपका खाता स्वीकृत और सक्रिय है।' : 'Your account is approved and active.';
      }
      if (v.is_suspended) {
        return lang === 'hi'
          ? 'आपका खाता अभी निलंबित है। इसका कारण केवल टीम बता सकती है — मैं आपको जोड़ रहा हूं।'
          : 'Your account is currently suspended. Only a person can tell you why, so I am connecting you now.';
      }
      return lang === 'hi'
        ? `आपकी स्थिति अभी "${v.approval_status}" है। स्वीकृति के लिए प्रोफ़ाइल पूरी होनी चाहिए — फोटो, अनुभव, भाषाएं और कम से कम एक दर।`
        : `Your status is currently "${v.approval_status}". Approval needs a complete profile: photo, experience, languages and at least one per-minute rate.`;
    },
  },
  {
    id: 'change_charges',
    category: 'account',
    app: 'vendor',
    any: ['change my charges', 'change rate', 'update charges', 'charges locked', 'rate badal', 'दर बदल', 'शुल्क बदल'],
    async reply(party, lang) {
      const v = await lookups.vendorState(party);
      if (v && v.charges_locked_at) {
        return lang === 'hi'
          ? 'आपकी दरें एक बार तय हो चुकी हैं, इसलिए ऐप से बदली नहीं जा सकतीं। नई दर बताइए — मैं आपको टीम से जोड़ता हूं, वे बदल देंगे।'
          : 'Your rates have already been set once, so they can no longer be changed from the app. Tell me what you want them changed to and I will connect you to a person who can do it.';
      }
      return lang === 'hi'
        ? 'आप अपनी दरें Edit Profile से एक बार खुद तय कर सकते हैं। ध्यान दें — सहेजने के बाद वे लॉक हो जाती हैं और फिर केवल टीम बदल सकती है।'
        : 'You can set your rates yourself once, from Edit Profile. Note that they lock after that first save, and only the team can change them afterwards.';
    },
  },

  // ------------------------------------------------------------- app / other
  {
    id: 'app_technical',
    category: 'technical',
    app: 'both',
    any: ['app crash', 'app not working', 'app slow', 'app hang', 'not loading', 'blank screen', 'app band', 'ऐप बंद', 'ऐप चल नहीं'],
    reply: (party, lang) => (lang === 'hi'
      ? 'पहले ऐप को पूरी तरह बंद करके दोबारा खोलें, और Play Store में अपडेट देखें। अगर फिर भी हो रहा है तो बताइए कि किस स्क्रीन पर — मैं यह जानकारी टीम को भेज दूंगा।'
      : "First close the app completely and reopen it, and check the Play Store for an update. If it keeps happening, tell me which screen it happens on and I'll pass that detail to a person."),
  },
  {
    id: 'notifications',
    category: 'technical',
    app: 'both',
    any: ['not getting notification', 'notification not coming', 'no notification', 'सूचना नहीं', 'नोटिफिकेशन'],
    reply: (party, lang) => (lang === 'hi'
      ? 'फोन सेटिंग्स में Astrowani के नोटिफिकेशन चालू हैं या नहीं, और बैटरी सेवर ऐप को रोक तो नहीं रहा — ये दो चीजें अक्सर वजह होती हैं। जांच के बाद भी न आएं तो बताइए।'
      : "Two things cause this most often: notifications turned off for Astrowani in your phone settings, and battery saver restricting the app in the background. Worth checking both — tell me if they're already fine and it still doesn't work."),
  },
  {
    id: 'become_astrologer',
    category: 'feedback',
    app: 'customer',
    any: ['become astrologer', 'join as astrologer', 'want to work', 'jobs', 'ज्योतिषी बनना', 'नौकरी'],
    reply: (party, lang) => (lang === 'hi'
      ? 'ज्योतिषी के रूप में जुड़ने के लिए Astrowani Astrologer ऐप डाउनलोड करके पंजीकरण करें। हमारी टीम आपकी जानकारी देखकर संपर्क करती है।'
      : 'To join as an astrologer, download the Astrowani Astrologer app and register there. Our team reviews each application and gets in touch.'),
  },
  {
    id: 'safety',
    category: 'astrologer_conduct',
    app: 'both',
    priority: 'urgent',
    escalate: true,
    any: ['threat', 'threatened', 'blackmail', 'unsafe', 'police', 'legal action', 'consumer court', 'lawyer', 'suicide', 'self harm', 'धमकी', 'कानूनी', 'पुलिस'],
    reason: 'SAFETY / LEGAL — needs a person immediately.',
  },
  {
    id: 'human_request',
    category: 'other',
    app: 'both',
    priority: 'high',
    escalate: true,
    any: ['talk to human', 'talk to a person', 'speak to someone', 'customer care', 'call me', 'phone number', 'real person', 'agent', 'insaan se', 'baat karao', 'व्यक्ति से बात', 'इंसान से'],
    reason: 'Asked to speak to a person.',
  },
  {
    id: 'greeting',
    category: null,
    app: 'both',
    any: ['hi', 'hello', 'hey', 'namaste', 'namaskar', 'नमस्ते', 'नमस्कार', 'good morning', 'good evening'],
    minLength: 0,
    reply: (party, lang) => (lang === 'hi'
      ? 'नमस्ते! बताइए क्या दिक्कत हुई — मैं आपके खाते में देखकर बता सकता हूं, और ज़रूरत हुई तो टीम से जोड़ दूंगा।'
      : "Hello! Tell me what went wrong — I can check your account and explain it, and bring in a person if it needs one."),
  },
  {
    id: 'thanks',
    category: null,
    app: 'both',
    any: ['thank', 'thanks', 'thank you', 'shukriya', 'dhanyavad', 'धन्यवाद', 'शुक्रिया', 'ok thanks', 'solved', 'resolved'],
    resolve: true,
    reply: (party, lang) => (lang === 'hi'
      ? 'खुशी हुई कि यह सुलझ गया। कुछ और हो तो यहीं लिखिएगा।'
      : "Glad that's sorted. Write here any time if something else comes up."),
  },
];

// Words that mean the person is upset, regardless of what they are upset about.
// A correct answer delivered to someone this angry is still a bad outcome, so
// this forces a person in even when an intent matched cleanly.
const DISTRESS = [
  'worst', 'pathetic', 'useless', 'cheat', 'cheated', 'fraud', 'scam', 'stolen',
  'angry', 'disgusting', 'never again', 'uninstall', 'complaint', 'sue',
  'bakwas', 'bekar', 'dhokha', 'बकवास', 'धोखा', 'शिकायत', 'गुस्सा',
];

/**
 * Does `text` contain every word of `phrase`, in order, allowing filler between?
 *
 * Plain substring matching fails on the way people actually write: the phrase
 * "account blocked" does not appear in "my account is blocked", so an urgent
 * lockout scored zero and got answered as if it were small talk. Requiring the
 * words in ORDER (rather than just present) keeps it from matching unrelated
 * sentences that happen to share vocabulary.
 */
function containsOrdered(words, phraseWords) {
  let i = 0;
  for (const w of words) {
    if (w === phraseWords[i]) i++;
    if (i === phraseWords.length) return true;
  }
  return false;
}

function scoreIntent(intent, text, party) {
  if (intent.app !== 'both' && intent.app !== (party.kind === 'customer' ? 'customer' : 'vendor')) return 0;
  const words = text.split(' ');
  let score = 0;
  for (const phrase of intent.any) {
    const pw = phrase.split(' ');
    const hit = pw.length === 1 ? words.includes(phrase) || text.includes(phrase)
                                : containsOrdered(words, pw);
    if (!hit) continue;
    // A multi-word phrase is far stronger evidence than one common word.
    score += pw.length > 1 ? 10 : 4;
  }
  return score;
}

/**
 * Decide what to say. Returns the same shape the routes already expect:
 * { reply, escalate, resolve, reason, category, priority }.
 *
 * `history` is used only to notice that the bot has already failed to
 * understand once — two unclear turns in a row is a handover, not a third
 * attempt at the same guess.
 */
async function generateReply({ party, history = [], message }) {
  const raw = String(message || '');
  const text = normalize(raw);
  const lang = hasDevanagari(raw) ? 'hi' : 'en';

  const distressed = DISTRESS.some((w) => text.includes(w));

  // Best-scoring intent wins; a single weak keyword is not enough on its own.
  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    const s = scoreIntent(intent, text, party);
    if (s > bestScore) { best = intent; bestScore = s; }
  }
  const confident = best && bestScore >= (best.any.some((p) => p.includes(' ')) ? 4 : 4);

  // Rule 3 — anything about someone being upset goes to a person, even if the
  // topic itself was understood.
  if (distressed && (!best || !best.resolve)) {
    return {
      reply: lang === 'hi'
        ? 'यह ठीक नहीं हुआ, और मैं इसे यहीं टालना नहीं चाहता। मैं आपको हमारी टीम से जोड़ रहा हूं ताकि कोई व्यक्ति इसे देखे।'
        : "That's not good enough, and I don't want to leave it to a script. I'm putting you through to a person now.",
      escalate: true,
      reason: `Customer is upset${best ? ` (topic: ${best.id})` : ''}. Message: ${raw.slice(0, 200)}`,
      category: (best && best.category) || 'other',
      priority: 'high',
    };
  }

  if (!confident) {
    // First miss: ask once, plainly, and show what it can actually do.
    const missedBefore = history.some((m) => m.sender === 'agent' && m.body && m.body.includes('__CLARIFY__'));
    if (!missedBefore) {
      return {
        reply: (lang === 'hi'
          ? 'मैं ठीक से समझ नहीं पाया। थोड़ा और बताइए — क्या यह पैसे/शुल्क, कॉल या चैट, ऑर्डर, या खाते से जुड़ा है? या "व्यक्ति से बात" लिखिए, मैं तुरंत टीम से जोड़ दूंगा।'
          : 'I didn\'t quite follow that. Can you tell me a bit more — is it about a charge, a call or chat, an order, or your account? Or just say "talk to a person" and I\'ll connect you straight away.') + '\n__CLARIFY__',
        escalate: false,
      };
    }
    // Second miss: stop guessing.
    return {
      reply: lang === 'hi'
        ? 'मैं इसे ठीक से नहीं समझ पा रहा, इसलिए अंदाज़ा लगाने के बजाय आपको टीम से जोड़ रहा हूं।'
        : "I'm not understanding this well enough, and I'd rather not guess — I'm putting you through to a person.",
      escalate: true,
      reason: `Bot could not understand after two attempts. Last message: ${raw.slice(0, 200)}`,
      category: 'other',
      priority: 'normal',
    };
  }

  // Intents that are never answered by the bot.
  if (best.escalate) {
    return {
      reply: lang === 'hi'
        ? 'यह किसी व्यक्ति को देखना चाहिए। मैं आपको अभी टीम से जोड़ रहा हूं।'
        : 'This needs a person rather than me. Connecting you to the team now.',
      intent: best.id,
      escalate: true,
      reason: best.reason || `Intent: ${best.id}`,
      category: best.category || 'other',
      priority: best.priority || 'normal',
    };
  }

  let body = null;
  try {
    body = typeof best.reply === 'function' ? await best.reply(party, lang) : best.reply;
  } catch (e) {
    // Rule 4: a failed lookup is a handover, never silence.
    console.warn('[supportBot] intent failed', best.id, e?.message);
    return {
      reply: lang === 'hi'
        ? 'मैं अभी आपका विवरण नहीं पढ़ पाया। मैं इसे टीम को भेज रहा हूं ताकि कोई इसे देखे।'
        : "I couldn't read your records just now. I'm passing this to a person so it doesn't get stuck.",
      escalate: true,
      reason: `Lookup failed for intent ${best.id}: ${e?.message}`,
      category: best.category || 'other',
      priority: 'normal',
    };
  }

  if (!body) {
    return {
      reply: lang === 'hi'
        ? 'मैं इसका उत्तर पक्के तौर पर नहीं दे सकता, इसलिए टीम से जोड़ रहा हूं।'
        : "I can't answer that with certainty, so I'm bringing in a person.",
      escalate: true,
      reason: `No answer available for intent ${best.id}`,
      category: best.category || 'other',
      priority: 'normal',
    };
  }

  // Some intents answer with real facts AND still hand over, because the facts
  // are the useful part but only a person can act on them.
  if (best.escalateAfter) {
    return {
      reply: body,
      intent: best.id,
      escalate: true,
      reason: best.reason || `Intent: ${best.id} — answered with account data, needs a person to act.`,
      category: best.category || 'other',
      priority: best.priority || 'high',
    };
  }

  return {
    reply: body,
    intent: best.id,
    escalate: false,
    resolve: !!best.resolve,
    summary: best.resolve ? `Resolved via bot (${best.id}).` : null,
    category: best.category || null,
  };
}

module.exports = {
  generateReply,
  _internals: { INTENTS, normalize, scoreIntent, lookups, DISTRESS },
};
