import React from 'react';
import { TouchableOpacity } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { moderateScale, scale } from '../utils/Scaling';

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
export default function HeaderBackButton({ navigation, color = '#fff', onPress }) {
  return (
    <TouchableOpacity
      onPress={() => {
        // An explicit handler wins: a screen that is the only one in its own nested
        // stack has nothing to go back TO there, and must pop the PARENT navigator.
        if (onPress) { onPress(); return; }
        if (navigation?.canGoBack?.()) {
          navigation.goBack();
        } else {
          navigation?.navigate?.('DrawerNavigator');
        }
      }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      // Centred, with EQUAL padding on every side. The first version padded only the
      // right and the vertical, which pushed the glyph off-centre inside the circular
      // press area -- visible on the astrologer profile and reported as a misaligned
      // arrow. alignItems/justifyContent keep it centred whatever the icon metrics do.
      style={{
        width: moderateScale(34),
        height: moderateScale(34),
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityRole="button"
      accessibilityLabel="Go back">
      <MaterialIcons name="arrow-back" size={moderateScale(24)} color={color} />
    </TouchableOpacity>
  );
}

/**
 * The same centred box for a header icon that is not the back button -- the wallet's
 * history button, and anything added later.
 *
 * Header buttons in this app were bare Touchables carrying nothing but a margin. iOS
 * draws them inside a chip, and without a fixed, centred box the glyph sits off to one
 * side of it; reported as misaligned icons across several screens on 2026-10-26.
 */
export function HeaderIconButton({ name, onPress, color = '#fff', side = 'right' }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{
        width: moderateScale(34),
        height: moderateScale(34),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: side === 'right' ? scale(6) : 0,
        marginLeft: side === 'left' ? scale(6) : 0,
      }}
      accessibilityRole="button">
      <MaterialIcons name={name} size={moderateScale(24)} color={color} />
    </TouchableOpacity>
  );
}
