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
import SHOP, { shopStyles, cardShadow } from '../../components/shop/shopTheme';

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

  const renderItem = ({ item }) => {
    const selected = item.is_default;
    return (
      <TouchableOpacity
        // A selected card gets a brand-coloured border rather than only a filled radio, so
        // which address will be used is readable at a glance from across the list.
        style={[styles.card, selected && styles.cardSelected]}
        activeOpacity={0.85}
        onPress={() => select(item)}>
        <View style={styles.top}>
          <Icon
            name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
            size={moderateScale(20)}
            color={selected ? SHOP.brand : '#C9BDB4'}
          />
          <View style={styles.labelPill}>
            <Icon name={LABEL_ICON[item.label] || 'place'} size={moderateScale(11)} color={SHOP.brand} />
            <Text style={styles.labelPillText}>{t(`address.label_${item.label}`)}</Text>
          </View>
          {selected ? (
            <View style={styles.defaultPill}>
              <Text style={styles.defaultPillText}>{t('address.deliveringHere')}</Text>
            </View>
          ) : null}
          {busyId === item.id ? <ActivityIndicator size="small" color={SHOP.brand} /> : null}
        </View>

        <Text style={styles.name}>{item.full_name}</Text>
        <Text style={styles.phone}>{item.phone}</Text>
        <Text style={styles.line}>
          {[item.house_flat, item.street_area, item.landmark, item.city, item.state]
            .filter(Boolean).join(', ')}
        </Text>
        <Text style={styles.pincode}>{item.pincode}</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('AddressForm', { address: item })}>
            <Icon name="edit" size={moderateScale(14)} color={SHOP.brand} />
            <Text style={styles.actionText}>{t('address.edit')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => confirmDelete(item)}>
            <Icon name="delete-outline" size={moderateScale(14)} color={SHOP.danger} />
            <Text style={[styles.actionText, { color: SHOP.danger }]}>{t('address.delete')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SHOP.brand} />
      </View>
    );
  }

  return (
    <View style={shopStyles.screen}>
      <FlatList
        data={addresses}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          addresses.length ? (
            <Text style={shopStyles.sectionLabel}>{t('address.savedAddresses')}</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={shopStyles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <Icon name="location-off" size={moderateScale(36)} color={SHOP.textMuted} />
            </View>
            <Text style={shopStyles.emptyTitle}>{t('address.none')}</Text>
            <Text style={shopStyles.emptySub}>{t('address.noneHint')}</Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={shopStyles.primaryBtn}
          onPress={() => navigation.navigate('AddressForm', { makeDefault: addresses.length === 0 })}>
          <Icon name="add" size={moderateScale(19)} color={COLORS.white} />
          <Text style={[shopStyles.primaryBtnText, styles.addBtnText]}>{t('address.addNew')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: SHOP.surface },
  list: { padding: scale(14), paddingBottom: verticalScale(20) },

  card: { ...cardShadow, padding: scale(13), marginBottom: verticalScale(12) },
  cardSelected: { borderColor: SHOP.brand, borderWidth: 1.5 },

  top: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(9) },
  labelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SHOP.brandTint,
    borderRadius: moderateScale(6),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(2),
    marginLeft: scale(8),
  },
  labelPillText: {
    color: SHOP.brand,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(10),
    marginLeft: scale(4),
  },
  defaultPill: {
    backgroundColor: SHOP.successBg,
    borderRadius: moderateScale(6),
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(2),
    marginLeft: scale(7),
  },
  defaultPillText: { color: SHOP.success, fontFamily: 'Lato-Bold', fontSize: moderateScale(9.5) },

  name: { fontSize: moderateScale(14), fontFamily: 'Lato-Bold', color: SHOP.text },
  phone: { fontSize: moderateScale(12.5), color: SHOP.textSoft, marginTop: verticalScale(1) },
  line: {
    fontSize: moderateScale(12.5),
    color: SHOP.textSoft,
    marginTop: verticalScale(4),
    lineHeight: verticalScale(18),
  },
  // The pincode is the one part a courier cannot guess, so it gets its own weight.
  pincode: {
    fontSize: moderateScale(13),
    fontFamily: 'Lato-Bold',
    color: SHOP.text,
    marginTop: verticalScale(2),
    letterSpacing: 0.5,
  },

  actions: {
    flexDirection: 'row',
    marginTop: verticalScale(11),
    borderTopWidth: 1,
    borderTopColor: SHOP.border,
    paddingTop: verticalScale(9),
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', marginRight: scale(22) },
  actionText: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Bold',
    color: SHOP.brand,
    marginLeft: scale(5),
  },

  emptyIconCircle: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: SHOP.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  footer: {
    padding: scale(14),
    backgroundColor: SHOP.surface,
    borderTopWidth: 1,
    borderTopColor: SHOP.border,
  },
  addBtnText: { marginLeft: scale(5) },
});

export default AddressList;
