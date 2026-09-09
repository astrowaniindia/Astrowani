// Coin store — iOS only. Buys the currency that pays for astro reports, gifts and
// free services, which Apple requires to go through In-App Purchase (App Store
// Guideline 3.1.1). See utils/payments.js for which purchases are in scope.
//
// Consultations and the remedy shop are EXEMPT and keep using the rupee wallet, so
// this screen never replaces Wallet.js — both exist on iOS, for different things.
//
// ── Two rules this screen is built around ─────────────────────────────────────
// 1. PRICES COME FROM STOREKIT, NEVER FROM OUR BACKEND. `localizedPrice` is what
//    the customer is actually charged, in their storefront's currency and
//    inclusive of their tax. Our backend deliberately sends no prices; a pack
//    whose StoreKit product is missing is therefore NOT rendered, because we
//    cannot honestly state its price.
// 2. COINS ARRIVE VIA A LISTENER, NOT FROM THE BUY CALL. A purchase can complete
//    long after the tap (Ask to Buy approval, an interrupted sheet, a dropped
//    connection). utils/iap.js credits from the StoreKit listener and calls back
//    here; this screen only ever shows "processing" and waits.
import React, {useCallback, useContext, useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {moderateScale, scale, verticalScale} from '../../utils/Scaling';
import {COLORS} from '../../Theme/Colors';
import {LanguageContext} from '../../context/LanguageContext';
import {getCoinPacks, getCoinBalance} from '../../api/CoinsApi';
import {getCoinProducts, buyCoins, flushPendingPurchases, initIap} from '../../utils/iap';

export default function CoinStore({navigation}) {
  const {t} = useContext(LanguageContext);

  const [balance, setBalance] = useState(null);
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState(null);
  const [error, setError] = useState(null);

  // Guards a setState after unmount when a purchase resolves late.
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const b = await getCoinBalance();
      if (mountedRef.current) setBalance(b);
    } catch (_) {
      // Leave the previous value rather than showing 0 — a false 0 reads as
      // "my coins vanished".
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [serverPacks] = await Promise.all([getCoinPacks(), refreshBalance()]);

      // Pair each pack with its StoreKit product to get the real price.
      const products = await getCoinProducts(serverPacks.map((p) => p.productId));
      const byId = new Map(products.map((pr) => [pr.productId, pr]));

      // Packs with no StoreKit product are dropped, not shown priceless. This
      // happens when a product is missing from App Store Connect, or is not yet
      // approved — showing it would offer something that cannot be bought.
      const merged = serverPacks
        .map((p) => ({...p, product: byId.get(p.productId)}))
        .filter((p) => !!p.product);

      if (!mountedRef.current) return;
      setPacks(merged);
      if (merged.length === 0) setError('unavailable');
    } catch (_) {
      if (mountedRef.current) setError('unavailable');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [refreshBalance]);

  useEffect(() => {
    // Re-registers the credited callback so a purchase that completes while this
    // screen is open updates the balance in place.
    initIap({
      onCredited: (newBalance) => {
        if (!mountedRef.current) return;
        setBalance(newBalance);
        setBuyingId(null);
      },
    });

    load();

    // Recovery path: re-presents any transaction StoreKit still considers
    // undelivered. This is what rescues someone who paid, lost connectivity
    // before the credit landed, and has come back wondering where their coins are.
    flushPendingPurchases();
  }, [load]);

  const onBuy = async (pack) => {
    setBuyingId(pack.productId);
    const started = await buyCoins(pack.productId);
    // `started` false means StoreKit refused or the customer cancelled — either
    // way nothing is pending, so clear the spinner. A true only means the request
    // was accepted; the coins still arrive via onCredited.
    if (!started && mountedRef.current) setBuyingId(null);
  };

  // Belt and braces. Navigation never routes here off iOS (see utils/payments.js
  // TOP_UP_ROUTE), but a deep link or a stale banner action_value could.
  if (Platform.OS !== 'ios') {
    return (
      <View style={[styles.screen, styles.centre]}>
        <Text style={styles.emptyText}>{t('coins.iosOnly')}</Text>
      </View>
    );
  }

  const renderPack = ({item}) => {
    const busy = buyingId === item.productId;
    const anyBusy = buyingId !== null;
    return (
      <TouchableOpacity
        style={[styles.pack, busy && styles.packBusy]}
        activeOpacity={0.85}
        disabled={anyBusy}
        onPress={() => onBuy(item)}>
        <View style={styles.packLeft}>
          <MaterialIcons name="monetization-on" size={moderateScale(30)} color={COLORS.AstroGold} />
          <View style={styles.packText}>
            <Text style={styles.packCoins}>
              {item.coins} {t('coins.coins')}
            </Text>
            {!!item.badge && <Text style={styles.packBadge}>{item.badge}</Text>}
          </View>
        </View>

        {busy ? (
          <ActivityIndicator color={COLORS.AstroMaroon} />
        ) : (
          <View style={styles.priceChip}>
            {/* StoreKit's own localised, tax-inclusive price — never our own. */}
            <Text style={styles.priceText}>{item.product.localizedPrice}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
          <MaterialIcons name="arrow-back" size={moderateScale(24)} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('coins.title')}</Text>
        <View style={{width: moderateScale(24)}} />
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t('coins.yourBalance')}</Text>
        <View style={styles.balanceRow}>
          <MaterialIcons name="monetization-on" size={moderateScale(26)} color={COLORS.AstroGold} />
          <Text style={styles.balanceValue}>{balance === null ? '—' : balance}</Text>
        </View>
        <Text style={styles.balanceHint}>{t('coins.usedFor')}</Text>
      </View>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
        </View>
      ) : error ? (
        <View style={styles.centre}>
          <Text style={styles.emptyText}>{t('coins.unavailable')}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>{t('coins.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={packs}
          keyExtractor={(item) => item.productId}
          renderItem={renderPack}
          contentContainerStyle={styles.list}
          ListFooterComponent={<Text style={styles.footnote}>{t('coins.footnote')}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: COLORS.AstroSoftOrange},
  centre: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: scale(24)},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.AstroMaroon,
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
  },
  headerTitle: {color: '#fff', fontSize: moderateScale(16), fontWeight: 'bold'},
  balanceCard: {
    backgroundColor: COLORS.AstroMaroon,
    margin: scale(16),
    borderRadius: moderateScale(14),
    padding: scale(18),
    alignItems: 'center',
  },
  balanceLabel: {color: COLORS.AstroSoftOrange, fontSize: moderateScale(12)},
  balanceRow: {flexDirection: 'row', alignItems: 'center', marginTop: verticalScale(6)},
  balanceValue: {
    color: '#fff',
    fontSize: moderateScale(30),
    fontWeight: 'bold',
    marginLeft: scale(8),
  },
  balanceHint: {
    color: COLORS.AstroSoftOrange,
    fontSize: moderateScale(10),
    marginTop: verticalScale(6),
    textAlign: 'center',
  },
  list: {paddingHorizontal: scale(16), paddingBottom: verticalScale(24)},
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: moderateScale(12),
    padding: scale(14),
    marginBottom: verticalScale(10),
  },
  packBusy: {opacity: 0.7},
  packLeft: {flexDirection: 'row', alignItems: 'center', flex: 1},
  packText: {marginLeft: scale(12), flex: 1},
  packCoins: {fontSize: moderateScale(15), fontWeight: 'bold', color: COLORS.AstroMaroon},
  packBadge: {fontSize: moderateScale(10), color: '#2E7D32', fontWeight: 'bold', marginTop: verticalScale(2)},
  priceChip: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(7),
  },
  priceText: {color: '#fff', fontSize: moderateScale(13), fontWeight: 'bold'},
  emptyText: {
    fontSize: moderateScale(13),
    color: COLORS.AstroMaroon,
    textAlign: 'center',
    lineHeight: moderateScale(19),
  },
  retryBtn: {
    marginTop: verticalScale(14),
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(24),
    paddingVertical: verticalScale(9),
  },
  retryText: {color: '#fff', fontWeight: 'bold', fontSize: moderateScale(13)},
  footnote: {
    fontSize: moderateScale(10),
    color: COLORS.AstroMaroon,
    opacity: 0.75,
    textAlign: 'center',
    marginTop: verticalScale(10),
    lineHeight: moderateScale(15),
  },
});
