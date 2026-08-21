// Remedies shopping cart.
//
// Deliberately client-side (AsyncStorage), not a `carts` table. Cross-device cart sync
// isn't worth a schema here, and it's safe because the SERVER reprices the whole cart at
// checkout: /api/orders/quote and /api/orders/checkout both re-derive every price, fee and
// total from remedy_items, so a cart carrying a stale price simply gets corrected before
// any money moves. Nothing in here is ever trusted as money.
//
// The stored quantities are the only thing that matters. Titles/prices/images are cached
// alongside them purely so the cart screen can render instantly on open instead of
// flashing empty while the quote round-trips.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'remedy_cart_v1';

// Matches MAX_QTY_PER_LINE in astrowani-backend/src/orderRoutes.js. Kept in sync by hand:
// if they ever diverge the server wins, and the cart would silently show a quantity the
// order can't contain.
export const MAX_QTY_PER_ITEM = 10;

export const CartContext = createContext(null);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
};

export const CartProvider = ({ children }) => {
  // Keyed by itemId so add/increment is a single lookup and duplicates are impossible.
  const [itemsById, setItemsById] = useState({});
  const [hydrated, setHydrated] = useState(false);

  // Skip the very first persist: it would otherwise write `{}` over a real stored cart in
  // the window between mount and hydration finishing.
  const skipNextPersist = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [raw, customerId] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem('customerId'),
        ]);
        if (cancelled) return;
        const saved = raw ? JSON.parse(raw) : null;
        // A cart belongs to whoever filled it. If a different account is now logged in
        // (or the previous one logged out), start empty rather than handing someone
        // else's cart to the new session. No logout-side change needed.
        if (saved && saved.customerId === (customerId || null) && saved.itemsById) {
          setItemsById(saved.itemsById);
        }
      } catch (_) {
        // A corrupt cart is not worth failing the app over — start empty.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextPersist.current) { skipNextPersist.current = false; return; }
    (async () => {
      try {
        const customerId = await AsyncStorage.getItem('customerId');
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ customerId: customerId || null, itemsById }));
      } catch (_) { /* a failed cart write is not worth surfacing */ }
    })();
  }, [itemsById, hydrated]);

  /**
   * Add one unit, or bump an existing line. `item` is a row from /api/remedies — the
   * cached display fields are refreshed on every add so a price an admin changed while
   * the cart sat open shows the new value.
   */
  const add = useCallback((item) => {
    const id = item?._id || item?.itemId;
    if (!id) return;
    setItemsById((prev) => {
      const existing = prev[id];
      const quantity = Math.min(MAX_QTY_PER_ITEM, (existing?.quantity || 0) + 1);
      return {
        ...prev,
        [id]: {
          itemId: id,
          title: item.title ?? existing?.title ?? '',
          titleHi: item.hindi?.title ?? item.titleHi ?? existing?.titleHi ?? null,
          type: item.type ?? existing?.type ?? null,
          image: item.image ?? existing?.image ?? null,
          price: Number(item.price ?? existing?.price ?? 0),
          mrp: item.mrp ?? existing?.mrp ?? null,
          unitLabel: item.unitLabel ?? existing?.unitLabel ?? null,
          quantity,
        },
      };
    });
  }, []);

  const setQty = useCallback((itemId, quantity) => {
    setItemsById((prev) => {
      if (!prev[itemId]) return prev;
      const q = Math.min(MAX_QTY_PER_ITEM, Math.max(0, Math.floor(quantity)));
      if (q === 0) {
        const { [itemId]: _dropped, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { ...prev[itemId], quantity: q } };
    });
  }, []);

  const increment = useCallback((itemId) => {
    setItemsById((prev) => {
      const line = prev[itemId];
      if (!line) return prev;
      return { ...prev, [itemId]: { ...line, quantity: Math.min(MAX_QTY_PER_ITEM, line.quantity + 1) } };
    });
  }, []);

  // Decrementing the last unit removes the line — that's what makes the card's stepper
  // collapse back to an "ADD" button.
  const decrement = useCallback((itemId) => {
    setItemsById((prev) => {
      const line = prev[itemId];
      if (!line) return prev;
      if (line.quantity <= 1) {
        const { [itemId]: _dropped, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: { ...line, quantity: line.quantity - 1 } };
    });
  }, []);

  const remove = useCallback((itemId) => {
    setItemsById((prev) => {
      if (!prev[itemId]) return prev;
      const { [itemId]: _dropped, ...rest } = prev;
      return rest;
    });
  }, []);

  const clear = useCallback(() => setItemsById({}), []);

  const value = useMemo(() => {
    const items = Object.values(itemsById);
    return {
      hydrated,
      items,
      itemsById,
      /** Distinct products in the cart — what the cart badge and bar show. */
      count: items.length,
      totalUnits: items.reduce((n, l) => n + l.quantity, 0),
      /**
       * Cached-price estimate for instant rendering ONLY. Never send this anywhere and
       * never show it as the amount payable — /api/orders/quote owns every real figure.
       */
      subtotalEstimate: items.reduce((sum, l) => sum + Number(l.price || 0) * l.quantity, 0),
      /** The only shape the backend ever receives from the cart. */
      quoteItems: items.map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
      qtyOf: (itemId) => itemsById[itemId]?.quantity || 0,
      add,
      setQty,
      increment,
      decrement,
      remove,
      clear,
    };
  }, [itemsById, hydrated, add, setQty, increment, decrement, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export default CartProvider;
