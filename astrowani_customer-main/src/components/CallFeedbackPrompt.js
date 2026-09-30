// "Did you like the free call?" — one question, two answers.
//
// WHY IT EXISTS: it is the gate in front of the Dakshina ask. We only invite somebody
// to thank an astrologer once they have said the call was worth something. Asking a
// customer who had a bad call to tip them is the single most irritating thing this
// flow could do.
//
// WHERE IT APPEARS (see VoiceCallScreen.doEndCall):
//   * the ASTROLOGER ended a 3-9 minute call — we do not know how it went, so ask;
//   * the customer dismissed the "more minutes" sheet after a 9+ minute call.
//
// A customer who ended their OWN 3-9 minute call is NOT asked — they chose the moment,
// which is answer enough, and they go straight to the Dakshina sheet.
//
// "No" is deliberately a dead end: a short apology for two seconds and then Home. No
// stars, no follow-up form, nothing else to dismiss. They have already told us.
import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import { COLORS } from '../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../utils/Scaling';
import { LanguageContext } from '../context/LanguageContext';
import { captureEvent } from '../utils/Analytics';
import { useDeferredPresent, useModalPresence } from '../utils/modalPresentation';

const CREAM = '#FFF9F3';
const BORDER = '#E9D9C9';
// How long the apology stays up before it takes itself away. Long enough to read,
// short enough that it is not one more thing to dismiss.
const SORRY_MS = 2000;

let listener = null;

/**
 * Ask the question.
 * @param {object} opts
 * @param {Function} opts.onYes  run when they liked it (raise the Dakshina sheet)
 * @param {Function} opts.onNo   run after the apology has shown and closed
 */
export const showCallFeedback = (opts) => { if (listener) listener(opts || {}); };

export function CallFeedbackPromptHost() {
  const { t } = useContext(LanguageContext);
  const [req, setReq] = useState(null);
  const [sorry, setSorry] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    listener = (opts) => { setSorry(false); setReq(opts); };
    return () => { listener = null; };
  }, []);

  // Never leave the apology timer running against an unmounted host.
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const visible = useDeferredPresent(!!req);
  useModalPresence(visible);

  const close = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setReq(null);
    setSorry(false);
  }, []);

  const answerYes = useCallback(() => {
    const cb = req?.onYes;
    captureEvent('free_call_feedback', { liked: true });
    close();
    if (typeof cb === 'function') cb();
  }, [req, close]);

  const answerNo = useCallback(() => {
    const cb = req?.onNo;
    captureEvent('free_call_feedback', { liked: false });
    setSorry(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      close();
      if (typeof cb === 'function') cb();
    }, SORRY_MS);
  }, [req, close]);

  if (!req) return null;

  return (
    // No onRequestClose dismiss path while the apology is showing — it is about to
    // close itself, and a half-dismissed apology would skip the onNo handoff.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={sorry ? () => {} : answerNo}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {sorry ? (
            <>
              <MaterialIcons name="sentiment-dissatisfied" size={moderateScale(34)} color={COLORS.AstroMaroon} />
              <Text style={styles.title}>{t('callFeedback.sorryTitle')}</Text>
              <Text style={styles.subtitle}>{t('callFeedback.sorryBody')}</Text>
            </>
          ) : (
            <>
              <MaterialIcons name="help-outline" size={moderateScale(34)} color={COLORS.AstroMaroon} />
              <Text style={styles.title}>{t('callFeedback.title')}</Text>
              <Text style={styles.subtitle}>{t('callFeedback.subtitle')}</Text>
              <View style={styles.row}>
                <TouchableOpacity style={[styles.btn, styles.btnNo]} onPress={answerNo} activeOpacity={0.85}>
                  <Text style={styles.btnNoTxt}>{t('common.no')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btnYes]} onPress={answerYes} activeOpacity={0.85}>
                  <Text style={styles.btnYesTxt}>{t('common.yes')}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: scale(20),
  },
  card: {
    width: '100%', maxWidth: scale(320), backgroundColor: CREAM,
    borderRadius: moderateScale(18), padding: scale(22), alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  title: {
    fontSize: moderateScale(17), fontWeight: '800', color: COLORS.AstroMaroon,
    marginTop: verticalScale(10), textAlign: 'center',
  },
  subtitle: {
    fontSize: moderateScale(12.5), color: '#6b584c', textAlign: 'center',
    marginTop: verticalScale(6), lineHeight: moderateScale(18),
  },
  row: { flexDirection: 'row', marginTop: verticalScale(18), alignSelf: 'stretch' },
  btn: {
    flex: 1, borderRadius: moderateScale(14), paddingVertical: verticalScale(12),
    alignItems: 'center', justifyContent: 'center',
  },
  btnNo: { backgroundColor: '#F0E2D4', marginRight: scale(8) },
  btnYes: { backgroundColor: COLORS.AstroMaroon, marginLeft: scale(8) },
  btnNoTxt: { color: '#6b584c', fontWeight: '800', fontSize: moderateScale(14) },
  btnYesTxt: { color: COLORS.white, fontWeight: '800', fontSize: moderateScale(14) },
});
