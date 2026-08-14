// Hindi/English toggle for the vendor app — mirrors astrowani_customer-main's
// LanguageContext.js pattern (namespaced keys, AsyncStorage-persisted choice, t() lookup
// with English fallback). Astrologers skew heavily towards Hindi, so this exists to let
// them use the app in their preferred language.
//
// COVERAGE NOTE: this is a real, working toggle, but translation coverage currently
// covers the drawer menu and the most-visible HomeScreen dashboard labels only — not
// every screen in the app. Extend `translations` below with more namespaced keys
// (e.g. 'wallet.balance') and wrap the corresponding strings in t('...') as more
// screens are covered; the switching mechanism itself doesn't need to change.
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

    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.accept': 'Accept',
    'common.reject': 'Reject',
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

    'common.ok': 'ठीक है',
    'common.cancel': 'रद्द करें',
    'common.save': 'सेव करें',
    'common.accept': 'स्वीकार करें',
    'common.reject': 'अस्वीकार करें',
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
