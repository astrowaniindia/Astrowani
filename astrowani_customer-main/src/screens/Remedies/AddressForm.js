import React, { useContext, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, PermissionsAndroid,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import { createAddress, updateAddress, listAddresses } from '../../api/OrdersApi';
import { getCustomerIdentity } from '../../utils/customerIdentity';
import SHOP, { shopStyles } from '../../components/shop/shopTheme';
import { reverseGeocode } from '../../utils/geocoding';
import { captureEvent } from '../../utils/Analytics';

const LABELS = [
  { key: 'home', icon: 'home' },
  { key: 'work', icon: 'work' },
  { key: 'other', icon: 'place' },
];

// Add / edit a delivery address. Doubles as both — route.params.address means edit.
//
// Validation is duplicated here and in the backend on purpose: the client copy exists to
// give an instant, field-level message, and the server copy is the one that actually
// decides (the DB additionally CHECKs the pincode shape). Never rely on this alone.
const AddressForm = ({ navigation, route }) => {
  const { t } = useContext(LanguageContext);
  const existing = route?.params?.address || null;
  const isEdit = !!existing;

  const [label, setLabel] = useState(existing?.label || 'home');
  const [fullName, setFullName] = useState(existing?.full_name || '');
  const [phone, setPhone] = useState(existing?.phone || '');
  const [houseFlat, setHouseFlat] = useState(existing?.house_flat || '');
  const [streetArea, setStreetArea] = useState(existing?.street_area || '');
  const [landmark, setLandmark] = useState(existing?.landmark || '');
  const [city, setCity] = useState(existing?.city || '');
  const [state, setState] = useState(existing?.state || '');
  const [pincode, setPincode] = useState(existing?.pincode || '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [locating, setLocating] = useState(false);

  // Prefill name + phone for a NEW address. Opening this form completely blank made
  // someone retype details the app already had on every single order.
  //
  // Priority is deliberate: the most recent SAVED address wins over the profile, because
  // if a customer previously corrected the delivery name or number (a spouse's number, a
  // shop's name) that correction is the better answer than whatever their account says.
  // Only ever fills empty fields, so this can never clobber typing already in progress,
  // and never runs when editing — an existing address's own values must stand.
  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    (async () => {
      let name = '';
      let phone = '';
      try {
        const saved = await listAddresses();
        if (saved.length) {
          const latest = saved.find((a) => a.is_default) || saved[0];
          name = latest.full_name || '';
          phone = latest.phone || '';
        }
      } catch (_) {
        // No saved addresses, or the call failed — fall back to the account below.
      }
      if (!name || !phone) {
        const me = await getCustomerIdentity();
        name = name || me.name;
        phone = phone || me.phone;
      }
      if (cancelled) return;
      if (name) setFullName((v) => v || name);
      if (phone) setPhone((v) => v || phone);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * "Use my current location" — GPS fix, then a keyless reverse lookup to fill in the
   * parts of the address a phone can actually know.
   *
   * Deliberately fills ONLY city / state / pincode / area and leaves name, phone and
   * flat-or-house-number alone: a GPS fix cannot know a door number, and silently
   * overwriting what someone already typed is worse than asking them to finish it.
   *
   * Uses the app's existing keyless geocoder (utils/geocoding.js — Open-Meteo +
   * BigDataCloud), NOT Google, because this project's Google Maps key had billing
   * disabled and every call returned REQUEST_DENIED. Nothing here needs an API key.
   */
  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setLocating(false);
          Alert.alert(t('address.locationDeniedTitle'), t('address.locationDeniedMsg'));
          return;
        }
      }

      // Geolocation's callback API predates promises, so wrap it to keep the await flow.
      const coords = await new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(new Error(err?.message || 'Could not get a location fix')),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
        );
      });

      const place = await reverseGeocode(coords.latitude, coords.longitude);

      // Only overwrite a field if the lookup actually produced something for it, so a
      // partial result can't blank out a value the customer already had.
      if (place.city) setCity(place.city);
      if (place.region) setState(place.region);
      if (place.postcode) setPincode(place.postcode);
      if (place.area) setStreetArea(place.area);
      setErrors({});

      // The pincode is the one field a reverse lookup often can't resolve, and it's
      // required — so say so rather than leaving them to discover it on save.
      if (!place.postcode) {
        Alert.alert(t('address.locationFoundTitle'), t('address.locationNoPincode'));
      }
    } catch (err) {
      Alert.alert(t('address.locationFailedTitle'), err.message || t('address.locationFailedMsg'));
    } finally {
      setLocating(false);
    }
  };

  const validate = () => {
    const next = {};
    if (!fullName.trim()) next.fullName = t('address.errName');
    // Indian mobile numbers are 10 digits and never start with 0-5.
    if (!/^[6-9][0-9]{9}$/.test(phone.replace(/\D/g, '').slice(-10))) next.phone = t('address.errPhone');
    if (!houseFlat.trim()) next.houseFlat = t('address.errHouse');
    if (!city.trim()) next.city = t('address.errCity');
    // Mirrors the DB CHECK: 6 digits, never leading zero.
    if (!/^[1-9][0-9]{5}$/.test(pincode.trim())) next.pincode = t('address.errPincode');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setSaving(true);
    const body = {
      label,
      full_name: fullName.trim(),
      phone: phone.replace(/\D/g, '').slice(-10),
      house_flat: houseFlat.trim(),
      street_area: streetArea.trim() || null,
      landmark: landmark.trim() || null,
      city: city.trim(),
      state: state.trim() || null,
      pincode: pincode.trim(),
    };
    try {
      if (isEdit) {
        await updateAddress(existing.id, { ...body, is_default: existing.is_default });
      } else {
        // A newly added address becomes the selected one, so the customer returns to the
        // cart with it already chosen rather than having to pick it as a second step.
        await createAddress({ ...body, is_default: true });
        captureEvent('address_added', { label });
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setSaving(false);
    }
  };

  // A plain function, not a component: rendering these as <Field /> would remount every
  // input on each keystroke and the field would lose focus mid-typing.
  const renderField = ({ value, onChangeText, placeholder, error, keyboardType, maxLength, autoCapitalize }) => (
    <View style={styles.fieldWrap}>
      <TextInput
        style={[styles.input, error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#aaa"
        keyboardType={keyboardType}
        maxLength={maxLength}
        autoCapitalize={autoCapitalize || 'words'}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={shopStyles.sectionLabel}>{t('address.saveAs')}</Text>
        <View style={styles.labelRow}>
          {LABELS.map((l) => {
            const active = label === l.key;
            return (
              <TouchableOpacity
                key={l.key}
                style={[styles.labelChip, active && styles.labelChipActive]}
                onPress={() => setLabel(l.key)}>
                <Icon
                  name={l.icon}
                  size={moderateScale(14)}
                  color={active ? COLORS.white : COLORS.AstroMaroon}
                />
                <Text style={[styles.labelChipText, active && styles.labelChipTextActive]}>
                  {t(`address.label_${l.key}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={shopStyles.sectionLabel}>{t('address.contact')}</Text>
        {renderField({
          value: fullName, onChangeText: setFullName,
          placeholder: t('address.fullName'), error: errors.fullName,
        })}
        {renderField({
          value: phone, onChangeText: setPhone,
          placeholder: t('address.phone'), error: errors.phone,
          keyboardType: 'phone-pad', maxLength: 10,
        })}

        <Text style={shopStyles.sectionLabel}>{t('address.whereToDeliver')}</Text>

        {/* Fills city / state / pincode / area from a GPS fix. The flat or house number
            still has to be typed — no location API can know it. */}
        <TouchableOpacity
          style={styles.locBtn}
          onPress={locating ? undefined : useCurrentLocation}
          disabled={locating}
          activeOpacity={0.8}>
          {locating ? (
            <ActivityIndicator size="small" color={COLORS.AstroMaroon} />
          ) : (
            <Icon name="my-location" size={moderateScale(17)} color={COLORS.AstroMaroon} />
          )}
          <Text style={styles.locBtnText}>
            {locating ? t('address.locating') : t('address.useCurrentLocation')}
          </Text>
        </TouchableOpacity>
        {renderField({
          value: houseFlat, onChangeText: setHouseFlat,
          placeholder: t('address.houseFlat'), error: errors.houseFlat,
        })}
        {renderField({
          value: streetArea, onChangeText: setStreetArea,
          placeholder: t('address.streetArea'),
        })}
        {renderField({
          value: landmark, onChangeText: setLandmark,
          placeholder: t('address.landmark'),
        })}
        {renderField({
          value: city, onChangeText: setCity,
          placeholder: t('address.city'), error: errors.city,
        })}
        {renderField({
          value: state, onChangeText: setState,
          placeholder: t('address.state'),
        })}
        {renderField({
          value: pincode, onChangeText: setPincode,
          placeholder: t('address.pincode'), error: errors.pincode,
          keyboardType: 'number-pad', maxLength: 6,
        })}
      </ScrollView>

      <TouchableOpacity style={styles.saveBtn} disabled={saving} onPress={save}>
        {saving ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Text style={styles.saveBtnText}>
            {isEdit ? t('address.saveChanges') : t('address.saveAddress')}
          </Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SHOP.surface },
  scroll: { padding: scale(16), paddingBottom: verticalScale(20) },

  labelRow: { flexDirection: 'row', marginBottom: verticalScale(4) },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: SHOP.border,
    backgroundColor: SHOP.surfaceAlt,
    borderRadius: moderateScale(22),
    paddingHorizontal: scale(13),
    paddingVertical: verticalScale(7),
    marginRight: scale(8),
  },
  labelChipActive: { backgroundColor: SHOP.brand, borderColor: SHOP.brand },
  labelChipText: {
    color: SHOP.textSoft,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
    marginLeft: scale(5),
  },
  labelChipTextActive: { color: COLORS.white },

  // Dashed, so it reads as an assist rather than the screen's primary action — which is
  // Save at the bottom.
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: SHOP.brand,
    borderStyle: 'dashed',
    borderRadius: moderateScale(10),
    backgroundColor: '#FFFBF8',
    paddingVertical: verticalScale(11),
    marginBottom: verticalScale(14),
  },
  locBtnText: {
    color: SHOP.brand,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(13),
    marginLeft: scale(7),
  },

  fieldWrap: { marginBottom: verticalScale(11) },
  input: {
    borderWidth: 1,
    borderColor: SHOP.border,
    borderRadius: moderateScale(10),
    paddingHorizontal: scale(13),
    paddingVertical: verticalScale(11),
    fontSize: moderateScale(14),
    color: SHOP.text,
    backgroundColor: SHOP.surfaceAlt,
  },
  inputError: { borderColor: SHOP.danger, backgroundColor: '#FFF6F5' },
  errorText: {
    color: SHOP.danger,
    fontSize: moderateScale(11),
    marginTop: verticalScale(4),
    marginLeft: scale(3),
  },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SHOP.brand,
    margin: scale(16),
    borderRadius: moderateScale(11),
    paddingVertical: verticalScale(14),
  },
  saveBtnText: { color: COLORS.white, fontFamily: 'Lato-Bold', fontSize: moderateScale(15) },
});

export default AddressForm;
