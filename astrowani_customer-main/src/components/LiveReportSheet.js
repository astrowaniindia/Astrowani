// Report a live stream comment, or the live stream itself.
//
// Live comments are written by other customers and shown to everyone watching, so
// App Store Guideline 1.2 and Google Play's UGC policy require a way to report them
// and to block the person who wrote them. Both are offered here, independently:
// someone may want to report without blocking, or block without filing a report.
//
// target:
//   { kind: 'comment', sessionId, senderId, name, message }
//   { kind: 'stream',  astrologerId, name }
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

const COMMENT_REASONS = ['abusive', 'harassment', 'sexual', 'hate', 'spam', 'other'];
const STREAM_REASONS = ['abusive', 'sexual', 'hate', 'fraud', 'other'];

// astrologer_reports.reason is free text read by an admin, so the stream report sends
// the English label rather than a key.
const STREAM_REASON_LABELS = {
  abusive: 'Live stream: abusive or offensive language',
  sexual: 'Live stream: sexual content',
  hate: 'Live stream: hate speech',
  fraud: 'Live stream: fraud or misleading claims',
  other: 'Live stream: other',
};

export default function LiveReportSheet({ visible, target, onClose, onBlock }) {
  const { t } = useContext(LanguageContext);
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  useModalPresence(!!visible);

  const isComment = target?.kind === 'comment';
  const reasons = isComment ? COMMENT_REASONS : STREAM_REASONS;

  const reset = () => { setReason(null); setNote(''); setAlsoBlock(false); setBusy(false); };
  const close = () => { if (!busy) { reset(); onClose?.(); } };

  const blockOnly = () => {
    if (!isComment || busy) return;
    captureEvent('live_comment_blocked', { session_id: target.sessionId, with_report: false });
    onBlock?.(target.senderId);
    reset();
    onClose?.();
    showStatusPopup({ variant: 'success', title: t('liveReport.blockedTitle'), message: t('liveReport.blockedBody') });
  };

  const submit = async () => {
    if (!reason || busy || !target) return;
    setBusy(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const headers = { headers: { Authorization: `Bearer ${token}` } };
      const res = isComment
        ? await Instance.post('/api/live/comments/report', {
            sessionId: target.sessionId,
            senderId: target.senderId,
            message: target.message,
            reason,
            note: note.trim() || undefined,
          }, headers)
        : await Instance.post('/api/reports', {
            astrologerId: target.astrologerId,
            reason: STREAM_REASON_LABELS[reason],
            note: note.trim() || null,
          }, headers);
      if (!res?.data?.success) throw new Error(res?.data?.message);

      const blocked = isComment && alsoBlock;
      if (blocked) onBlock?.(target.senderId);
      captureEvent(isComment ? 'live_comment_reported' : 'live_stream_reported', { reason, blocked });
      reset();
      onClose?.();
      showStatusPopup({
        variant: 'success',
        title: t('liveReport.sentTitle'),
        message: blocked ? t('liveReport.sentBlocked') : t('liveReport.sentBody'),
      });
    } catch (e) {
      setBusy(false);
      showStatusPopup({
        variant: 'error',
        title: t('liveReport.failedTitle'),
        message: e?.response?.data?.message || t('liveReport.failedBody'),
      });
    }
  };

  const name = target?.name || t('live.guest');

  return (
    <Modal visible={!!visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>
          {isComment ? t('liveReport.titleComment') : t('liveReport.titleStream')}
        </Text>
        <Text style={styles.subtitle} numberOfLines={3}>
          {isComment
            ? t('liveReport.subtitleComment', { name, message: target?.message || '' })
            : t('liveReport.subtitleStream', { name })}
        </Text>

        <ScrollView style={styles.reasonScroll} keyboardShouldPersistTaps="handled">
          {reasons.map((r) => {
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
                  {t(`liveReport.reason.${r}`)}
                </Text>
              </TouchableOpacity>
            );
          })}

          <TextInput
            style={styles.note}
            value={note}
            onChangeText={setNote}
            placeholder={t('liveReport.notePlaceholder')}
            placeholderTextColor="#a89890"
            multiline
            maxLength={500}
          />

          {isComment && (
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
                <Text style={styles.blockLabel}>{t('liveReport.alsoBlock')}</Text>
                <Text style={styles.blockHint}>{t('liveReport.alsoBlockHint')}</Text>
              </View>
            </TouchableOpacity>
          )}
        </ScrollView>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={close} disabled={busy}>
            <Text style={styles.cancelText}>{t('liveReport.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.submitBtn, (!reason || busy) && styles.btnDisabled]}
            onPress={submit}
            disabled={!reason || busy}>
            {busy
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.submitText}>{t('liveReport.submit')}</Text>}
          </TouchableOpacity>
        </View>

        {isComment && (
          <TouchableOpacity style={styles.justBlock} onPress={blockOnly} disabled={busy}>
            <MaterialIcons name="block" size={moderateScale(16)} color="#b03a2e" />
            <Text style={styles.justBlockText}>{t('liveReport.justBlock')}</Text>
          </TouchableOpacity>
        )}
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
    paddingBottom: verticalScale(28),
    maxHeight: '85%',
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
  justBlock: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: verticalScale(12), paddingVertical: verticalScale(6),
  },
  justBlockText: {
    marginLeft: scale(6), color: '#b03a2e', fontFamily: 'Lato-Bold', fontWeight: 'bold',
    fontSize: moderateScale(13),
  },
});
