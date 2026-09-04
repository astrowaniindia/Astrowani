// Shared purchase flow for the 10 paid astro report screens: loads the service's price for
// display, and at submit-time re-fetches the CURRENT price + balance (never trusts the
// mount-time cached price, which could be stale if an admin changed it while this screen
// was open) then shows a "you'll be charged ₹X — Pay?" confirm popup before actually
// calling the report endpoint. Returns the report payload on success, null on any
// cancellation/failure (screen just checks truthiness before navigating).
import {useContext, useEffect, useRef, useState} from 'react';
import {getAstroServices, getWalletBalance, runAstroReport} from '../../../api/astroApi';
import {LanguageContext} from '../../../context/LanguageContext';
import {showStatusPopup} from '../../../components/StatusPopup';
import {apiLang} from '../../../components/astro/ReportLanguage';
import {astroServiceLabel} from '../../../utils/astroServiceLabel';
import {captureEvent} from '../../../utils/Analytics';

export default function useAstroPurchase(serviceKey) {
  const {t} = useContext(LanguageContext);
  const {language} = useContext(LanguageContext);
  const [service, setService] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // Remembered so the result screen can re-run the SAME report in the other language when
  // the reader taps the header's EN/हिं toggle (components/astro/ReportLanguage.js).
  const lastPayload = useRef(null);

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
    // One choke point for all 10 paid report screens — instrumenting here rather than in
    // each screen means a new report screen is tracked the day it is written.
    captureEvent('astro_report_submitted', {service_key: serviceKey});
    setSubmitting(true);
    try {
      // Re-fetch right before charging — the backend always charges its own current DB
      // price regardless, but the price the user is SHOWN and asked to confirm here must
      // match that same current price, never a value cached from when this screen mounted.
      const [freshList, balance] = await Promise.all([getAstroServices(), getWalletBalance()]);
      const freshService = freshList.find((s) => s.key === serviceKey) || service;
      setService(freshService);

      if (balance < freshService.price) {
        captureEvent('astro_report_blocked', {
          service_key: serviceKey,
          reason: 'low_balance',
          price: freshService.price,
          balance,
          shortfall: freshService.price - balance,
        });
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
          // Translated name, not the raw English one — this message is otherwise
          // fully Hindi, so `name` was the single English word in the sentence.
          message: t('astro.confirmPurchaseMsg', {price: freshService.price, name: astroServiceLabel(freshService, language, t)}),
          confirmText: t('astro.payAmount', {price: freshService.price}),
          cancelText: t('common.cancel'),
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) {
        // Seeing the price and declining is a pricing signal, and it is invisible unless
        // it is recorded — nothing else in the funnel distinguishes it from never trying.
        captureEvent('astro_report_purchase_declined', {service_key: serviceKey, price: freshService.price});
        return null;
      }
      captureEvent('astro_report_purchase_confirmed', {service_key: serviceKey, price: freshService.price});

      // Generate in whatever language the app is currently set to, so a Hindi user gets a
      // Hindi report without having to toggle after the fact.
      lastPayload.current = payload;
      const result = await runAstroReport(serviceKey, {...payload, lang: apiLang(language)});
      captureEvent('astro_report_generated', {service_key: serviceKey, price: freshService.price});
      return result;
    } catch (err) {
      captureEvent('astro_report_failed', {
        service_key: serviceKey,
        reason: err.isInsufficientBalance ? 'low_balance' : (err.code || 'other'),
      });
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

  /**
   * Route params for the result screen. Carries the request payload and service key
   * alongside the data so the result screen's language toggle can re-fetch, plus the
   * language this payload was generated in.
   */
  function resultParams(data) {
    return {data, payload: lastPayload.current, serviceKey, lang: apiLang(language)};
  }

  return {service, submitting, submit, resultParams};
}
