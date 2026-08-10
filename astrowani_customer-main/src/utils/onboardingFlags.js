// Tracks which one-off onboarding hints (e.g. GuideAvatar tips) a user has
// already dismissed, so they show once per device and don't nag returning users.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'guideHintSeen_';

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
