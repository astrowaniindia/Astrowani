import React, { useCallback, useContext, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import { listAddresses, updateAddress, deleteAddress } from '../../api/OrdersApi';

const LABEL_ICON = { home: 'home', work: 'work', other: 'place' };

// Saved delivery addresses.
//
// "Selected" is simply the DEFAULT address — the cart reads `is_default`, so choosing one
// here is a PUT that flips that flag rather than a separate selection stored somewhere
// else. One source of truth, and the choice survives closing the app.
//
// In `selectMode` (arrived at from the cart) picking an address navigates straight back, so
// the flow is one tap rather than pick-then-confirm.
const AddressList = ({ navigation, route }) => {
  const { t } = useContext(LanguageContext);
  const selectMode = route?.params?.selectMode;

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      setAddresses(await listAddresses());
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const select = async (address) => {
    if (address.is_default) {
      if (selectMode) navigation.goBack();
      return;
    }
    setBusyId(address.id);
    try {
      // The PUT needs the full body (the endpoint validates every required field), so the
      // existing values are sent back alongside the flag being changed.
      await updateAddress(address.id, { ...address, is_default: true });
      if (selectMode) { navigation.goBack(); return; }
      await load();
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (address) => {
    Alert.alert(
      t('address.deleteTitle'),
      t('address.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('address.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(address.id);
            try {
              await deleteAddress(address.id);
              await load();
            } catch (err) {
              Alert.alert(t('common.error'), err.message);
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => select(item)}>
      <View style={styles.cardTop}>
        <Icon
          name={item.is_default ? 'radio-button-checked' : 'radio-button-unchecked'}
          size={moderateScale(20)}
          color={item.is_default ? COLORS.AstroMaroon : '#bbb'}
        />
        <View style={styles.labelPill}>
          <Icon name={LABEL_ICON[item.label] || 'place'} size={moderateScale(12)} color={COLORS.AstroMaroon} />
          <Text style={styles.labelPillText}>{t(`address.label_${item.label}`)}</Text>
        </View>
        {busyId === item.id ? <ActivityIndicator size="small" color={COLORS.AstroMaroon} /> : null}
      </View>

      <Text style={styles.name}>{item.full_name} · {item.phone}</Text>
      <Text style={styles.line}>
        {[item.house_flat, item.street_area, item.landmark, item.city, item.state, item.pincode]
          .filter(Boolean).join(', ')}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => navigation.navigate('AddressForm', { address: item })}>
          <Icon name="edit" size={moderateScale(14)} color={COLORS.AstroMaroon} />
          <Text style={styles.actionText}>{t('address.edit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item)}>
          <Icon name="delete-outline" size={moderateScale(14)} color={COLORS.red} />
          <Text style={[styles.actionText, { color: COLORS.red }]}>{t('address.delete')}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.AstroMaroon} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Icon name="place" size={moderateScale(44)} color="#ddd" />
            <Text style={styles.emptyText}>{t('address.none')}</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => navigation.navigate('AddressForm', { makeDefault: addresses.length === 0 })}>
        <Icon name="add" size={moderateScale(20)} color={COLORS.white} />
        <Text style={styles.addBtnText}>{t('address.addNew')}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  list: { padding: scale(12), paddingBottom: verticalScale(20) },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: moderateScale(12),
    padding: scale(12),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(8) },
  labelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.AstroSoftOrange,
    borderRadius: moderateScale(6),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(2),
    marginLeft: scale(8),
    flex: 1,
    alignSelf: 'flex-start',
    maxWidth: scale(90),
  },
  labelPillText: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(10),
    marginLeft: scale(4),
  },
  name: { fontSize: moderateScale(13), fontFamily: 'Lato-Bold', color: COLORS.black },
  line: { fontSize: moderateScale(12), color: '#666', marginTop: verticalScale(3), lineHeight: verticalScale(17) },
  actions: { flexDirection: 'row', marginTop: verticalScale(10), borderTopWidth: 1, borderTopColor: '#f2f2f2', paddingTop: verticalScale(8) },
  actionBtn: { flexDirection: 'row', alignItems: 'center', marginRight: scale(20) },
  actionText: { fontSize: moderateScale(12), fontFamily: 'Lato-Bold', color: COLORS.AstroMaroon, marginLeft: scale(4) },
  emptyBox: { alignItems: 'center', paddingVertical: verticalScale(70) },
  emptyText: { fontSize: moderateScale(13), color: '#999', marginTop: verticalScale(10) },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.AstroMaroon,
    margin: scale(12),
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(13),
  },
  addBtnText: { color: COLORS.white, fontFamily: 'Lato-Bold', fontSize: moderateScale(15), marginLeft: scale(6) },
});

export default AddressList;
