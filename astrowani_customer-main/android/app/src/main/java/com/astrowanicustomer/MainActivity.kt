package com.astrowanicustomer

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  // Android tears the cold-start splash down at the activity's FIRST FRAME, which
  // ReactActivity reaches as soon as it has set an empty ReactRootView as the content
  // view — long before the JS bundle has been read and evaluated. Everything painted in
  // between is AppTheme's bare windowBackground with nothing in it.
  //
  // Measured on an Android 12 device (2026-10-08): the splash was dismissed at +2963ms
  // and JS did not start until +5254ms, so 2.3s of that launch showed an empty window.
  // That window used to be WHITE (AppCompat.Light's default, before styles.xml set it to
  // the brand brown), and the gap is pure JS startup cost, so it scales with how slow the
  // phone is — a blink on a new handset, 15-30s of white on an older one. That is the
  // "white screen on open" this flag exists to close.
  //
  // setKeepOnScreenCondition holds the splash across EVERY api level (core-splashscreen
  // emulates it below 31, the platform owns it from 31) until React has actually put a
  // child in its root view, i.e. until there is a real frame to hand over to.
  private var splashReleased = false

  // Safety valve. If React never draws — a native crash loop, a wedged bundle load — the
  // splash must not become a permanent freeze. Past this the activity is revealed anyway,
  // which is no worse than the behaviour before this flag existed (windowBackground is the
  // same brown as the splash, so the handover is invisible rather than a white flash).
  private val splashHoldDeadlineMs = 20_000L

  // AndroidManifest sets this activity's theme to BootTheme (core-splashscreen's
  // Theme.SplashScreen) so the cold-start splash uses our branding instead of API 31+'s
  // default white background + heavily inset launcher icon. installSplashScreen() must run
  // before super.onCreate(); it also makes the same theme render consistently pre-31.
  // setTheme(AppTheme) then hands the rest of the activity's lifetime back to the real app
  // theme once the splash icon has been captured.
  //
  // super.onCreate(null) — NOT savedInstanceState — for the same reason as the vendor
  // app's identical fix (see its MainActivity.kt): react-native-screens' ScreenStackFragment
  // cannot be reconstructed from a restored saved-instance-state bundle after Android kills
  // the process for memory and throws IllegalStateException on the next launch attempt,
  // crashing before any JS runs. Passing null forces a fresh start instead of a restore.
  override fun onCreate(savedInstanceState: Bundle?) {
    installSplashScreen().setKeepOnScreenCondition { !splashReleased }
    setTheme(R.style.AppTheme)
    super.onCreate(null)
    holdSplashUntilReactDraws()
  }

  /**
   * Keeps the splash up until React's root view has its first child, then lets go.
   *
   * A pre-draw listener is the right hook because it is the same one core-splashscreen
   * re-checks the keep-on-screen condition from, so releasing here takes effect on the
   * very next draw. Every listener on the tree runs even while the splash is cancelling
   * draws, and layout still happens, so React's children do appear while we are waiting.
   */
  private fun holdSplashUntilReactDraws() {
    val content = findViewById<ViewGroup>(android.R.id.content)
    if (content == null) {
      releaseSplash()
      return
    }
    content.viewTreeObserver.addOnPreDrawListener(
        object : ViewTreeObserver.OnPreDrawListener {
          override fun onPreDraw(): Boolean {
            if (reactHasDrawn(content)) {
              content.viewTreeObserver.removeOnPreDrawListener(this)
              splashReleased = true
            }
            return true
          }
        })
    Handler(Looper.getMainLooper()).postDelayed({ releaseSplash() }, splashHoldDeadlineMs)
  }

  /**
   * The activity's content child is React's root view. ReactActivityDelegate sets it
   * before any JS has run, so its mere existence means nothing — it stays EMPTY until
   * React commits its first render. A child inside it is the earliest honest signal that
   * there is something to show.
   */
  private fun reactHasDrawn(content: ViewGroup): Boolean {
    for (i in 0 until content.childCount) {
      val child = content.getChildAt(i)
      if (child is ViewGroup && child.childCount > 0) return true
    }
    return false
  }

  private fun releaseSplash() {
    if (splashReleased) return
    splashReleased = true
    // The condition is only re-read on a draw pass, and a wedged launch may not be
    // drawing at all — ask for one so the deadline can actually take effect.
    findViewById<ViewGroup>(android.R.id.content)?.invalidate()
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
