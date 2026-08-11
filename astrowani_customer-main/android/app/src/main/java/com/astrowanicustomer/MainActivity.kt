package com.astrowanicustomer

import android.os.Bundle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  // AndroidManifest sets this activity's theme to BootTheme (core-splashscreen's
  // Theme.SplashScreen) so the cold-start splash uses our branding instead of API 31+'s
  // default white background + heavily inset launcher icon. installSplashScreen() must run
  // before super.onCreate(); it also makes the same theme render consistently pre-31.
  // setTheme(AppTheme) then hands the rest of the activity's lifetime back to the real app
  // theme once the splash icon has been captured.
  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen()
    setTheme(R.style.AppTheme)
    super.onCreate(savedInstanceState)
  }

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
}
