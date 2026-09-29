package com.astrowaniVendor

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge for RingingCallService — see that file for why it exists.
 *
 * start() is called from Firebase.js's setBackgroundMessageHandler, which can run with
 * the app fully killed. `startForegroundService` from that context is only permitted
 * because the triggering FCM message is sent with `android: {priority: 'high'}`
 * (astrowani-backend/src/push.js) — that is one of Android's own documented exemptions
 * to the background-foreground-service-start restriction introduced in Android 8+.
 *
 * Legacy (non-TurboModule) module — same as CallServiceModule, matching
 * newArchEnabled=false in android/gradle.properties.
 *
 * Every method resolves rather than rejects. Losing this service means the astrologer
 * only gets the shorter fallback notification sound instead of a real ring — worse, but
 * never worth throwing into whatever JS context called it (a background push handler is
 * exactly the place a thrown error would be hardest to see or recover from).
 */
class RingingServiceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "RingingCallService"

  @ReactMethod
  fun start(title: String?, body: String?, promise: Promise) {
    try {
      val intent = Intent(reactContext, RingingCallService::class.java).apply {
        action = RingingCallService.ACTION_START
        putExtra(RingingCallService.EXTRA_TITLE, title ?: "Incoming request")
        if (!body.isNullOrEmpty()) putExtra(RingingCallService.EXTRA_BODY, body)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Throwable) {
      android.util.Log.w("RingingServiceModule", "start failed: ${e.message}")
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      // stopService only — never start-to-stop. Same reasoning as CallServiceModule.
      reactContext.stopService(Intent(reactContext, RingingCallService::class.java))
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }
}
