// Shared purchase flow for the 10 paid astro report screens: loads the service's price,
// checks wallet balance before submitting (mirrors the AstrologerInfo.js / GiftModal pattern —
// Alert on insufficient balance, no dedicated recharge screen exists in this app), then calls
// the report endpoint. Returns the report payload on success, null on any failure (screen just
// checks truthiness before navigating).
import {useContext, useEffect, useState} from 'react';
import {Alert} from 'react-native';
import {getAstroServices, getWalletBalance, runAstroReport} from '../../../api/astroApi';
import {LanguageContext} from '../../../context/LanguageContext';

export default function useAstroPurchase(serviceKey) {
  const {t} = useContext(LanguageContext);
  const [service, setService] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAstroServices()
      .then((list) => {
        if (mounted) setService(list.find((s) => s.key === serviceKey) || null);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [serviceKey]);

  async function submit(payload) {
    if (!service) {
      Alert.alert(t('astro.notAvailable'), t('astro.notAvailableMsg'));
      return null;
    }
    setSubmitting(true);
    try {
      const balance = await getWalletBalance();
      if (balance < service.price) {
        Alert.alert(
          t('alerts.insufficientBalance'),
          t('astro.reportCostsMsg', {price: service.price, balance}),
        );
        return null;
      }
      return await runAstroReport(serviceKey, payload);
    } catch (err) {
      if (err.isInsufficientBalance) {
        Alert.alert(t('alerts.insufficientBalance'), t('astro.rechargeToView'));
      } else {
        Alert.alert(t('common.error'), err.message || t('astro.failedToGenerate'));
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  return {service, submitting, submit};
}
