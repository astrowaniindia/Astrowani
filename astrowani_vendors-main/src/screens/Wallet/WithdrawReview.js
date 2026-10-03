// WithdrawReview.js — the confirmation step between entering an amount in the
// wallet and the request actually being sent.
//
// Order-summary shaped on purpose (the astrologer already understands this layout
// from food/grocery apps): requested amount, the TDS line shown as a deduction,
// then the one figure that matters — what will actually reach their account — and
// a button that states that same figure rather than a generic "Confirm".
//
// NOTHING has moved by the time this screen opens. Report.js only validated the
// amount and navigated; this screen owns the POST, so backing out here costs the
// astrologer nothing.
//
// The percentages here are for DISPLAY. The backend applies and stores its own
// (sql/withdrawal_tds.sql), and the success screen shows the figures it returns —
// so if the rate were ever changed server-side before an app update, the astrologer
// still sees the real deduction on the screen that confirms the request.
import React, { useContext, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Instance from '../../api/ApiCall';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';
import { showStatusPopup } from '../../components/StatusPopup';

// Mirrors the backend's WITHDRAWAL_TDS_PERCENT.
const TDS_PERCENT = 10;

// Indian grouping with exactly two decimals — ₹2,250.00, not ₹2250.
const money = (n) => Number(n || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function WithdrawReview({ navigation, route }) {
  const { t } = useContext(LanguageContext);
  const gross = Number(route.params?.amount) || 0;
  const [submitting, setSubmitting] = useState(false);

  // Net is the remainder, never a separately rounded figure, so the lines on
  // screen always add up to the amount requested.
  const tds = Math.round(gross * TDS_PERCENT) / 100;
  const net = Math.round((gross - tds) * 100) / 100;

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const token = await AsyncStorage.getItem('token');
      const res = await Instance.post(
        '/vendor/wallet/withdraw',
        { amount: gross },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.data?.success) {
        // `replace`, not `navigate`: the request has been sent, so the back
        // gesture must not land back on a confirm button that would send it again.
        // The server's own figures are passed along in preference to the local
        // preview above.
        navigation.replace('WithdrawSuccess', {
          amount: res.data.amount ?? gross,
          tdsAmount: res.data.tdsAmount ?? tds,
          tdsPercent: res.data.tdsPercent ?? TDS_PERCENT,
          netAmount: res.data.netAmount ?? net,
        });
        return;
      }
      showStatusPopup({
        variant: 'error',
        title: t('wallet.withdrawFailed'),
        message: res.data?.message || t('common.tryAgain'),
      });
    } catch (e) {
      // The backend's own message is preferred — it carries the real reason
      // (below the minimum, payout details missing, withdrawals temporarily
      // unavailable), all of which are more useful than a generic failure.
      showStatusPopup({
        variant: 'error',
        title: t('wallet.withdrawFailed'),
        message: e?.response?.data?.message || t('common.tryAgain'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('wallet.reviewTitle')}</Text>

          <View style={styles.line}>
            <Text style={styles.lineLabel}>{t('wallet.reviewRequested')}</Text>
            <Text style={styles.lineValue}>₹{money(gross)}</Text>
          </View>

          <View style={styles.line}>
            <View style={styles.lineLabelWrap}>
              <Text style={styles.lineLabel}>{t('wallet.reviewTds', { percent: TDS_PERCENT })}</Text>
              <Text style={styles.lineSub}>{t('wallet.reviewTdsSub')}</Text>
            </View>
            <Text style={styles.lineDeduction}>− ₹{money(tds)}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.line}>
            <Text style={styles.totalLabel}>{t('wallet.reviewYouReceive')}</Text>
            <Text style={styles.totalValue}>₹{money(net)}</Text>
          </View>
        </View>

        <View style={styles.noteBox}>
          <Ionicons
            name="information-circle-outline"
            size={moderateScale(16)}
            color={COLORS.AstroMaroon}
            style={styles.noteIcon}
          />
          <Text style={styles.noteText}>{t('wallet.reviewNote', { percent: TDS_PERCENT })}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.cta, submitting && styles.ctaDisabled]}
          onPress={confirm}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.ctaText}>{t('wallet.reviewCta', { amount: money(net) })}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F7' },
  scroll: { padding: scale(16), paddingBottom: verticalScale(20) },
  card: {
    backgroundColor: '#fff',
    borderRadius: moderateScale(14),
    padding: scale(16),
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  cardTitle: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#8a8a8a',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: verticalScale(14),
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: verticalScale(12),
  },
  lineLabelWrap: { flex: 1, paddingRight: scale(10) },
  lineLabel: { fontSize: moderateScale(14.5), color: '#333' },
  lineSub: { fontSize: moderateScale(11.5), color: '#999', marginTop: verticalScale(2) },
  lineValue: { fontSize: moderateScale(14.5), color: '#333', fontWeight: '600' },
  lineDeduction: { fontSize: moderateScale(14.5), color: '#C0392B', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#EEE', marginBottom: verticalScale(12) },
  totalLabel: { fontSize: moderateScale(15.5), fontWeight: '700', color: '#241A16' },
  totalValue: { fontSize: moderateScale(19), fontWeight: 'bold', color: '#1a8f4c' },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(89,42,25,0.06)',
    borderRadius: moderateScale(12),
    padding: scale(12),
    marginTop: verticalScale(14),
  },
  noteIcon: { marginRight: scale(7), marginTop: verticalScale(1) },
  noteText: { flex: 1, fontSize: moderateScale(12), color: '#6B5C55', lineHeight: moderateScale(17) },
  footer: {
    padding: scale(16),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#fff',
  },
  cta: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(28),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: '#fff', fontSize: moderateScale(16), fontWeight: 'bold' },
});
