// Shared definition of the four remedy categories.
//
// Extracted from Remedies.js on 2026-08-20 when the Home screen gained its own
// Remedies row (below Astro Reports). Both surfaces show the same four
// categories, honour the same admin overrides from /api/remedy-categories, and
// fall back to the same bundled images and translated strings — duplicating any
// of that would guarantee the two drift apart the first time an admin renames a
// category or the Hindi fallback is corrected.
//
// The list is fixed and closed on purpose: `type` is what RemedyShop filters on,
// so an admin adding a row with an unknown type has nothing to render into.

// Bundled fallbacks — used whenever the admin hasn't set a category's image yet
// (or the fetch fails), so neither surface can go blank.
export const REMEDY_IMAGE_DEFAULTS = {
  puja: require('../../assets/images/specificPuja.jpg'),
  gemstone: require('../../assets/images/gemsStones.jpg'),
  specific_puja: require('../../assets/images/groupPuja.jpg'),
  life_report: require('../../assets/images/specificPuja.jpg'),
};

// Each category's i18n key pair. The fallback text is translated rather than a
// fixed English string, so a category the admin hasn't filled in still respects
// the Hindi toggle.
export const REMEDY_TEXT_KEYS = {
  puja: {title: 'remedies.puja.title', description: 'remedies.puja.description'},
  gemstone: {title: 'remedies.gemstone.title', description: 'remedies.gemstone.description'},
  specific_puja: {title: 'remedies.specificPuja.title', description: 'remedies.specificPuja.description'},
  life_report: {title: 'remedies.lifeReport.title', description: 'remedies.lifeReport.description'},
};

export const REMEDY_CATEGORY_ORDER = ['puja', 'gemstone', 'specific_puja', 'life_report'];

/**
 * Merge admin-set fields over the bundled fallbacks, per type, in the fixed
 * display order. An admin can set only some fields (e.g. just the image) and the
 * rest still falls back cleanly.
 *
 * @param apiCategories rows from GET /api/remedy-categories (may be null/[])
 * @param language      'Hindi' | 'English' — from LanguageContext
 * @param t             the translate function from LanguageContext
 * @returns [{id, type, title, description, image}] — `image` is an Image
 *          `source`: {uri} for an admin upload, a require()'d number otherwise.
 */
export function buildRemedyCategories(apiCategories, language, t) {
  return REMEDY_CATEGORY_ORDER.map((type) => {
    const keys = REMEDY_TEXT_KEYS[type];
    const fallbackTitle = t(keys.title);
    const fallbackDescription = t(keys.description);
    const fromApi = (apiCategories || []).find((c) => c.type === type);

    // Precedence matters, and getting it wrong is why the Remedies tab stayed
    // English under the Hindi toggle (reported 2026-08-19). It used to read:
    //
    //   language === 'Hindi' ? (fromApi?.hindi?.title || fromApi?.title) : ...
    //
    // so as soon as an admin had saved an English title — which they had for
    // every category — the Hindi branch fell straight through to that English
    // string. Being truthy, it then satisfied `title || fallbackTitle` below, so
    // the perfectly good bundled Hindi translation was never reached.
    //
    // Correct order in Hindi is: admin's Hindi > our bundled Hindi > admin's
    // English as an absolute last resort (better a real category name than a
    // blank card). English is unchanged: admin's text, else the bundled string.
    //
    // The `apiHindi !== apiEnglish` guard is the second half of that fix, added
    // 2026-08-20 after the cards were STILL English. /api/remedy-categories
    // builds its Hindi as `title_hi || title`, so an unfilled Hindi column comes
    // back holding the English string — a translation that never happened,
    // wearing a Hindi label. Precedence alone can't help: `apiHindi` is truthy,
    // so it wins and the bundled Hindi is never reached. Treating "Hindi that is
    // character-for-character the English" as absent is what actually unblocks
    // the fallback. The backend now returns null instead, but this guard stays:
    // it makes the screen correct against BOTH the old and new server, which
    // matters because an installed app meets whichever backend is deployed, not
    // the one that shipped with it.
    const isRealTranslation = (hi, en) => !!hi && hi !== en;
    const pick = (apiHindi, apiEnglish, bundled) =>
      language === 'Hindi'
        ? ((isRealTranslation(apiHindi, apiEnglish) ? apiHindi : null) || bundled || apiEnglish)
        : (apiEnglish || bundled);

    const title = pick(fromApi?.hindi?.title, fromApi?.title, fallbackTitle);
    const description = pick(fromApi?.hindi?.description, fromApi?.description, fallbackDescription);

    return {
      id: type,
      type,
      title: title || fallbackTitle,
      description: description || fallbackDescription,
      image: fromApi?.image ? {uri: fromApi.image} : REMEDY_IMAGE_DEFAULTS[type],
    };
  });
}
