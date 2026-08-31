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

// Same "show the popup once" pattern for the free 12-minute intro CALL that
// replaced the bot chat. Note this only suppresses the automatic POPUP — the
// floating gift bubble stays until the customer actually books, which is the
// whole point of it. Eligibility itself is decided server-side, never here.
const FREE_CALL_PREFIX = 'freeCallOfferSeen_';

export const hasSeenFreeCallOffer = async (customerId) => {
  try {
    const value = await AsyncStorage.getItem(FREE_CALL_PREFIX + customerId);
    return value === 'true';
  } catch (e) {
    // Fail as "already seen": a storage error must not turn this into a popup
    // that reappears on every single Home mount.
    return true;
  }
};

export const markFreeCallOfferSeen = async (customerId) => {
  try {
    await AsyncStorage.setItem(FREE_CALL_PREFIX + customerId, 'true');
  } catch (e) {}
};
