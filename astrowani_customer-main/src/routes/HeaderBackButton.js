import React from 'react';
import { TouchableOpacity } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { moderateScale } from '../utils/Scaling';

/**
 * An explicit header back control.
 *
 * The native-stack back button is unreliable on iOS in this app (react-native-screens
 * 4.18 is paired with react-navigation 6, which it does not officially support): the
 * capsule renders empty and the tap does nothing. A plain Touchable rendered as
 * `headerLeft` is drawn and hit-tested by React Native itself, so it does not depend
 * on that native header button at all.
 *
 * `canGoBack()` is checked because `headerLeft` is also rendered on the first screen
 * of a stack reached by a tab/drawer switch, where `goBack()` would be a no-op.
 */
export default function HeaderBackButton({ navigation, color = '#fff' }) {
  return (
    <TouchableOpacity
      onPress={() => {
        if (navigation?.canGoBack?.()) {
          navigation.goBack();
        } else {
          navigation?.navigate?.('DrawerNavigator');
        }
      }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{ paddingRight: moderateScale(8), paddingVertical: moderateScale(4) }}
      accessibilityRole="button"
      accessibilityLabel="Go back">
      <MaterialIcons name="arrow-back" size={moderateScale(24)} color={color} />
    </TouchableOpacity>
  );
}
