package com.astrowanicustomer

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AstrologyApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // react-native-screens requires the Activity to not pass a saved instance state bundle to
  // super.onCreate(), otherwise Android's Fragment restoration (after the process is killed in
  // the background and later restored) tries to reconstruct a ScreenStackFragment via
  // reflection and throws Fragment$InstantiationException, crashing the app at launch.
  // See https://github.com/software-mansion/react-native-screens#android
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
