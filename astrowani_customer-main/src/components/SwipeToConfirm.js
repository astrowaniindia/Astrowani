import React, {useRef} from 'react';
import {Animated, Pressable, StyleSheet, Text, ActivityIndicator, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS} from '../Theme/Colors';
import {moderateScale, scale, verticalScale} from '../utils/Scaling';

/**
 * The confirm control used wherever money leaves the wallet -- the nine astro-report
 * purchase screens and the wallet recharge screen.
 *
 * IT IS A BUTTON, NOT A SLIDE. It used to be a drag-across-the-track control in the
 * shape of a food-delivery checkout, on the reasoning that a drag is harder to trigger
 * by accident than a tap. That was dropped on the owner's instruction (2026-10-24,
 * after the first iPhone TestFlight round): slide controls are an extra thing to learn
 * on a payment screen, they are awkward with one hand, and the whole app was asked to
 * move to plain buttons.
 *
 * THE NAME AND THE PROPS ARE DELIBERATELY UNCHANGED (`label`, `confirmingLabel`,
 * `onConfirm`, `busy`, `disabled`), so all eleven call sites keep working untouched and
 * there is one place to look if the control ever changes again. Renaming the file would
 * have meant eleven edits to swap a presentational component.
 *
 * The accidental-tap protection the drag used to provide is kept in a form that costs
 * the customer nothing: `firedRef` makes `onConfirm` fire at most once per press cycle,
 * so a double tap on a slow network cannot open two Razorpay orders. The amount and the
 * total are already on screen directly above this control.
 */
export default function SwipeToConfirm({
  label,
  confirmingLabel,
  onConfirm,
  busy = false,
  disabled = false,
}) {
  const press = useRef(new Animated.Value(0)).current;
  const firedRef = useRef(false);
  const locked = disabled || busy;

  const animateTo = (value) =>
    Animated.spring(press, {
      toValue: value,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();

  const handlePress = () => {
    if (locked || firedRef.current) {
      return;
    }
    firedRef.current = true;
    // Released on the next tick rather than kept for the lifetime of the component:
    // `busy` is what guards the in-flight request, and a permanently-latched ref
    // would leave the button dead after a payment the customer cancelled.
    setTimeout(() => {
      firedRef.current = false;
    }, 1200);
    onConfirm?.();
  };

  return (
    <Animated.View style={{transform: [{scale: press.interpolate({inputRange: [0, 1], outputRange: [1, 0.97]})}]}}>
      <Pressable
        onPress={handlePress}
        onPressIn={() => animateTo(1)}
        onPressOut={() => animateTo(0)}
        disabled={locked}
        accessibilityRole="button"
        accessibilityState={{disabled: locked, busy}}
        accessibilityLabel={busy ? confirmingLabel || label : label}
        style={[styles.button, locked && styles.buttonLocked]}>
        {busy ? (
          <View style={styles.row}>
            <ActivityIndicator color={COLORS.white} />
            {!!confirmingLabel && <Text style={styles.label}>{confirmingLabel}</Text>}
          </View>
        ) : (
          <View style={styles.row}>
            <Text style={styles.label} numberOfLines={1}>{label}</Text>
            <MaterialIcons
              name="arrow-forward"
              size={moderateScale(20)}
              color={COLORS.white}
            />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    height: verticalScale(52),
    borderRadius: moderateScale(26),
    backgroundColor: COLORS.AstroMaroon,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(18),
  },
  // Dimmed rather than greyed out: the control keeps its shape so the screen does
  // not reflow when an amount is finally entered.
  buttonLocked: {
    opacity: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  label: {
    color: COLORS.white,
    fontSize: moderateScale(16),
    fontFamily: 'Poppins-Bold',
    letterSpacing: 0.2,
  },
});
