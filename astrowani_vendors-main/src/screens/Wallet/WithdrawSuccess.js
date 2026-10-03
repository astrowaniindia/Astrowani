// WithdrawSuccess.js — shown once a withdrawal request has actually been created.
//
// A screen rather than a popup, deliberately: this is the receipt for money
// leaving their wallet, and it repeats the figures so there is no ambiguity about
// what was deducted and what is coming.
//
// The amounts here come from the SERVER's response (passed through by
// WithdrawReview), not from the app's own arithmetic — this is the record of what
// was stored, so it has to match what the admin will pay.
import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../../Theme/Colors';
import { moderateScale, scale, verticalScale } from '../../utils/Scaling';
import { LanguageContext } from '../../context/LanguageContext';

const money = (n) => Number(n || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function WithdrawSuccess({ navigation, route }) {
  const { t } = useContext(LanguageContext);
  const { amount = 0, tdsAmount = 0, tdsPercent = 10, netAmount = 0 } = route.params || {};

  // Memoised so the back handler below can depend on it honestly instead of
  // re-registering on every render.
  const goToWallet = React.useCallback(() => {
    // Back to the wallet rather than the review screen, which has already been
    // replaced. Wallet re-fetches on focus, so the new balance and the new
    // pending request are both there when they arrive.
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Wallet');
  }, [navigation]);

  // The hardware back button must behave like Done, not drop them back into a
  // confirm screen for a request that has already been sent.
  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goToWallet();
        return true;
      });
      return () => sub.remove();
    }, [goToWallet]),
  );

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <View style={styles.tickRing}>
          <Ionicons name="checkmark" size={moderateScale(44)} color="#fff" />
        </View>

        <Text style={styles.title}>{t('wallet.successTitle')}</Text>
        <Text style={styles.subtitle}>{t('wallet.successBody', { amount: money(netAmount) })}</Text>

        <View style={styles.card}>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>{t('wallet.reviewRequested')}</Text>
            <Text style={styles.lineValue}>₹{money(amount)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.lineLabel}>{t('wallet.reviewTds', { percent: tdsPercent })}</Text>
            <Text style={styles.lineDeduction}>− ₹{money(tdsAmount)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.line}>
            <Text style={styles.totalLabel}>{t('wallet.successPayable')}</Text>
            <Text style={styles.totalValue}>₹{money(netAmount)}</Text>
          </View>
        </View>

        <Text style={styles.footnote}>{t('wallet.successFootnote')}</Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cta} onPress={goToWallet} activeOpacity={0.85}>
          <Text style={styles.ctaText}>{t('wallet.successCta')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: scale(22) },
  tickRing: {
    width: scale(84),
    height: scale(84),
    borderRadius: scale(42),
    backgroundColor: '#1a8f4c',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: verticalScale(20),
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: 'bold',
    color: '#241A16',
    textAlign: 'center',
    marginBottom: verticalScale(8),
  },
  subtitle: {
    fontSize: moderateScale(14),
    color: '#6B5C55',
    textAlign: 'center',
    lineHeight: moderateScale(20),
    marginBottom: verticalScale(22),
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#F7F7F7',
    borderRadius: moderateScale(14),
    padding: scale(16),
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(10),
  },
  lineLabel: { fontSize: moderateScale(13.5), color: '#555' },
  lineValue: { fontSize: moderateScale(13.5), color: '#333', fontWeight: '600' },
  lineDeduction: { fontSize: moderateScale(13.5), color: '#C0392B', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#E2E2E2', marginBottom: verticalScale(10) },
  totalLabel: { fontSize: moderateScale(15), fontWeight: '700', color: '#241A16' },
  totalValue: { fontSize: moderateScale(18), fontWeight: 'bold', color: '#1a8f4c' },
  footnote: {
    fontSize: moderateScale(11.5),
    color: '#999',
    textAlign: 'center',
    marginTop: verticalScale(16),
    lineHeight: moderateScale(16),
  },
  footer: {
    padding: scale(16),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  cta: {
    backgroundColor: COLORS.AstroMaroon,
    borderRadius: moderateScale(28),
    paddingVertical: verticalScale(14),
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: moderateScale(16), fontWeight: 'bold' },
});
