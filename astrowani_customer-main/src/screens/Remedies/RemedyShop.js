import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import Instance from '../../api/ApiCall';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LanguageContext } from '../../context/LanguageContext';
import useRemedyListSync from '../../hooks/useRemedyListSync';
import { captureEvent } from '../../utils/Analytics';

// Unified shop screen for all three remedy types. route.params: { type, title }.
const RemedyShop = ({ route, navigation }) => {
  const { t, language } = React.useContext(LanguageContext);
  const type = route?.params?.type || 'puja';
  const headerTitle = route?.params?.title || 'Remedies';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Order modal state
  const [selected, setSelected] = useState(null); // item being purchased
  const [qty, setQty] = useState(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  // Admin-editable "not delivering yet" popup text (astrowani-admin's Remedies
  // page). {item} is replaced with the actual remedy's title below — never
  // trust this to already contain real content, it's free text an admin typed.
  const [popupTitle, setPopupTitle] = useState("We're not there yet");
  const [popupMessage, setPopupMessage] = useState(
    "We're not currently delivering {item} to your location. Your wallet has not been charged — nothing has been deducted.",
  );
  useEffect(() => {
    let cancelled = false;
    Instance.get('/api/remedy-unavailable-popup')
      .then((res) => {
        if (cancelled) return;
        if (res?.data?.title) setPopupTitle(res.data.title);
        if (res?.data?.message) setPopupMessage(res.data.message);
      })
      .catch(() => { /* keep the defaults above */ });
    return () => { cancelled = true; };
  }, []);

  const fetchItems = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await Instance.get(`/api/remedies?type=${type}`, {
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

  // Was an unfiltered Supabase Realtime subscription on the whole
  // `remedy_items` table, opened once per remedy type — a customer browsing
  // all three types (puja/gemstone/specific_puja) accumulated three identical
  // subscriptions to the same table. Now shares the one backend fanout (see
  // hooks/useRemedyListSync.js) regardless of how many RemedyShop instances
  // (one per type) are mounted at once.
  useRemedyListSync(() => { fetchItems(); });

  const openBuy = async item => {
    captureEvent('remedy_buy_now_clicked', {
      item_id: item._id, item_title: item.title, remedy_type: type, price: item.price,
    });
    setSelected(item);
    setQty(1);
    setUnavailable(false);
    setAddress('');
    // Prefill name/phone from stored profile if available
    try {
      const storedPhone = await AsyncStorage.getItem('userPhone');
      const storedName = await AsyncStorage.getItem('userName');
      setPhone(storedPhone || '');
      setName(storedName || '');
    } catch (_) {
      setPhone('');
      setName('');
    }
  };

  // Remedies delivery/fulfillment isn't live yet — per product decision, Place
  // Order deliberately does NOT call POST /api/orders and does NOT touch the
  // wallet in any way. It just tells the customer this isn't serviceable in
  // their area yet and that nothing was charged, so a real user never ends up
  // thinking they completed a purchase that nobody will ever act on.
  const placeOrder = () => {
    if (!phone.trim()) {
      Alert.alert(t('order.phoneRequired'), t('order.phoneRequiredMsg'));
      return;
    }
    const total = (selected?.price || 0) * qty;
    captureEvent('remedy_place_order_clicked', {
      item_id: selected._id, item_title: selected.title, remedy_type: type, quantity: qty, total,
    });
    setUnavailable(true);
  };

  // One place that decides an item's display language, used by the card, the
  // order sheet and the "not delivering yet" message. They used to disagree:
  // the CARD showed the Hindi title while the order sheet below it showed the
  // raw English one for the very same product.
  //
  // The `!== item.title` guard mirrors remedyCategories.js — /api/remedies
  // builds Hindi as `title_hi || title`, so an untranslated row comes back with
  // the English string wearing a Hindi label. Falling back explicitly is
  // equivalent here (both yield English), but it keeps the two screens reading
  // the same way rather than one quietly relying on that coincidence.
  const localized = (item, field) => {
    if (!item) return '';
    const en = item[field];
    if (language !== 'Hindi') return en;
    const hi = item.hindi?.[field];
    return hi && hi !== en ? hi : en;
  };

  const renderItem = ({ item }) => {
    const title = localized(item, 'title');
    const description = localized(item, 'description');
    return (
      <View style={styles.card}>
        <Image
          source={{ uri: item.image || 'https://astrowaniindia.com/wp-content/uploads/2024/05/second-300x300.jpg' }}
          style={styles.image}
        />
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {description ? (
          <Text style={styles.desc} numberOfLines={2}>{description}</Text>
        ) : null}
        <Text style={styles.price}>₹{item.price}</Text>
        <TouchableOpacity style={styles.buyBtn} onPress={() => openBuy(item)}>
          <Text style={styles.buyBtnTxt}>{t('remedies.buyNow')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

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
          keyExtractor={item => item._id}
          numColumns={2}
          columnWrapperStyle={{ justifyContent: 'space-between' }}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Order modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {unavailable ? (
              <View style={styles.successBox}>
                <Text style={styles.successTitle}>{popupTitle}</Text>
                <Text style={styles.successMsg}>
                  {popupMessage.replace('{item}', localized(selected, 'title') || selected?.title || 'this item')}
                </Text>
                <TouchableOpacity style={styles.doneBtn} onPress={() => setSelected(null)}>
                  <Text style={styles.placeBtnTxt}>{t('order.done')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalHeading}>{t('order.placeOrder')}</Text>
                <View style={styles.itemRow}>
                  <Image source={{ uri: selected?.image }} style={styles.itemThumb} />
                  <View style={{ flex: 1, marginLeft: scale(10) }}>
                    <Text style={styles.itemTitle}>{localized(selected, 'title')}</Text>
                    <Text style={styles.itemPrice}>₹{selected?.price}</Text>
                  </View>
                </View>

                <Text style={styles.label}>{t('order.quantity')}</Text>
                <View style={styles.qtyRow}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(q => Math.max(1, q - 1))}>
                    <Text style={styles.qtyBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyVal}>{qty}</Text>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(q => q + 1)}>
                    <Text style={styles.qtyBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>{t('order.yourName')}</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t('order.fullName')} placeholderTextColor="#999" />

                <Text style={styles.label}>{t('order.contactPhone')}</Text>
                <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder={t('order.phoneNumber')} placeholderTextColor="#999" keyboardType="phone-pad" />

                <Text style={styles.label}>{t('order.addressNotes')}</Text>
                <TextInput
                  style={[styles.input, { height: verticalScale(70), textAlignVertical: 'top' }]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder={t('order.addressPlaceholder')}
                  placeholderTextColor="#999"
                  multiline
                />

                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t('order.total')}</Text>
                  <Text style={styles.totalVal}>₹{(selected?.price || 0) * qty}</Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelected(null)}>
                    <Text style={styles.cancelBtnTxt}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.placeBtn} onPress={placeOrder}>
                    <Text style={styles.placeBtnTxt}>{t('order.placeOrder')}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.AstroSoftOrange },
  listContainer: { padding: scale(12), paddingBottom: verticalScale(30) },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: scale(20) },
  emptyText: { color: COLORS.black, fontSize: moderateScale(15), textAlign: 'center' },
  errorText: { color: COLORS.red, fontSize: moderateScale(15), textAlign: 'center', marginTop: verticalScale(20) },
  card: {
    width: '48%',
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
    marginBottom: verticalScale(12),
    padding: scale(8),
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
  },
  image: { width: '100%', height: verticalScale(120), borderRadius: moderateScale(8), backgroundColor: '#f0f0f0' },
  title: { color: COLORS.black, fontSize: moderateScale(14), fontFamily: 'Lato-Bold', marginTop: verticalScale(8) },
  desc: { color: '#666', fontSize: moderateScale(12), marginTop: verticalScale(2) },
  price: { color: COLORS.AstroMaroon, fontSize: moderateScale(15), fontFamily: 'Lato-Bold', marginTop: verticalScale(6) },
  buyBtn: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(8),
    paddingVertical: verticalScale(8),
    alignItems: 'center',
    marginTop: verticalScale(8),
  },
  buyBtnTxt: { color: '#fff', fontFamily: 'Lato-Bold', fontSize: moderateScale(13) },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: moderateScale(20),
    borderTopRightRadius: moderateScale(20),
    padding: scale(18),
    maxHeight: '88%',
  },
  modalHeading: { fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: COLORS.black, marginBottom: verticalScale(12) },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(12) },
  itemThumb: { width: scale(60), height: scale(60), borderRadius: moderateScale(8), backgroundColor: '#f0f0f0' },
  itemTitle: { fontSize: moderateScale(15), fontFamily: 'Lato-Bold', color: COLORS.black },
  itemPrice: { fontSize: moderateScale(14), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold', marginTop: verticalScale(2) },
  label: { fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.black, marginTop: verticalScale(10), marginBottom: verticalScale(4) },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: moderateScale(8),
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(8),
    fontSize: moderateScale(14),
    color: COLORS.black,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center' },
  qtyBtn: {
    width: scale(36), height: scale(36), borderRadius: moderateScale(8),
    backgroundColor: COLORS.AstroSoftOrange, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.AstroMaroon,
  },
  qtyBtnTxt: { fontSize: moderateScale(20), color: COLORS.AstroMaroon, fontFamily: 'Lato-Bold' },
  qtyVal: { fontSize: moderateScale(16), fontFamily: 'Lato-Bold', color: COLORS.black, marginHorizontal: scale(18) },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: verticalScale(16), paddingTop: verticalScale(10), borderTopWidth: 1, borderTopColor: '#eee' },
  totalLabel: { fontSize: moderateScale(15), fontFamily: 'Lato-Bold', color: COLORS.black },
  totalVal: { fontSize: moderateScale(18), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: verticalScale(16), marginBottom: verticalScale(6) },
  cancelBtn: { flex: 1, paddingVertical: verticalScale(12), borderRadius: moderateScale(8), alignItems: 'center', backgroundColor: '#eee', marginRight: scale(8) },
  cancelBtnTxt: { color: COLORS.black, fontFamily: 'Lato-Bold', fontSize: moderateScale(14) },
  placeBtn: { flex: 1, paddingVertical: verticalScale(12), borderRadius: moderateScale(8), alignItems: 'center', backgroundColor: COLORS.AstroMaroon, marginLeft: scale(8) },
  placeBtnTxt: { color: '#fff', fontFamily: 'Lato-Bold', fontSize: moderateScale(14) },
  // Standalone version of placeBtn — that one relies on `flex: 1` inside the
  // horizontal Cancel/Place-Order row to size itself, which collapsed it to a
  // tiny, near-invisible blob when reused by itself in the "not delivering
  // yet" popup (no flex row to size against, no horizontal padding to fall
  // back on). This one sizes off its own padding instead.
  doneBtn: {
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(36),
    borderRadius: moderateScale(8),
    alignItems: 'center',
    backgroundColor: COLORS.AstroMaroon,
    marginTop: verticalScale(4),
  },
  successBox: { alignItems: 'center', paddingVertical: verticalScale(20) },
  successTitle: { fontSize: moderateScale(20), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(10) },
  successMsg: { fontSize: moderateScale(14), color: COLORS.black, textAlign: 'center', marginBottom: verticalScale(18), lineHeight: verticalScale(20) },
});

export default RemedyShop;
