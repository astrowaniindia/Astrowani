// The Wani Shop assistant that answers on WhatsApp.
//
// Buying a remedy is a conversation, not a cart. A customer needs to know which
// stone suits them, what weight, and what that weight costs — and a gemstone's
// price depends on its ratti. So this answers from the live catalogue, and hands
// to a real astrologer the moment the question stops being about a product and
// starts being about the person.
//
// It reads the catalogue through TOOLS rather than being handed a giant product
// dump in the system prompt. That is deliberate: 50 items with their variants is
// a lot of tokens to resend on every message, and a tool call only fetches the
// one item being discussed. It also means the bot can never quote a price that
// isn't in the database right now.
//
// Costs money per message (Claude API), unlike the rest of this backend. It fails
// SOFT everywhere: if the model is unreachable or unconfigured, the customer gets
// a human handoff message rather than silence.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const db = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Lazily constructed so a backend without the key still boots — every other route
// must keep working whether or not the shop bot is configured.
let anthropic = null;
function getClient() {
  if (anthropic) return anthropic;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const Anthropic = require('@anthropic-ai/sdk');
  anthropic = new Anthropic();
  return anthropic;
}

const MODEL = 'claude-opus-5';
// WhatsApp replies are deliberately short — a wall of text in a chat thread does
// not get read. This is a real cap on the answer, not a cost-saving guess.
const MAX_TOKENS = 1024;
// A stuck loop is a runaway bill and a customer staring at nothing. Six is well
// past what "look up the stone, look up its weights, answer" needs.
const MAX_TURNS = 6;
// How much of the conversation the model sees. Enough to hold a real exchange,
// bounded so a months-old thread cannot grow the per-message cost without limit.
const HISTORY_LIMIT = 20;

const SYSTEM_PROMPT = `You are the shop assistant for Astrowani's Wani Shop, replying on WhatsApp.
You sell gemstones, pujas and vastu items.

HOW TO SPEAK
- WhatsApp, not email. Short. Usually two or three sentences.
- Plain language. The customer may write in Hindi, English or Hinglish — reply in whichever they used.
- No markdown headings or bullet symbols; WhatsApp shows them as literal characters. A dash at the start of a line is fine.
- Rupees as "Rs. 5,400".

PRICES — THE ONE RULE YOU MUST NOT BREAK
- Never state a price, weight or availability you have not just read from a tool.
- Gemstone prices depend on the ratti. If someone asks "what does a Neelam cost",
  look it up and give the range and the weights actually available. Do not
  quote a single number as if weight did not matter.
- If a weight is not in the catalogue, say so and offer the nearest available.
- If a tool returns nothing, say you will check and offer to connect them to an
  astrologer. Never invent an item, a price or a delivery date.

WHEN TO HAND OVER TO A REAL ASTROLOGER
Use escalate_to_astrologer, and say you are connecting them, whenever:
- They ask which stone or remedy is right FOR THEM. That is a reading, not a
  product question, and it depends on their birth chart.
- They ask about wearing instructions, timing, muhurat, or what a puja will do
  for their specific situation.
- They are unhappy, confused, or ask for a person.
- They ask anything about their own chart, dasha or predictions.
Do not attempt astrological advice yourself. You are a shop assistant, not an
astrologer, and a wrong answer here costs the customer real money and trust.

CLOSING A SALE
When they have chosen an item and (for a gemstone) a weight, use
create_order_and_payment_link. Send them the link and tell them delivery is
arranged once payment is confirmed. Do not ask for card or UPI details in chat —
the payment link handles that.

If you genuinely do not know, say so and offer the astrologer. That is always
better than a confident guess.`;

const TOOLS = [
  {
    name: 'search_catalogue',
    description:
      'Search the shop for items by name or keyword. Use this first when the customer names a stone, puja or product. Returns matching items with their id, type and starting price.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What the customer called it, e.g. "neelam", "blue sapphire", "rudraksha", "griha pravesh".',
        },
        type: {
          type: 'string',
          enum: ['gemstone', 'puja', 'specific_puja', 'vastu'],
          description: 'Optional filter, only when the customer clearly said which kind they want.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_item',
    description:
      'Full detail for one item: description, price, and for a gemstone every available weight (ratti) with its own price and stock. Call this before quoting any price.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'The id returned by search_catalogue.' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'escalate_to_astrologer',
    description:
      'Hand this conversation to a real astrologer. Use for any question about what suits THIS customer, their chart, wearing instructions or timing, and whenever they ask for a person or seem unhappy. After calling this, tell the customer someone is joining — then stop.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'One line for the astrologer: what the customer wants.',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'create_order_and_payment_link',
    description:
      'Create the order and get a payment link to send. Only call this once the customer has confirmed the exact item and (for a gemstone) the exact weight.',
    input_schema: {
      type: 'object',
      properties: {
        item_id: { type: 'string' },
        variant_id: {
          type: 'string',
          description: 'The chosen weight, from get_item. Required for a gemstone that has weights.',
        },
        quantity: { type: 'integer', minimum: 1, maximum: 10 },
      },
      required: ['item_id'],
    },
  },
];

/* ─────────────────────────── tool implementations ─────────────────────────── */

async function searchCatalogue({ query, type }) {
  let q = db
    .from('remedy_items')
    .select('id, type, title, price, unit_label, subcategory')
    .eq('is_active', true)
    .limit(8);
  if (type) q = q.eq('type', type);
  // Match the customer's wording against title OR description — people say
  // "blue sapphire" for an item titled "Neelam".
  if (query) q = q.or(`title.ilike.%${query}%,description.ilike.%${query}%`);

  const { data, error } = await q;
  if (error) return { error: 'catalogue unavailable' };
  if (!data || !data.length) return { results: [], note: 'Nothing matched.' };
  return {
    results: data.map((i) => ({
      item_id: i.id,
      type: i.type,
      title: i.title,
      price_from: Number(i.price) || 0,
      unit: i.unit_label || null,
      subcategory: i.subcategory || null,
    })),
  };
}

async function getItem({ item_id }) {
  const { data: item, error } = await db
    .from('remedy_items')
    .select('id, type, title, description, price, mrp, stock, unit_label')
    .eq('id', item_id)
    .eq('is_active', true)
    .maybeSingle();
  if (error || !item) return { error: 'No such item.' };

  const { data: variants } = await db
    .from('remedy_item_variants')
    .select('id, label, ratti, price, mrp, stock')
    .eq('item_id', item_id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  const rows = (variants || []).filter((v) => v.stock === null || v.stock > 0);

  return {
    item_id: item.id,
    type: item.type,
    title: item.title,
    description: item.description || null,
    // Stock counts are internal; the bot only needs to know whether it can sell it.
    in_stock: item.stock === null || item.stock > 0,
    unit: item.unit_label || null,
    // A gemstone with weights is priced BY weight — base_price is then only a
    // starting point and must not be quoted on its own.
    base_price: Number(item.price) || 0,
    priced_by_weight: rows.length > 0,
    weights: rows.map((v) => ({
      variant_id: v.id,
      label: v.label,
      ratti: v.ratti === null ? null : Number(v.ratti),
      price: Number(v.price),
    })),
  };
}

/**
 * Marks the conversation as a human's. The bot stops replying from here — an
 * astrologer mid-consultation must not have an assistant talking over them.
 * Choosing WHICH astrologer is left to the admin/vendor side; this only raises
 * the hand, so a misconfigured roster can never swallow the request silently.
 */
async function escalate(conversationId, { reason }) {
  await db
    .from('whatsapp_conversations')
    .update({
      handled_by: 'astrologer',
      escalated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
  await db.from('whatsapp_messages').insert([{
    conversation_id: conversationId,
    role: 'system',
    body: `Escalated to an astrologer: ${reason || 'customer asked for a person'}`,
  }]);
  return { ok: true, note: 'An astrologer has been notified and will reply here.' };
}

/* ───────────────────────────────── the loop ────────────────────────────────── */

/**
 * Produces the assistant's reply to one customer message.
 *
 * Returns { text, escalated }. Never throws: a shop bot that 500s leaves a real
 * customer with silence, so every failure becomes a sentence a person can act on.
 */
async function generateReply({ conversationId, history, userMessage, createPaymentLink }) {
  const client = getClient();
  if (!client) {
    return {
      text: 'Thanks for your message! One of our team will reply here shortly.',
      escalated: true,
      reason: 'ANTHROPIC_API_KEY not configured',
    };
  }

  const messages = [
    ...history.slice(-HISTORY_LIMIT).map((m) => ({
      role: m.role === 'customer' ? 'user' : 'assistant',
      content: m.body || '',
    })).filter((m) => m.content),
    { role: 'user', content: userMessage },
  ];

  let escalated = false;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn += 1) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // The prompt is byte-stable, so it caches and every message after the
        // first in a conversation is cheaper.
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        // Shop Q&A is a latency-sensitive, high-volume chat route: low effort is
        // the right setting for it, and the tools do the actual work.
        output_config: { effort: 'low' },
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === 'refusal') {
        return {
          text: 'Let me get one of our astrologers to help you with that.',
          escalated: true,
          reason: 'model declined',
        };
      }

      const toolUses = response.content.filter((b) => b.type === 'tool_use');
      if (!toolUses.length) {
        const text = response.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return { text: text || 'Sorry, could you say that again?', escalated };
      }

      messages.push({ role: 'assistant', content: response.content });

      const results = [];
      for (const call of toolUses) {
        let out;
        try {
          if (call.name === 'search_catalogue') out = await searchCatalogue(call.input);
          else if (call.name === 'get_item') out = await getItem(call.input);
          else if (call.name === 'escalate_to_astrologer') {
            out = await escalate(conversationId, call.input);
            escalated = true;
          } else if (call.name === 'create_order_and_payment_link') {
            out = createPaymentLink
              ? await createPaymentLink(call.input)
              : { error: 'Ordering is not switched on yet.' };
          } else out = { error: `Unknown tool ${call.name}` };
        } catch (e) {
          // Reported back to the model rather than thrown, so it can tell the
          // customer something useful instead of the turn dying.
          out = { error: e.message };
        }
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: JSON.stringify(out),
        });
      }
      messages.push({ role: 'user', content: results });
    }

    // Ran out of turns without settling. Hand to a person rather than loop again.
    await escalate(conversationId, { reason: 'bot could not resolve the question' });
    return {
      text: 'Let me get one of our astrologers to help you with this properly.',
      escalated: true,
    };
  } catch (err) {
    console.error('[WhatsAppBot] generateReply failed:', err.message);
    return {
      text: 'Sorry, I had trouble there. One of our team will reply shortly.',
      escalated: true,
      reason: err.message,
    };
  }
}

module.exports = { generateReply, MODEL, _internals: { searchCatalogue, getItem, TOOLS, SYSTEM_PROMPT } };
