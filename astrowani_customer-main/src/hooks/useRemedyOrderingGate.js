// Is a remedy category actually accepting orders yet?
//
// Remedies delivery goes live one category at a time (gemstones first). The switch is
// `remedy_orders_enabled_<type>` in app_settings, flipped from the admin dashboard's
// Remedies page, and read here straight from Supabase — app_settings is public-read, and
// this is the same pattern Analytics.js's applySessionReplaySetting and Navigation.js's
// wallet-balance read already use, so no bespoke endpoint is needed.
//
// This hook only decides what the UI DOES. It is not the enforcement point:
// POST /api/orders/checkout re-reads the same keys server-side and 403s a blocked
// category, so an old installed build with a stale value can't slip an order through.
//
// Fails CLOSED — if the read fails or the key is absent, the category is treated as not
// yet delivering and the customer sees the "we're not there yet" popup. The worst case is
// telling someone we can't ship yet when we could, which is recoverable; the opposite
// takes money for something nobody will fulfil.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../api/SupabaseClient';
import Instance from '../api/ApiCall';

const DEFAULT_TITLE = "We're not there yet";
const DEFAULT_MESSAGE =
  "We're not currently delivering {item} to your location. Your wallet has not been charged — nothing has been deducted.";

export default function useRemedyOrderingGate(type) {
  // `null` = still checking. Screens should treat null as "don't know yet" rather than as
  // blocked, so the ADD button doesn't flicker into a popup on a slow network.
  const [enabled, setEnabled] = useState(null);
  const [popupTitle, setPopupTitle] = useState(DEFAULT_TITLE);
  const [popupMessage, setPopupMessage] = useState(DEFAULT_MESSAGE);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', `remedy_orders_enabled_${type}`)
          .limit(1);
        if (cancelled) return;
        setEnabled(data && data.length ? data[0].value === 'true' : false);
      } catch (_) {
        if (!cancelled) setEnabled(false);
      }
    })();

    // The popup wording is admin-editable free text (app_settings via
    // /api/remedy-unavailable-popup). {item} is substituted at render time.
    Instance.get('/api/remedy-unavailable-popup')
      .then((res) => {
        if (cancelled) return;
        if (res?.data?.title) setPopupTitle(res.data.title);
        if (res?.data?.message) setPopupMessage(res.data.message);
      })
      .catch(() => { /* keep the defaults */ });

    return () => { cancelled = true; };
  }, [type]);

  const messageFor = useCallback(
    (itemTitle) => popupMessage.replace('{item}', itemTitle || 'this item'),
    [popupMessage],
  );

  return { enabled, popupTitle, popupMessage, messageFor };
}
