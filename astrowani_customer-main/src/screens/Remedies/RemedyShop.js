import React, { useCallback, useContext, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import { LanguageContext } from '../../context/LanguageContext';
import useRemedyListSync from '../../hooks/useRemedyListSync';
import useRemedyOrderingGate from '../../hooks/useRemedyOrderingGate';
import { captureEvent } from '../../utils/Analytics';
import { useCart } from '../../context/CartContext';
import { showStatusPopup } from '../../components/StatusPopup';
import ProductCard from '../../components/shop/ProductCard';
import { getRecommendations } from '../../api/OrdersApi';
import CartBar from '../../components/shop/CartBar';

// Unified shop screen for every remedy type. route.params: { type, title }.
//
// This used to be a catalogue with a "Buy Now" button that opened a one-item
// name/phone/address form whose Place Order deliberately did nothing but show the
// "not delivering yet" popup. It's now a real storefront: ADD builds a multi-item cart
// (CartContext), a sticky bar leads to the cart, and checkout is a proper
// address → payment → confirmation flow.
//
// The old popup hasn't gone away — it's now what a category that isn't accepting orders
// yet shows when you tap ADD (see hooks/useRemedyOrderingGate.js). Gemstones ship first;
// the other categories behave exactly as they did before until an admin flips their switch.
const RemedyShop = ({ route, navigation }) => {
  const { t, language } = useContext(LanguageContext);
  const type = route?.params?.type || 'puja';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // itemId -> astrologer name. Fetched separately from the catalogue because
  // /api/remedies is unauthenticated and cached for everyone; a per-customer field
  // there would leak one customer's recommendations to all of them via that cache.
  const [recommendations, setRecommendations] = useState({});

  const cart = useCart();
  const gate = useRemedyOrderingGate(type);

  const fetchItems = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      // channel=app: this is the Home screen's Remedies shop, which is a different
      // catalogue from Wani Shop on the web even though both live in remedy_items.
      const response = await Instance.get(`/api/remedies?type=${type}&channel=app`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(response?.data?.data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Independent of fetchItems: a failed/absent recommendation lookup must never stop the
  // catalogue rendering. getRecommendations already resolves to {} rather than throwing.
  useEffect(() => {
    let cancelled = false;
    getRecommendations().then((map) => { if (!cancelled) setRecommendations(map); });
    return () => { cancelled = true; };
  }, []);

  // Was an unfiltered Supabase Realtime subscription on the whole `remedy_items` table,
  // opened once per remedy type — a customer browsing several types accumulated one
  // identical subscription each. Now shares the one backend fanout (hooks/useRemedyListSync.js).
  useRemedyListSync(() => { fetchItems(); });

  // One place that decides an item's display language, used by the cards, the cart bar and
  // the "not delivering yet" message. They used to disagree: the CARD showed the Hindi
  // title while the order sheet below it showed the raw English one for the same product.
  //
  // The `!== item.title` guard mirrors remedyCategories.js — /api/remedies builds Hindi as
  // `title_hi || title`, so an untranslated row comes back with the English string wearing
  // a Hindi label.
  const localized = useCallback((item, field) => {
    if (!item) return '';
    const en = item[field];
    if (language !== 'Hindi') return en;
    const hi = item.hindi?.[field];
    return hi && hi !== en ? hi : en;
  }, [language]);

  const showNotDeliveringYet = useCallback((item) => {
    showStatusPopup({
      variant: 'missed',
      title: gate.popupTitle,
      message: gate.messageFor(localized(item, 'title') || item?.title),
    });
  }, [gate, localized]);

  const handleAdd = useCallback((item) => {
    // `enabled === null` means the gate hasn't resolved yet. Treated as blocked for the
    // purposes of adding, but without the popup — a tap during that window is a no-op
    // rather than a wrong answer in either direction.
    if (gate.enabled === null) return;
    if (!gate.enabled) {
      captureEvent('remedy_blocked_category_tapped', { item_id: item._id, remedy_type: type });
      showNotDeliveringYet(item);
      return;
    }
    cart.add(item);
    captureEvent('add_to_cart', {
      item_id: item._id, item_title: item.title, remedy_type: type, price: item.price,
    });
  }, [cart, gate.enabled, showNotDeliveringYet, type]);

  const openProduct = useCallback((item) => {
    navigation.navigate('ProductDetail', { item, type });
  }, [navigation, type]);

  const renderItem = ({ item }) => (
    <ProductCard
      item={item}
      title={localized(item, 'title')}
      qty={cart.qtyOf(item._id)}
      soldOut={item.inStock === false}
      blocked={gate.enabled === false}
      addLabel={t('cart.add')}
      soldOutLabel={t('cart.soldOut')}
      saveLabel={t('cart.save')}
      recommendedBy={recommendations[item._id] || null}
      onPress={() => openProduct(item)}
      onAdd={() => handleAdd(item)}
      onIncrement={() => cart.increment(item._id)}
      onDecrement={() => cart.decrement(item._id)}
    />
  );

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <Text style={styles.errorText}>{t('common.error')}: {error}</Text>
      ) : items.length === 0 ? (
        <View style={styles.loaderContainer}>
          <Text style={styles.emptyText}>{t('remedies.noneAvailable')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item._id}
          numColumns={2}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          contentContainerStyle={[
            styles.listContainer,
            // Keep the last row clear of the floating cart bar instead of letting it sit
            // underneath and look cut off.
            cart.count > 0 && { paddingBottom: verticalScale(90) },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      <CartBar
        count={cart.count}
        totalUnits={cart.totalUnits}
        subtotal={cart.subtotalEstimate}
        label={t('cart.viewCart')}
        itemWord={t('cart.item')}
        itemsWord={t('cart.items')}
        onPress={() => {
          captureEvent('cart_viewed', { from: 'shop', remedy_type: type, lines: cart.count });
          navigation.navigate('Cart');
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroSoftOrange },
  listContainer: { padding: scale(12), paddingBottom: verticalScale(30) },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: scale(20) },
  emptyText: { color: COLORS.black, fontSize: moderateScale(15), textAlign: 'center' },
  errorText: { color: COLORS.red, fontSize: moderateScale(15), textAlign: 'center', marginTop: verticalScale(20) },
});

export default RemedyShop;
