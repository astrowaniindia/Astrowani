// Opens a web link in the phone's browser, and tells the customer when it can't.
//
// Linking.openURL REJECTS when no installed app can handle the URL -- a phone
// with its only browser disabled, or a work profile with none. Called bare
// inside an onPress, that rejection went unhandled and was reported to Sentry
// (REACT-NATIVE-Z, a Moto g34 tapping Child Safety in Settings); the tap did
// nothing and the customer had no idea why. Several call sites added a silent
// `.catch(() => {})`, which avoided the report but left the same dead tap.
//
// Never throws. Resolves true when the link opened.
import {Linking} from 'react-native';
import {showStatusPopup} from '../components/StatusPopup';
import {translate} from '../context/LanguageContext';

export default async function openExternalUrl(url) {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch (_) {
    try {
      showStatusPopup({
        variant: 'info',
        title: translate('link.noBrowserTitle'),
        message: translate('link.noBrowserMessage', {url}),
      });
    } catch (__) {}
    return false;
  }
}
