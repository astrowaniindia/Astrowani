package com.astrowanicustomer

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * JS bridge for CallForegroundService — see that file for why the service exists.
 *
 * Legacy (non-TurboModule) module on purpose: newArchEnabled=false in
 * android/gradle.properties, so this is the shape the app actually uses.
 *
 * Every method resolves rather than rejects on failure. Losing the foreground
 * service degrades the call (the mic gets gagged in the background again) but it must
 * never break an in-progress call by throwing into the JS call screen.
 */
class CallServiceModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CallForegroundService"

  @ReactMethod
  fun start(title: String?, body: String?, promise: Promise) {
    try {
      val intent = Intent(reactContext, CallForegroundService::class.java).apply {
        action = CallForegroundService.ACTION_START
        putExtra(CallForegroundService.EXTRA_TITLE, title ?: "Call in progress")
        putExtra(CallForegroundService.EXTRA_BODY, body ?: "Tap to return to your call")
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (e: Throwable) {
      // Most likely cause: called while the app was already in the background, which
      // Android forbids for a microphone-type service. Callers start it on connect,
      // while the call screen is visible, so this should not happen in practice.
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      // stopService only. Routing a STOP action through startService first would
      // START the service just to stop it when no call is running, and on Android 8+
      // startService from the background throws outright. onDestroy tears the
      // notification down, so this is both simpler and safe when nothing is running.
      reactContext.stopService(Intent(reactContext, CallForegroundService::class.java))
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }
}
