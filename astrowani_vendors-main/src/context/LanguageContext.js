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
    'common.submit': 'Submit',
    'common.customer': 'Customer',
    'common.notAvailable': 'Not available',
    'common.notSpecified': 'Not specified',

    'popup.incomingCall': 'Incoming Call',
    'popup.incomingVideoCall': 'Incoming Video Call',
    'popup.requesting': 'is requesting a consultation...',
    'popup.moreWaiting': 'more waiting',
    'popup.decline': 'Decline',

    'sessionHistory.chat': 'Chat',
    'sessionHistory.audioCall': 'Audio Call',
    'sessionHistory.videoCall': 'Video Call',
    'sessionHistory.live': 'Live',
    'sessionHistory.active': 'Active',
    'sessionHistory.completed': 'Completed',
    'sessionHistory.duration': 'Duration',
    'sessionHistory.rate': 'Rate',
    'sessionHistory.earned': 'Earned',
    'sessionHistory.noHistory': 'No history yet',
    'sessionHistory.noHistorySub': 'Sessions will appear here after calls end',

    'missed.missed': 'Missed',
    'missed.noMissed': 'No missed sessions',
    'missed.noMissedSub': "Calls you don't answer in 1 minute show up here",

    'notification.noNotifications': 'No notifications',

    'customers.lastConnected': 'Last connected',
    'customers.sessionType': 'Session type',
    'customers.sendVoiceNote': 'Send Voice Note',
    'customers.noCustomers': 'No customers found.',

    'profile.personalDetails': 'Personal Details',
    'profile.professionalDetails': 'Professional Details',
    'profile.firstName': 'First Name',
    'profile.lastName': 'Last Name',
    'profile.gender': 'Gender',
    'profile.phone': 'Phone',
    'profile.experience': 'Experience',
    'profile.years': 'Years',
    'profile.chatCharges': 'Chat Charges',
    'profile.callCharges': 'Call Charges',
    'profile.language': 'Language',
    'profile.editProfile': 'Edit Profile',
    'profile.logout': 'Logout',
    'profile.confirmLogout': 'Are you sure you want to logout?',
    'profile.confirm': 'Confirm',

    'settings.aboutUs': 'About Us',
    'settings.faq': "FAQ's",
    'settings.refundCancellation': 'Refund & Cancellation',
    'settings.privacyPolicy': 'Privacy Policy',
    'settings.termsConditions': 'Terms & Conditions',
    'settings.safetyGuidelines': 'Safety Guidelines',
    'settings.childSafety': 'Child Safety',

    'wallet.walletBalance': 'Wallet Balance',
    'wallet.requestWithdrawal': 'Request Withdrawal',
    'wallet.transactions': 'Transactions',
    'wallet.withdrawals': 'Withdrawals',
    'wallet.noTransactions': 'No transactions yet.',
    'wallet.noWithdrawals': 'No withdrawal requests yet.',
    'wallet.requested': 'Requested',

    'reviews.title': 'Ratings & Reviews',
    'reviews.noReviews': 'No reviews yet.',

    'performance.title': 'Your Performance',
    'performance.avgResponseTime': 'Avg. Response Time',
    'performance.acceptanceRate': 'Acceptance Rate',
    'performance.repeatCustomers': 'Repeat Customers',
    'performance.notEnoughActivity': 'Not enough activity yet to show your performance.',
    'performance.subtitlePrefix': 'How you look to customers — based on your last',
    'performance.subtitleSuffix': 'requests.',
    'performance.avgResponseHint': 'How fast you accept or reject incoming requests',
    'performance.acceptanceHint': "Of requests you've accepted, rejected, or missed",

    'missedHome.title': 'Missed Sessions',
    'missedHome.viewAll': 'View All',
    'missedHome.today': 'Today',
    'missedHome.yesterday': 'Yesterday',
    'missedHome.thisMonth': 'This Month',
    'missedHome.all': 'All',
    'missedHome.chat': 'Chat',
    'missedHome.videoCall': 'Video Call',
    'missedHome.audioCall': 'Audio Call',
    'missedHome.more': 'more',

    'call.audioCall': 'AUDIO CALL',
    'call.videoCall': 'VIDEO CALL',
    'call.connecting': 'Connecting...',
    'call.mute': 'Mute',
    'call.unmute': 'Unmute',
    'call.video': 'Video',
    'call.videoOff': 'Video Off',
    'call.flip': 'Flip',
    'call.speaker': 'Speaker',
    'call.earpiece': 'Earpiece',
    'call.billingActive': 'billing active',
    'call.endCallTitle': 'End Call',
    'call.endCallMsg': 'Are you sure you want to end the call?',
    'call.end': 'End',
    'call.permissionRequired': 'Permission Required',
    'call.micPermissionMsg': 'Microphone access is needed for audio calls.',
    'call.micCameraPermissionMsg': 'Microphone and camera access are needed for video calls.',
    'call.typing': 'typing...',
    'call.messagePlaceholder': 'Message...',
    'call.sessionEnded': 'Session Ended',

    'editProfile.requiredNotice': 'Fields marked with',
    'editProfile.requiredNoticeSuffix': 'are required for your profile to appear on the Astrowani customer app.',
    'editProfile.profilePhoto': 'Profile photo',
    'editProfile.removePhoto': 'Remove Photo',
    'editProfile.fullName': 'Full Name',
    'editProfile.email': 'Email',
    'editProfile.phoneNumber': 'Phone Number',
    'editProfile.gender': 'Gender',
    'editProfile.aboutYou': 'About You',
    'editProfile.description': 'Description',
    'editProfile.experienceYears': 'Experience (Years)',
    'editProfile.chargesLockedNotice': 'Your charges are locked — you set them once already. Contact the admin team if you need a change.',
    'editProfile.chargesHint': 'At least one of Chat / Call / Video charges must be set above ₹0.',
    'editProfile.chatCharges': 'Chat Charges (₹/min)',
    'editProfile.callCharges': 'Call Charges (₹/min)',
    'editProfile.videoCharges': 'Video Charges (₹/min)',
    'editProfile.languages': 'Languages (comma separated)',
    'editProfile.payoutDetails': 'Payout Details',
    'editProfile.payoutHint': 'Required to request a withdrawal — add either a bank account or a UPI ID.',
    'editProfile.accountHolderName': 'Account Holder Name',
    'editProfile.accountNumber': 'Account Number',
    'editProfile.ifscCode': 'IFSC Code',
    'editProfile.bankName': 'Bank Name',
    'editProfile.upiId': 'UPI ID (alternative to bank details)',
    'editProfile.saveChanges': 'Save Changes',
    'editProfile.chooseOption': 'Choose an option',
    'editProfile.camera': 'Camera',
    'editProfile.gallery': 'Gallery',
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
    'common.submit': 'सबमिट करें',
    'common.customer': 'ग्राहक',
    'common.notAvailable': 'उपलब्ध नहीं',
    'common.notSpecified': 'निर्दिष्ट नहीं',

    'popup.incomingCall': 'इनकमिंग कॉल',
    'popup.incomingVideoCall': 'इनकमिंग वीडियो कॉल',
    'popup.requesting': 'परामर्श का अनुरोध कर रहे हैं...',
    'popup.moreWaiting': 'और प्रतीक्षारत',
    'popup.decline': 'अस्वीकार करें',

    'sessionHistory.chat': 'चैट',
    'sessionHistory.audioCall': 'ऑडियो कॉल',
    'sessionHistory.videoCall': 'वीडियो कॉल',
    'sessionHistory.live': 'लाइव',
    'sessionHistory.active': 'सक्रिय',
    'sessionHistory.completed': 'पूर्ण',
    'sessionHistory.duration': 'अवधि',
    'sessionHistory.rate': 'दर',
    'sessionHistory.earned': 'कमाया',
    'sessionHistory.noHistory': 'अभी तक कोई इतिहास नहीं',
    'sessionHistory.noHistorySub': 'कॉल समाप्त होने के बाद सत्र यहां दिखाई देंगे',

    'missed.missed': 'छूट गया',
    'missed.noMissed': 'कोई छूटा हुआ सत्र नहीं',
    'missed.noMissedSub': 'जिन कॉल का आप 1 मिनट में जवाब नहीं देते वे यहां दिखाई देते हैं',

    'notification.noNotifications': 'कोई सूचना नहीं',

    'customers.lastConnected': 'अंतिम संपर्क',
    'customers.sessionType': 'सत्र प्रकार',
    'customers.sendVoiceNote': 'वॉइस नोट भेजें',
    'customers.noCustomers': 'कोई ग्राहक नहीं मिला।',

    'profile.personalDetails': 'व्यक्तिगत विवरण',
    'profile.professionalDetails': 'व्यावसायिक विवरण',
    'profile.firstName': 'पहला नाम',
    'profile.lastName': 'उपनाम',
    'profile.gender': 'लिंग',
    'profile.phone': 'फ़ोन',
    'profile.experience': 'अनुभव',
    'profile.years': 'वर्ष',
    'profile.chatCharges': 'चैट शुल्क',
    'profile.callCharges': 'कॉल शुल्क',
    'profile.language': 'भाषा',
    'profile.editProfile': 'प्रोफ़ाइल संपादित करें',
    'profile.logout': 'लॉग आउट',
    'profile.confirmLogout': 'क्या आप वाकई लॉग आउट करना चाहते हैं?',
    'profile.confirm': 'पुष्टि करें',

    'settings.aboutUs': 'हमारे बारे में',
    'settings.faq': 'सामान्य प्रश्न',
    'settings.refundCancellation': 'रिफंड और रद्दीकरण',
    'settings.privacyPolicy': 'गोपनीयता नीति',
    'settings.termsConditions': 'नियम और शर्तें',
    'settings.safetyGuidelines': 'सुरक्षा दिशानिर्देश',
    'settings.childSafety': 'बाल सुरक्षा',

    'wallet.walletBalance': 'वॉलेट बैलेंस',
    'wallet.requestWithdrawal': 'निकासी का अनुरोध करें',
    'wallet.transactions': 'लेनदेन',
    'wallet.withdrawals': 'निकासी',
    'wallet.noTransactions': 'अभी तक कोई लेनदेन नहीं।',
    'wallet.noWithdrawals': 'अभी तक कोई निकासी अनुरोध नहीं।',
    'wallet.requested': 'अनुरोध किया गया',

    'reviews.title': 'रेटिंग और समीक्षा',
    'reviews.noReviews': 'अभी तक कोई समीक्षा नहीं।',

    'performance.title': 'आपका प्रदर्शन',
    'performance.avgResponseTime': 'औसत प्रतिक्रिया समय',
    'performance.acceptanceRate': 'स्वीकृति दर',
    'performance.repeatCustomers': 'दोहराए गए ग्राहक',
    'performance.notEnoughActivity': 'आपका प्रदर्शन दिखाने के लिए अभी पर्याप्त गतिविधि नहीं है।',
    'performance.subtitlePrefix': 'ग्राहकों को आप कैसे दिखते हैं — आपके पिछले',
    'performance.subtitleSuffix': 'अनुरोधों के आधार पर।',
    'performance.avgResponseHint': 'आप आने वाले अनुरोधों को कितनी तेज़ी से स्वीकार या अस्वीकार करते हैं',
    'performance.acceptanceHint': 'आपके स्वीकृत, अस्वीकृत, या छूटे हुए अनुरोधों में से',

    'missedHome.title': 'छूटे हुए सत्र',
    'missedHome.viewAll': 'सभी देखें',
    'missedHome.today': 'आज',
    'missedHome.yesterday': 'कल',
    'missedHome.thisMonth': 'इस महीने',
    'missedHome.all': 'सभी',
    'missedHome.chat': 'चैट',
    'missedHome.videoCall': 'वीडियो कॉल',
    'missedHome.audioCall': 'ऑडियो कॉल',
    'missedHome.more': 'और',

    'call.audioCall': 'ऑडियो कॉल',
    'call.videoCall': 'वीडियो कॉल',
    'call.connecting': 'कनेक्ट हो रहा है...',
    'call.mute': 'म्यूट करें',
    'call.unmute': 'अनम्यूट करें',
    'call.video': 'वीडियो',
    'call.videoOff': 'वीडियो बंद',
    'call.flip': 'पलटें',
    'call.speaker': 'स्पीकर',
    'call.earpiece': 'ईयरपीस',
    'call.billingActive': 'बिलिंग सक्रिय',
    'call.endCallTitle': 'कॉल समाप्त करें',
    'call.endCallMsg': 'क्या आप वाकई कॉल समाप्त करना चाहते हैं?',
    'call.end': 'समाप्त करें',
    'call.permissionRequired': 'अनुमति आवश्यक है',
    'call.micPermissionMsg': 'ऑडियो कॉल के लिए माइक्रोफ़ोन एक्सेस आवश्यक है।',
    'call.micCameraPermissionMsg': 'वीडियो कॉल के लिए माइक्रोफ़ोन और कैमरा एक्सेस आवश्यक है।',
    'call.typing': 'टाइप कर रहे हैं...',
    'call.messagePlaceholder': 'संदेश...',
    'call.sessionEnded': 'सत्र समाप्त',

    'editProfile.requiredNotice': 'जिन फ़ील्ड पर',
    'editProfile.requiredNoticeSuffix': 'का निशान है, वे Astrowani ग्राहक ऐप में आपकी प्रोफ़ाइल दिखाने के लिए आवश्यक हैं।',
    'editProfile.profilePhoto': 'प्रोफ़ाइल फोटो',
    'editProfile.removePhoto': 'फोटो हटाएं',
    'editProfile.fullName': 'पूरा नाम',
    'editProfile.email': 'ईमेल',
    'editProfile.phoneNumber': 'फ़ोन नंबर',
    'editProfile.gender': 'लिंग',
    'editProfile.aboutYou': 'आपके बारे में',
    'editProfile.description': 'विवरण',
    'editProfile.experienceYears': 'अनुभव (वर्ष)',
    'editProfile.chargesLockedNotice': 'आपके शुल्क लॉक हैं — आपने इन्हें एक बार सेट कर दिया है। बदलाव के लिए एडमिन टीम से संपर्क करें।',
    'editProfile.chargesHint': 'चैट / कॉल / वीडियो शुल्क में से कम से कम एक ₹0 से ऊपर सेट होना चाहिए।',
    'editProfile.chatCharges': 'चैट शुल्क (₹/मिनट)',
    'editProfile.callCharges': 'कॉल शुल्क (₹/मिनट)',
    'editProfile.videoCharges': 'वीडियो शुल्क (₹/मिनट)',
    'editProfile.languages': 'भाषाएं (कॉमा से अलग करें)',
    'editProfile.payoutDetails': 'भुगतान विवरण',
    'editProfile.payoutHint': 'निकासी का अनुरोध करने के लिए आवश्यक — बैंक खाता या UPI ID जोड़ें।',
    'editProfile.accountHolderName': 'खाताधारक का नाम',
    'editProfile.accountNumber': 'खाता संख्या',
    'editProfile.ifscCode': 'IFSC कोड',
    'editProfile.bankName': 'बैंक का नाम',
    'editProfile.upiId': 'UPI ID (बैंक विवरण का विकल्प)',
    'editProfile.saveChanges': 'बदलाव सेव करें',
    'editProfile.chooseOption': 'एक विकल्प चुनें',
    'editProfile.camera': 'कैमरा',
    'editProfile.gallery': 'गैलरी',
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
