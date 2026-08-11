// Shared purchase flow for the 10 paid astro report screens: loads the service's price for
// display, and at submit-time re-fetches the CURRENT price + balance (never trusts the
// mount-time cached price, which could be stale if an admin changed it while this screen
// was open) then shows a "you'll be charged ₹X — Pay?" confirm popup before actually
// calling the report endpoint. Returns the report payload on success, null on any
// cancellation/failure (screen just checks truthiness before navigating).
import {useContext, useEffect, useState} from 'react';
import {getAstroServices, getWalletBalance, runAstroReport} from '../../../api/astroApi';
import {LanguageContext} from '../../../context/LanguageContext';
import {showStatusPopup} from '../../../components/StatusPopup';

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
      showStatusPopup({variant: 'info', title: t('astro.notAvailable'), message: t('astro.notAvailableMsg')});
      return null;
    }
    setSubmitting(true);
    try {
      // Re-fetch right before charging — the backend always charges its own current DB
      // price regardless, but the price the user is SHOWN and asked to confirm here must
      // match that same current price, never a value cached from when this screen mounted.
      const [freshList, balance] = await Promise.all([getAstroServices(), getWalletBalance()]);
      const freshService = freshList.find((s) => s.key === serviceKey) || service;
      setService(freshService);

      if (balance < freshService.price) {
        showStatusPopup({
          variant: 'insufficient',
          title: t('alerts.insufficientBalance'),
          message: t('astro.reportCostsMsg', {price: freshService.price, balance}),
        });
        return null;
      }

      const confirmed = await new Promise((resolve) => {
        showStatusPopup({
          variant: 'confirmPay',
          title: t('astro.confirmPurchase'),
          message: t('astro.confirmPurchaseMsg', {price: freshService.price, name: freshService.name}),
          confirmText: t('astro.payAmount', {price: freshService.price}),
          cancelText: t('common.cancel'),
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return null;

      return await runAstroReport(serviceKey, payload);
    } catch (err) {
      if (err.isInsufficientBalance) {
        showStatusPopup({variant: 'insufficient', title: t('alerts.insufficientBalance'), message: t('astro.rechargeToView')});
      } else {
        showStatusPopup({variant: 'info', title: t('common.error'), message: err.message || t('astro.failedToGenerate')});
      }
      return null;
    } finally {
      setSubmitting(false);
    }
  }

  return {service, submitting, submit};
}
