import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LanguageContext = createContext();

const translations = {
  English: {
    welcome: 'Welcome to Astrowani!',
    search: 'Search Here',
    bestAstrologers: "India's Best Astrologers",
    viewAll: 'View All',
    remedies: 'Astrowani Remedies',
    bookPuja: 'Book VIP Puja',
    buyGemstones: 'Buy Gemstones',
    readMore: 'Read More',
    language: 'Choose Language',
    chat: 'Chat',
    call: 'Call',
    live: 'Live',
    scheduled: 'Scheduled',
    home: 'Home',
    wallet: 'Wallet',
    profile: 'My Profile',
    freeServices: 'Free Services',
    history: 'Order History',
    customerSupport: 'Customer Support',
    settings: 'Settings',
    logout: 'Logout',
    notifications: 'Notifications',
    horoscope: 'Horoscope',
    kundali: 'Kundali Matching',
    panchang: 'Panchang',
    muhurat: 'Shubh Muhurat',
  },
  Hindi: {
    welcome: 'एस्ट्रोवाणी में आपका स्वागत है!',
    search: 'यहाँ खोजें',
    bestAstrologers: 'भारत के सर्वश्रेष्ठ ज्योतिषी',
    viewAll: 'सभी देखें',
    remedies: 'एस्ट्रोवाणी के उपाय',
    bookPuja: 'वीआईपी पूजा बुक करें',
    buyGemstones: 'रत्न खरीदें',
    readMore: 'और पढ़ें',
    language: 'भाषा चुनें',
    chat: 'चैट',
    call: 'कॉल',
    live: 'लाइव',
    scheduled: 'निर्धारित',
    home: 'होम',
    wallet: 'वॉलेट',
    profile: 'मेरी प्रोफ़ाइल',
    freeServices: 'मुफ़्त सेवाएँ',
    history: 'ऑर्डर इतिहास',
    customerSupport: 'ग्राहक सहायता',
    settings: 'सेटिंग्स',
    logout: 'लॉग आउट',
    notifications: 'सूचनाएं',
    horoscope: 'राशिफल',
    kundali: 'कुंडली मिलान',
    panchang: 'पंचांग',
    muhurat: 'शुभ मुहूर्त',
  }
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('English');

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLang = await AsyncStorage.getItem('appLanguage');
        if (savedLang) {
          setLanguage(savedLang);
        }
      } catch (error) {
        console.log('Error loading language', error);
      }
    };
    loadLanguage();
  }, []);

  const changeLanguage = async (lang) => {
    setLanguage(lang);
    try {
      await AsyncStorage.setItem('appLanguage', lang);
    } catch (error) {
      console.log('Error saving language', error);
    }
  };

  const t = (key) => {
    return translations[language][key] || translations['English'][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
