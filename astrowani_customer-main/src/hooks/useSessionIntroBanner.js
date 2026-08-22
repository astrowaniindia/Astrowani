// Reads the admin-editable session-start prompt from app_settings.
//
// Same shape as useRemedyOrderingGate: straight from Supabase, because app_settings is
// public-read and this is the pattern Analytics.js and Navigation.js already use — no
// bespoke endpoint needed for three key/value rows.
//
// This decides only what a banner SAYS. There is no server-side counterpart because there
// is nothing to enforce: the banner grants nothing and costs nothing, so a stale value in
// an old build is a slightly out-of-date sentence, not a loophole.
//
// Fails to OFF rather than showing a hardcoded fallback sentence: if the copy cannot be
// read, an admin may have deliberately reworded or disabled it, and showing stale
// promotional text nobody approved is worse than showing none.
import { useEffect, useState } from 'react';
import { supabase } from '../api/SupabaseClient';

const KEYS = [
  'session_intro_banner_enabled',
  'session_intro_banner_text',
  'session_intro_banner_text_hi',
];

export default function useSessionIntroBanner(language) {
  const [state, setState] = useState({ enabled: false, text: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('app_settings').select('key, value').in('key', KEYS);
        if (cancelled) return;
        const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
        const hi = map.session_intro_banner_text_hi;
        setState({
          enabled: map.session_intro_banner_enabled === 'true',
          // Fall back to the English copy when Hindi hasn't been filled in — the same
          // convention /api/remedies uses for title_hi.
          text: (language === 'Hindi' && hi ? hi : map.session_intro_banner_text) || '',
        });
      } catch (_) {
        if (!cancelled) setState({ enabled: false, text: '' });
      }
    })();
    return () => { cancelled = true; };
  }, [language]);

  return state;
}
