package com.astrowaniVendor

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  // Fixes a real production crash (Sentry ASTROWANI-VENDOR-2, 2026-08-13):
  // "IllegalStateException: Screen fragments should never be restored" — when
  // Android kills the process (low memory) and later restores this Activity
  // from a saved instance state, react-native-screens' ScreenStackFragment
  // cannot be reconstructed from that saved state and throws on instantiation,
  // crashing the app before any JS even runs. react-native-screens' own docs
  // require passing null here instead of the real bundle, which tells Android
  // to do a fresh start (matching cold-start behavior) instead of attempting
  // fragment restoration. See https://github.com/software-mansion/react-native-screens/issues/17#issuecomment-424704067
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AstroIndia_Astrologers"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
