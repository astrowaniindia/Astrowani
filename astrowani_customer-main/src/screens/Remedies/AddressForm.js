import React, { useContext, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { COLORS } from '../../Theme/Colors';
import { LanguageContext } from '../../context/LanguageContext';
import { createAddress, updateAddress } from '../../api/OrdersApi';
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
        <Text style={styles.sectionLabel}>{t('address.saveAs')}</Text>
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

        <Text style={styles.sectionLabel}>{t('address.contact')}</Text>
        {renderField({
          value: fullName, onChangeText: setFullName,
          placeholder: t('address.fullName'), error: errors.fullName,
        })}
        {renderField({
          value: phone, onChangeText: setPhone,
          placeholder: t('address.phone'), error: errors.phone,
          keyboardType: 'phone-pad', maxLength: 10,
        })}

        <Text style={styles.sectionLabel}>{t('address.whereToDeliver')}</Text>
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
  container: { flex: 1, backgroundColor: COLORS.white },
  scroll: { padding: scale(16), paddingBottom: verticalScale(20) },
  sectionLabel: {
    fontSize: moderateScale(12),
    fontFamily: 'Lato-Bold',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: verticalScale(14),
    marginBottom: verticalScale(8),
  },
  labelRow: { flexDirection: 'row' },
  labelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(20),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(6),
    marginRight: scale(8),
  },
  labelChipActive: { backgroundColor: COLORS.AstroMaroon },
  labelChipText: {
    color: COLORS.AstroMaroon,
    fontFamily: 'Lato-Bold',
    fontSize: moderateScale(12),
    marginLeft: scale(5),
  },
  labelChipTextActive: { color: COLORS.white },
  fieldWrap: { marginBottom: verticalScale(10) },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: moderateScale(9),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
    fontSize: moderateScale(14),
    color: COLORS.black,
    backgroundColor: '#fafafa',
  },
  inputError: { borderColor: COLORS.red },
  errorText: { color: COLORS.red, fontSize: moderateScale(11), marginTop: verticalScale(3), marginLeft: scale(3) },
  saveBtn: {
    backgroundColor: COLORS.AstroMaroon,
    margin: scale(16),
    borderRadius: moderateScale(10),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
  },
  saveBtnText: { color: COLORS.white, fontFamily: 'Lato-Bold', fontSize: moderateScale(15) },
});

export default AddressForm;
