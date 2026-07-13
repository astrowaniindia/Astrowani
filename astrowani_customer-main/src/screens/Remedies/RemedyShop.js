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
import { supabase } from '../../api/SupabaseClient';
import { LanguageContext } from '../../context/LanguageContext';

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
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);

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

  // Live sync — re-fetch when the admin adds/edits items (unique channel name per mount).
  useEffect(() => {
    const channelName = `remedy-${type}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'remedy_items' },
        () => fetchItems(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [type, fetchItems]);

  const openBuy = async item => {
    setSelected(item);
    setQty(1);
    setSuccess(false);
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

  const placeOrder = async () => {
    if (!phone.trim()) {
      Alert.alert('Phone required', 'Please enter a contact phone number.');
      return;
    }
    setPlacing(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await Instance.post(
        '/api/orders',
        {
          itemId: selected._id,
          quantity: qty,
          customerName: name,
          customerPhone: phone,
          address,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setSuccess(true);
    } catch (err) {
      Alert.alert('Order failed', err?.response?.data?.message || err.message);
    } finally {
      setPlacing(false);
    }
  };

  const renderItem = ({ item }) => {
    const title = language === 'Hindi' ? (item.hindi?.title || item.title) : item.title;
    const description = language === 'Hindi' ? (item.hindi?.description || item.description) : item.description;
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
        <Text style={styles.errorText}>Error: {error}</Text>
      ) : items.length === 0 ? (
        <View style={styles.loaderContainer}>
          <Text style={styles.emptyText}>No {headerTitle.toLowerCase()} available right now.</Text>
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
            {success ? (
              <View style={styles.successBox}>
                <Text style={styles.successTitle}>✅ Order Placed!</Text>
                <Text style={styles.successMsg}>
                  Your order for {selected?.title} has been placed. Our team will contact you on{' '}
                  {phone} to confirm and arrange payment.
                </Text>
                <TouchableOpacity style={styles.placeBtn} onPress={() => setSelected(null)}>
                  <Text style={styles.placeBtnTxt}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.modalHeading}>Place Order</Text>
                <View style={styles.itemRow}>
                  <Image source={{ uri: selected?.image }} style={styles.itemThumb} />
                  <View style={{ flex: 1, marginLeft: scale(10) }}>
                    <Text style={styles.itemTitle}>{selected?.title}</Text>
                    <Text style={styles.itemPrice}>₹{selected?.price}</Text>
                  </View>
                </View>

                <Text style={styles.label}>Quantity</Text>
                <View style={styles.qtyRow}>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(q => Math.max(1, q - 1))}>
                    <Text style={styles.qtyBtnTxt}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyVal}>{qty}</Text>
                  <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(q => q + 1)}>
                    <Text style={styles.qtyBtnTxt}>+</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Your name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor="#999" />

                <Text style={styles.label}>Contact phone *</Text>
                <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor="#999" keyboardType="phone-pad" />

                <Text style={styles.label}>Address / notes</Text>
                <TextInput
                  style={[styles.input, { height: verticalScale(70), textAlignVertical: 'top' }]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Delivery address or special instructions"
                  placeholderTextColor="#999"
                  multiline
                />

                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalVal}>₹{(selected?.price || 0) * qty}</Text>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelected(null)}>
                    <Text style={styles.cancelBtnTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.placeBtn} onPress={placeOrder} disabled={placing}>
                    <Text style={styles.placeBtnTxt}>{placing ? 'Placing…' : 'Place Order'}</Text>
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
  successBox: { alignItems: 'center', paddingVertical: verticalScale(20) },
  successTitle: { fontSize: moderateScale(20), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginBottom: verticalScale(10) },
  successMsg: { fontSize: moderateScale(14), color: COLORS.black, textAlign: 'center', marginBottom: verticalScale(18), lineHeight: verticalScale(20) },
});

export default RemedyShop;
