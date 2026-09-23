package com.astrowanicustomer

import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Reads the Play Install Referrer — the string that tells us WHICH offline QR poster
 * (or which ad) sent this install.
 *
 * Each printed poster's QR points at a Play Store link carrying its own
 * `referrer=utm_source=qr_<place>`. Google stores that against the install and hands it
 * back here, which is the only way to connect a poster on a wall in Haridwar to an
 * account in our database. See src/utils/acquisition.js for the JS side and
 * astrowani-backend/src/acquisition.js for the `qr_` naming rule.
 *
 * WHY A HAND-WRITTEN MODULE rather than an npm wrapper: the whole job is one Google
 * library and ~40 lines, this app already carries its own native modules for exactly
 * this reason (see CallServiceModule.kt), and an abandoned third-party wrapper is a
 * liability on a native dependency that can only be changed by a store release.
 *
 * Legacy (non-TurboModule) module on purpose: newArchEnabled=false in
 * android/gradle.properties, so this is the shape the app actually uses.
 *
 * NOTE ON WHEN THIS WORKS: the referrer is set at install time by the Play Store, and
 * Play retains it, so this can be called days later and still returns the original
 * value. It returns empty for a sideloaded APK, for a build installed before this
 * shipped, and on any device with no Play Store.
 */
class InstallReferrerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "InstallReferrer"

  /**
   * Resolve with the raw referrer string, or "" when it cannot be determined.
   *
   * NEVER rejects. This runs inside the OTP verification call: a customer signing in
   * must not be blocked, or even delayed into an error, because a marketing
   * attribution could not be read. An empty string simply means "unattributed", which
   * the backend already treats as unknown.
   */
  @ReactMethod
  fun getInstallReferrer(promise: Promise) {
    // The setup listener can fire more than once (a disconnect/retry races the first
    // callback). Resolving a React Promise twice throws, so the first answer wins and
    // every later one is dropped.
    val answered = AtomicBoolean(false)
    fun answer(value: String) {
      if (answered.compareAndSet(false, true)) promise.resolve(value)
    }

    val client: InstallReferrerClient
    try {
      client = InstallReferrerClient.newBuilder(reactContext).build()
    } catch (e: Throwable) {
      answer("")
      return
    }

    try {
      client.startConnection(object : InstallReferrerStateListener {
        override fun onInstallReferrerSetupFinished(responseCode: Int) {
          try {
            if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
              answer(client.installReferrer?.installReferrer ?: "")
            } else {
              // FEATURE_NOT_SUPPORTED / SERVICE_UNAVAILABLE / DEVELOPER_ERROR are all
              // "we cannot know", not failures worth surfacing to a signing-in customer.
              answer("")
            }
          } catch (e: Throwable) {
            answer("")
          } finally {
            try { client.endConnection() } catch (e: Throwable) { /* nothing left to do */ }
          }
        }

        override fun onInstallReferrerServiceDisconnected() {
          // Deliberately no retry: the JS side races this against a timeout and falls
          // back to "unattributed" anyway, and a retry loop here would hold the signup.
          answer("")
        }
      })
    } catch (e: Throwable) {
      // SecurityException / missing Play Services / anything else the service throws.
      answer("")
      try { client.endConnection() } catch (e2: Throwable) { /* nothing left to do */ }
    }
  }
}
