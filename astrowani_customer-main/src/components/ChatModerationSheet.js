// Report, and/or block, the ASTROLOGER you are in a consultation with.
//
// WHY THIS EXISTS: the two sides were asymmetric. The astrologer could report AND
// block the customer mid-chat (ReportCustomerSheet), while the customer could only
// report from the astrologer's PROFILE — not from inside the conversation — and
// could not block at all, anywhere in the app. App Store Guideline 1.2 asks for a
// filter, a way to report, and "the ability to block abusive users"; Play's UGC
// policy asks the same. This is the missing half.
//
// It matters more since 2026-10-12, when astrologers gained the ability to send
// PHOTOGRAPHS into this chat (CLAUDE.md DX): unmoderated image content from one
// user to another, with the recipient having no in-context way to report it.
//
// Deliberately modelled on LiveReportSheet — same layout, same radio rows, same
// "report", "report and block" and "just block" split — so the two moderation
// surfaces a customer can meet behave identically. Report and block stay
// INDEPENDENT: someone may want to flag an astrologer without cutting off a
// consultation they have paid for, or cut contact without filing a complaint.
import React, { useContext, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Instance from '../api/ApiCall';
import { COLORS } from '../Theme/Colors';
import { scale, verticalScale, moderateScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { showStatusPopup } from './StatusPopup';
import { useModalPresence } from '../utils/modalPresentation';
import { captureEvent } from '../utils/Analytics';

// These slugs must stay inside moderationRoutes.js's REASONS list, which the block
// endpoint validates against; anything else is refused with a 400. 'offPlatform'
// is deliberately absent for that reason — asking a customer to move to WhatsApp is
// already detected server-side on every message (CLAUDE.md CW) and is reported here
// as 'fraud'.
const REASONS = ['abusive', 'harassment', 'sexual', 'fraud', 'spam', 'other'];

// astrologer_reports.reason is free text read by an admin in the dashboard, so the
// report sends an English label rather than a key — same choice, and the same
// reason, as LiveReportSheet's STREAM_REASON_LABELS.
const REASON_LABELS = {
  abusive: 'Chat: abusive or offensive language',
  harassment: 'Chat: harassment',
  sexual: 'Chat: sexual content',
  fraud: 'Chat: fraud, scam or misleading claims',
  spam: 'Chat: spam',
  other: 'Chat: other',
};

/**
 * @param {object}   astrologer  { id, name }
 * @param {function} onBlocked   called after a successful block, so the screen can
 *                               reflect it (the session itself is left alone — see below)
 */
export default function ChatModerationSheet({ visible, astrologer, onClose, onBlocked }) {
  const { t } = useContext(LanguageContext);
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  useModalPresence(!!visible);

  const reset = () => { setReason(null); setNote(''); setAlsoBlock(false); setBusy(false); };
  const close = () => { if (!busy) { reset(); onClose?.(); } };

  const name = astrologer?.name || t('chatModeration.thisAstrologer');

  const doBlock = async (headers, slug) => {
    const res = await Instance.post(
      '/api/astrologers/block',
      { astrologerId: astrologer?.id, reason: slug || undefined },
      headers,
    );
    if (!res?.data?.success) throw new Error(res?.data?.message);
  };

  // Block without filing a report.
  const blockOnly = async () => {
    if (busy || !astrologer?.id) return;
    setBusy(true);
    try {
      const token = await AsyncStorage.getItem('token');
      await doBlock({ headers: { Authorization: `Bearer ${token}` } }, null);
      captureEvent('astrologer_blocked', { with_report: false });
      reset();
      onClose?.();
      onBlocked?.();
      showStatusPopup({
        variant: 'success',
        title: t('chatModeration.blockedTitle'),
        message: t('chatModeration.blockedBody', { name }),
      });
    } catch (e) {
      setBusy(false);
      showStatusPopup({
        variant: 'error',
        title: t('chatModeration.failedTitle'),
        message: e?.response?.data?.message || t('chatModeration.failedBody'),
      });
    }
  };

  const submit = async () => {
    if (!reason || busy || !astrologer?.id) return;
    setBusy(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = { headers: { Authorization: `Bearer ${token}` } };

      // The REPORT is the record that matters and goes first: if the block then
      // fails, the complaint still reached the admin. Same ordering, and the same
      // reasoning, as the astrologer-side route's `alsoBlock`.
      const res = await Instance.post('/api/reports', {
        astrologerId: astrologer.id,
        reason: REASON_LABELS[reason] || REASON_LABELS.other,
        note: note.trim() || null,
      }, headers);
      if (!res?.data?.success) throw new Error(res?.data?.message);

      let blocked = false;
      if (alsoBlock) {
        try {
          await doBlock(headers, reason);
          blocked = true;
        } catch (_) {
          // Best effort, deliberately swallowed: the report landed, and telling
          // someone their complaint failed when it did not is worse than a block
          // they can retry from the same sheet.
        }
      }

      captureEvent('astrologer_reported', { reason, blocked });
      reset();
      onClose?.();
      if (blocked) onBlocked?.();
      showStatusPopup({
        variant: 'success',
        title: t('chatModeration.sentTitle'),
        message: blocked
          ? t('chatModeration.sentBlocked', { name })
          : t('chatModeration.sentBody'),
      });
    } catch (e) {
      setBusy(false);
      showStatusPopup({
        variant: 'error',
        title: t('chatModeration.failedTitle'),
        message: e?.response?.data?.message || t('chatModeration.failedBody'),
      });
    }
  };

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('chatModeration.title')}</Text>
        <Text style={styles.subtitle} numberOfLines={3}>
          {t('chatModeration.subtitle', { name })}
        </Text>

        <ScrollView style={styles.reasonScroll} keyboardShouldPersistTaps="handled">
          {REASONS.map((r) => {
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
                  {t(`chatModeration.reason.${r}`)}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            placeholder={t('chatModeration.notePlaceholder')}
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
              <Text style={styles.blockLabel}>{t('chatModeration.alsoBlock')}</Text>
              <Text style={styles.blockHint}>{t('chatModeration.alsoBlockHint')}</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={close} disabled={busy}>
            <Text style={styles.cancelText}>{t('chatModeration.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.submitBtn, (!reason || busy) && styles.btnDisabled]}
            onPress={submit}
            disabled={!reason || busy}>
            {busy
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.submitText}>{t('chatModeration.submit')}</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.justBlock} onPress={blockOnly} disabled={busy}>
          <MaterialIcons name="block" size={moderateScale(16)} color="#b03a2e" />
          <Text style={styles.justBlockText}>{t('chatModeration.justBlock')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  // THE SHEET MUST CONTAIN ITSELF. `maxHeight` alone bounded the CARD but not its
  // children: the reasons list sized itself to its content, pushed the action row and
  // "Block without reporting" past the bottom of the card, and -- with overflow
  // visible -- they drew on top of the chat composer behind the sheet. Reported from
  // TestFlight 2026-10-26.
  //
  // Three things together fix it, and all three are needed: the card is a flex column
  // bounded by maxHeight, the scroll area is allowed to SHRINK (flexShrink on
  // reasonScroll below) so the fixed rows underneath always get their space first, and
  // overflow is clipped so nothing can paint outside the card even if a future child
  // refuses to shrink.
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: moderateScale(18),
    borderTopRightRadius: moderateScale(18),
    paddingHorizontal: scale(18),
    paddingBottom: verticalScale(28),
    maxHeight: '85%',
    overflow: 'hidden',
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
  // flexShrink: the ONE thing that lets the buttons below keep their space.
  reasonScroll: { marginTop: verticalScale(12), flexShrink: 1 },
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
  actions: { flexDirection: 'row', marginTop: verticalScale(14), flexShrink: 0 },
  btn: {
    flex: 1, paddingVertical: verticalScale(12), borderRadius: moderateScale(11),
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtn: { backgroundColor: '#f1e8e3', marginRight: scale(8) },
  submitBtn: { backgroundColor: COLORS.AstroMaroon },
  btnDisabled: { opacity: 0.5 },
  cancelText: { color: '#6b5a50', fontFamily: 'Lato-Bold', fontWeight: 'bold', fontSize: moderateScale(14) },
  submitText: { color: '#fff', fontFamily: 'Lato-Bold', fontWeight: 'bold', fontSize: moderateScale(14) },
  justBlock: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: verticalScale(12), paddingVertical: verticalScale(6), flexShrink: 0,
  },
  justBlockText: {
    marginLeft: scale(6), color: '#b03a2e', fontFamily: 'Lato-Bold', fontWeight: 'bold',
    fontSize: moderateScale(13),
  },
});
