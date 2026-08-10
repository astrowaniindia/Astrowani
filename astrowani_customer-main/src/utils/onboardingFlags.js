// Tracks which one-off onboarding hints (e.g. GuideAvatar tips) a user has
// already dismissed, so they show once per device and don't nag returning users.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'guideHintSeen_';
// Same "show once" pattern, used to remember that a customer has already
// engaged with the free bot-chat welcome offer (started it or dismissed it) —
// independent of whether the server-side wallet credit ever fired, so someone
// who backed out of the chat early doesn't keep getting re-offered it.
const FREE_BOT_CHAT_PREFIX = 'freeBotChatOfferSeen_';

export const hasSeenGuideHint = async (key) => {
  try {
    const value = await AsyncStorage.getItem(PREFIX + key);
    return value === 'true';
  } catch (e) {
    return true;
  }
};

export const markGuideHintSeen = async (key) => {
  try {
    await AsyncStorage.setItem(PREFIX + key, 'true');
  } catch (e) {}
};

export const hasSeenFreeBotChatOffer = async (customerId) => {
  try {
    const value = await AsyncStorage.getItem(FREE_BOT_CHAT_PREFIX + customerId);
    return value === 'true';
  } catch (e) {
    return true;
  }
};

export const markFreeBotChatOfferSeen = async (customerId) => {
  try {
    await AsyncStorage.setItem(FREE_BOT_CHAT_PREFIX + customerId, 'true');
  } catch (e) {}
};
