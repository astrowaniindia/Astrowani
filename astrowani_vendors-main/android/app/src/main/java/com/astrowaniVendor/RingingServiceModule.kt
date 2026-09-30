package com.astrowaniVendor

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
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
  fun start(title: String?, body: String?, requestDataJson: String?, promise: Promise) {
    try {
      val intent = Intent(reactContext, RingingCallService::class.java).apply {
        action = RingingCallService.ACTION_START
        putExtra(RingingCallService.EXTRA_TITLE, title ?: "Incoming request")
        if (!body.isNullOrEmpty()) putExtra(RingingCallService.EXTRA_BODY, body)
        if (!requestDataJson.isNullOrEmpty()) putExtra(RingingCallService.EXTRA_REQUEST_DATA, requestDataJson)
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

  // ── Overlay permission helpers ────────────────────────────────────────────

  /**
   * Returns true if the app has permission to draw over other apps
   * (SYSTEM_ALERT_WINDOW / "Display over other apps").
   */
  @ReactMethod
  fun checkOverlayPermission(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        promise.resolve(Settings.canDrawOverlays(reactContext))
      } else {
        // Pre-Marshmallow: SYSTEM_ALERT_WINDOW is auto-granted via the manifest
        promise.resolve(true)
      }
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }

  /**
   * Opens the system Settings screen where the user can grant "Display over other apps".
   */
  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactContext.packageName}"),
      )
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Throwable) {
      android.util.Log.w("RingingServiceModule", "requestOverlayPermission failed: ${e.message}")
      promise.resolve(false)
    }
  }

  // ── Pending overlay action (SharedPreferences) ────────────────────────────

  /**
   * Returns (and clears) any pending Accept/Reject action that was stored by
   * RingingCallService's overlay button handler. Used by NavigationScreen.js to
   * consume the action on cold start (when the JS bridge wasn't alive to receive
   * a DeviceEvent).
   *
   * Returns a WritableMap {action: string, data: string} or null.
   */
  @ReactMethod
  fun getPendingOverlayAction(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences("overlay_actions", Context.MODE_PRIVATE)
      val action = prefs.getString("pending_action", null)
      val data = prefs.getString("pending_data", null)

      if (action != null) {
        prefs.edit().clear().apply()
        val map = Arguments.createMap()
        map.putString("action", action)
        map.putString("data", data ?: "{}")
        promise.resolve(map)
      } else {
        promise.resolve(null)
      }
    } catch (e: Throwable) {
      promise.resolve(null)
    }
  }
}
