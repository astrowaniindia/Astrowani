// "Report this customer" bottom sheet — reason list, optional note, and an
// optional block in the same action.
//
// One shared component because the same sheet has to be reachable from two places:
// the live chat screen (where abuse actually happens) and My Customers (afterwards,
// once the session is over). Store review looks for the mechanism to be reachable
// from the place the content is, so the in-chat entry point is the important one.
//
// Reporting and blocking are offered TOGETHER but sent as separate intents: an
// astrologer may want to flag someone without losing a paying customer, or cut
// contact without filing a complaint. The checkbox is opt-in, not the default.
import React, { useContext, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Pressable,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { COLORS } from '../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { reportCustomer, REPORT_REASONS } from '../api/ModerationApi';
import { showStatusPopup } from './StatusPopup';

export default function ReportCustomerSheet({ visible, customer, onClose, onBlocked }) {
  const { t } = useContext(LanguageContext);
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => { setReason(null); setNote(''); setAlsoBlock(false); setBusy(false); };
  const close = () => { if (!busy) { reset(); onClose?.(); } };

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      const { blocked } = await reportCustomer({
        customerId: customer?.id,
        reason,
        note: note.trim(),
        alsoBlock,
      });
      reset();
      onClose?.();
      if (blocked) onBlocked?.(customer);
      showStatusPopup({
        variant: 'success',
        title: t('moderation.reportSentTitle'),
        // Deliberately does NOT promise an outcome or a timeline — it confirms
        // receipt only. Anything more would be a commitment nobody can keep.
        message: blocked ? t('moderation.reportSentAndBlocked') : t('moderation.reportSentBody'),
      });
    } catch (e) {
      setBusy(false);
      showStatusPopup({
        variant: 'error',
        title: t('moderation.reportFailedTitle'),
        message: e?.message || t('moderation.reportFailedBody'),
      });
    }
  };

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('moderation.reportTitle')}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {customer?.name
            ? t('moderation.reportSubtitleNamed', { name: customer.name })
            : t('moderation.reportSubtitle')}
        </Text>

        <ScrollView style={styles.reasonScroll} keyboardShouldPersistTaps="handled">
          {REPORT_REASONS.map((r) => {
            const active = reason === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.reasonRow, active && styles.reasonRowActive]}
                activeOpacity={0.85}
                onPress={() => setReason(r)}>
                <MaterialIcons
                  name={active ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={moderateScale(20)}
                  color={active ? COLORS.AstroMaroon : '#9b8a80'}
                />
                <Text style={[styles.reasonText, active && styles.reasonTextActive]}>
                  {t(`moderation.reason.${r}`)}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            placeholder={t('moderation.notePlaceholder')}
            placeholderTextColor="#a89890"
            multiline
            maxLength={500}
          />

          <TouchableOpacity
            style={styles.blockRow}
            activeOpacity={0.85}
            onPress={() => setAlsoBlock((v) => !v)}>
            <MaterialIcons
              name={alsoBlock ? 'check-box' : 'check-box-outline-blank'}
              size={moderateScale(22)}
              color={alsoBlock ? COLORS.AstroMaroon : '#9b8a80'}
            />
            <View style={{ flex: 1, marginLeft: scale(8) }}>
              <Text style={styles.blockLabel}>{t('moderation.alsoBlock')}</Text>
              <Text style={styles.blockHint}>{t('moderation.alsoBlockHint')}</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={close} disabled={busy}>
            <Text style={styles.cancelText}>{t('moderation.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.submitBtn, (!reason || busy) && styles.btnDisabled]}
            onPress={submit}
            disabled={!reason || busy}>
            {busy
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.submitText}>{t('moderation.submit')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: moderateScale(18),
    borderTopRightRadius: moderateScale(18),
    paddingHorizontal: scale(18),
    paddingBottom: verticalScale(18),
    maxHeight: '82%',
  },
  grabber: {
    width: scale(44), height: verticalScale(4), borderRadius: 4,
    backgroundColor: '#e0d2ca', alignSelf: 'center', marginTop: verticalScale(10),
  },
  title: {
    fontSize: moderateScale(17), fontFamily: 'Lato-Bold', fontWeight: 'bold',
    color: COLORS.AstroMaroon, marginTop: verticalScale(12),
  },
  subtitle: { fontSize: moderateScale(12), color: '#7b6a60', marginTop: verticalScale(3) },
  reasonScroll: { marginTop: verticalScale(12) },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: verticalScale(10), paddingHorizontal: scale(10),
    borderRadius: moderateScale(10), borderWidth: 1, borderColor: '#efe4de',
    marginBottom: verticalScale(7),
  },
  reasonRowActive: { borderColor: COLORS.AstroMaroon, backgroundColor: 'rgba(89,42,25,0.05)' },
  reasonText: { marginLeft: scale(9), fontSize: moderateScale(13), color: '#3b2a20' },
  reasonTextActive: { fontFamily: 'Lato-Bold', fontWeight: 'bold', color: COLORS.AstroMaroon },
  note: {
    borderWidth: 1, borderColor: '#efe4de', borderRadius: moderateScale(10),
    padding: scale(11), minHeight: verticalScale(70), textAlignVertical: 'top',
    fontSize: moderateScale(13), color: '#3b2a20', marginTop: verticalScale(4),
  },
  blockRow: {
    flexDirection: 'row', alignItems: 'flex-start', marginTop: verticalScale(12),
    padding: scale(10), borderRadius: moderateScale(10), backgroundColor: '#faf6f4',
  },
  blockLabel: { fontSize: moderateScale(13), fontFamily: 'Lato-Bold', fontWeight: 'bold', color: '#3b2a20' },
  blockHint: { fontSize: moderateScale(11), color: '#7b6a60', marginTop: verticalScale(2) },
  actions: { flexDirection: 'row', marginTop: verticalScale(14) },
  btn: {
    flex: 1, paddingVertical: verticalScale(12), borderRadius: moderateScale(11),
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: { backgroundColor: '#f1e8e3', marginRight: scale(8) },
  submitBtn: { backgroundColor: COLORS.AstroMaroon },
  btnDisabled: { opacity: 0.5 },
  cancelText: { color: '#6b5a50', fontFamily: 'Lato-Bold', fontWeight: 'bold', fontSize: moderateScale(14) },
  submitText: { color: '#fff', fontFamily: 'Lato-Bold', fontWeight: 'bold', fontSize: moderateScale(14) },
});
