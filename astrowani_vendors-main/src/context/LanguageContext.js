// Hindi/English toggle for the vendor app — mirrors astrowani_customer-main's
// LanguageContext.js pattern (namespaced keys, AsyncStorage-persisted choice, t() lookup
// with English fallback). Astrologers skew heavily towards Hindi, so this exists to let
// them use the app in their preferred language.
//
// COVERAGE NOTE: this is a real, working toggle (drawer footer buttons + the header
// language icon on Home, both call changeLanguage()), and translation coverage covers
// the drawer menu and the HomeScreen dashboard (online/offline, service toggles, go
// live, profile-completion banner, session history button) — not every screen in the
// app yet. Extend `translations` below with more namespaced keys (e.g. 'wallet.balance')
// and wrap the corresponding strings in t('...') as more screens are covered; the
// switching mechanism itself doesn't need to change.
import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LanguageContext = createContext();

const translations = {
  English: {
    'drawer.dashboard': 'Dashboard',
    'drawer.myCustomers': 'My Customers',
    'drawer.profile': 'Profile',
    'drawer.sessionHistory': 'Session History',
    'drawer.missedSessions': 'Missed Sessions',
    'drawer.support': 'Support',
    'drawer.notification': 'Notification',
    'drawer.settings': 'Settings',
    'drawer.ratingReview': 'Rating & Review',
    'drawer.performance': 'Performance',
    'drawer.wallet': 'Wallet',
    'drawer.logout': 'Logout',
    'drawer.followUs': 'Follow Us',
    'drawer.language': 'Language',

    'home.youAreOnline': 'You are Online',
    'home.youAreOffline': 'You are Offline',
    'home.goLive': 'GO LIVE',
    'home.endLive': 'END LIVE',
    'home.sessionHistory': 'Session History',
    'home.chat': 'Chat',
    'home.call': 'Call',
    'home.video': 'Video',
    'home.todayEarnings': "Today's Earnings",
    'home.totalEarnings': 'Total Earnings',
    'home.walletBalance': 'Wallet Balance',
    'home.youAreOnlineSub': 'Customers can reach you for chat, call & video',
    'home.youAreOfflineSub': "You're hidden from new requests everywhere",
    'home.serviceSettings': 'Service Settings',
    'home.completeProfile': 'Complete your profile',
    'home.completeProfileSub': 'Add your photo, experience, languages and charges so customers can find you. Tap to finish.',
    'home.pendingApproval': 'We will review your profile and get back to you soon!',
    'home.sessionHistoryBtn': 'Session History',

    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.accept': 'Accept',
    'common.reject': 'Reject',
    'common.perMin': '/min',
  },
  Hindi: {
    'drawer.dashboard': 'डैशबोर्ड',
    'drawer.myCustomers': 'मेरे ग्राहक',
    'drawer.profile': 'प्रोफ़ाइल',
    'drawer.sessionHistory': 'सत्र इतिहास',
    'drawer.missedSessions': 'छूटे हुए सत्र',
    'drawer.support': 'सहायता',
    'drawer.notification': 'सूचना',
    'drawer.settings': 'सेटिंग्स',
    'drawer.ratingReview': 'रेटिंग और समीक्षा',
    'drawer.performance': 'प्रदर्शन',
    'drawer.wallet': 'वॉलेट',
    'drawer.logout': 'लॉग आउट',
    'drawer.followUs': 'हमें फॉलो करें',
    'drawer.language': 'भाषा',

    'home.youAreOnline': 'आप ऑनलाइन हैं',
    'home.youAreOffline': 'आप ऑफ़लाइन हैं',
    'home.goLive': 'लाइव जाएं',
    'home.endLive': 'लाइव समाप्त करें',
    'home.sessionHistory': 'सत्र इतिहास',
    'home.chat': 'चैट',
    'home.call': 'कॉल',
    'home.video': 'वीडियो',
    'home.todayEarnings': 'आज की कमाई',
    'home.totalEarnings': 'कुल कमाई',
    'home.walletBalance': 'वॉलेट बैलेंस',
    'home.youAreOnlineSub': 'ग्राहक आपसे चैट, कॉल और वीडियो के लिए संपर्क कर सकते हैं',
    'home.youAreOfflineSub': 'आप नए अनुरोधों से छिपे हुए हैं',
    'home.serviceSettings': 'सेवा सेटिंग्स',
    'home.completeProfile': 'अपनी प्रोफ़ाइल पूरी करें',
    'home.completeProfileSub': 'अपना फोटो, अनुभव, भाषाएं और शुल्क जोड़ें ताकि ग्राहक आपको ढूंढ सकें। पूरा करने के लिए टैप करें।',
    'home.pendingApproval': 'हम आपकी प्रोफ़ाइल की समीक्षा करेंगे और जल्द ही आपसे संपर्क करेंगे!',
    'home.sessionHistoryBtn': 'सत्र इतिहास',

    'common.ok': 'ठीक है',
    'common.cancel': 'रद्द करें',
    'common.save': 'सेव करें',
    'common.accept': 'स्वीकार करें',
    'common.reject': 'अस्वीकार करें',
    'common.perMin': '/मिनट',
  },
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('English');

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLang = await AsyncStorage.getItem('vendorAppLanguage');
        if (savedLang) setLanguage(savedLang);
      } catch (error) {
        console.log('Error loading language', error);
      }
    };
    loadLanguage();
  }, []);

  const changeLanguage = async (lang) => {
    setLanguage(lang);
    try {
      await AsyncStorage.setItem('vendorAppLanguage', lang);
    } catch (error) {
      console.log('Error saving language', error);
    }
  };

  const t = (key) => translations[language]?.[key] ?? translations['English'][key] ?? key;

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
