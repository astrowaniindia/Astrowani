package com.astrowaniVendor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat

/**
 * Plays the real phone ringtone for an incoming call/chat request, and keeps doing so
 * whether the app is backgrounded OR fully killed.
 *
 * THE BUG THIS FIXES (reported 2026-09-29): the previous approach relied on the
 * notification CHANNEL's own sound (Notifee's `sound: 'default'`), looped via
 * `loopSound`/FLAG_INSISTENT. That resolves to Android's short default NOTIFICATION
 * sound (a "ding"), not the phone's actual RINGTONE — and repeating a short ding
 * back-to-back sounds exactly like the "irritating loop" reported, nothing like a real
 * incoming call. Notifee has no JS-level option to point a channel at the ringtone
 * category instead, and Android's own Notification.CallStyle (which handles this
 * correctly out of the box) isn't exposed by Notifee either.
 *
 * THE FIX: play the real ringtone NATIVELY, the same way `incomingRingtone.js` already
 * does correctly while the app is alive (a MediaPlayer on the ringtone URI with
 * setLooping(true) — see that file's own comment, confirmed against
 * react-native-incall-manager's actual source). Doing it here instead of trusting the JS
 * side to survive is the whole point: Android can reclaim the process shortly after a
 * background FCM handler returns, which would kill any JS-driven MediaPlayer along with
 * it. A real foreground service is what stops Android from doing that — and `phoneCall`
 * is one of the few foreground service types Android allows starting from the
 * background at all, specifically in response to a high-priority FCM message (which the
 * backend already sends — see astrowani-backend/src/push.js: `android: {priority:
 * 'high'}`).
 *
 * This runs ALONGSIDE the existing actionable Notifee notification (title, caller name,
 * Accept/Reject) — that plumbing is unchanged and already proven working. This service's
 * own foreground notification is deliberately silent/low-priority so the two don't
 * visually or audibly compete; this service's only job is (a) keep the process alive and
 * (b) make the actual ringing sound.
 *
 * OVERLAY (added 2026-09-30): Also shows a persistent floating overlay banner at the top
 * of the screen (via SYSTEM_ALERT_WINDOW) with Accept/Reject buttons. The standard
 * heads-up notification auto-dismisses after ~5s (Android platform behavior); this
 * overlay stays visible as long as the request is outstanding — matching the behavior of
 * a real phone call. Requires the user to grant "Display over other apps" once; degrades
 * gracefully (notification-only) if the permission is missing.
 */
class RingingCallService : Service() {

  companion object {
    const val ACTION_START = "com.astrowaniVendor.ringingservice.START"
    const val ACTION_STOP = "com.astrowaniVendor.ringingservice.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_REQUEST_DATA = "requestData"

    private const val CHANNEL_ID = "astrowani-ringing-service"
    private const val NOTIFICATION_ID = 4518
    private const val PREFS_NAME = "overlay_actions"

    // Safety net: if JS never calls stop() (a crash, a lost bridge, the request already
    // resolved before the stop message arrived), the ring must not continue forever. The
    // backend's own stale-request sweep flips an unanswered request to 'missed' at 75s
    // (sessionManager.markStaleRequestsMissed) — stop just after that, not before it, so a
    // slow-but-real accept is never cut off by this safety net first.
    private const val MAX_RING_MS = 80L * 1000
  }

  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private val handler = Handler(Looper.getMainLooper())
  private val autoStop = Runnable { stopSelfSafely() }

  // ── Overlay ────────────────────────────────────────────────────────────────
  private var overlayView: View? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelfSafely()
      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Incoming request"
    val body = intent?.getStringExtra(EXTRA_BODY)
    val requestData = intent?.getStringExtra(EXTRA_REQUEST_DATA)

    createChannel()

    // startForeground MUST happen within ~5s of startForegroundService or Android kills
    // the process, so it is the first thing done here — before touching the MediaPlayer.
    val notification = buildNotification(title, body)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Throwable) {
      // Better to end quietly (the Notifee notification is still up, still actionable —
      // only the enhanced ringing is lost) than crash the process handling a push.
      android.util.Log.w("RingingCallService", "startForeground failed: ${e.message}")
      stopSelf()
      return START_NOT_STICKY
    }

    startRealRingtone()
    startVibration()

    // Show persistent overlay banner at the top of the screen. Degrades gracefully if
    // the permission is not granted — the Notifee notification still works.
    showOverlay(title, body, requestData)

    handler.removeCallbacks(autoStop)
    handler.postDelayed(autoStop, MAX_RING_MS)

    // Deliberately NOT START_STICKY: if the process dies the request is no longer
    // actionable from here anyway (Accept/Reject need a live JS bridge), so resurrecting
    // this service would just ring forever for a request nobody can act on.
    return START_NOT_STICKY
  }

  // ── Ringtone ───────────────────────────────────────────────────────────────

  private fun startRealRingtone() {
    try {
      val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      val player = MediaPlayer()
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .build(),
      )
      player.setDataSource(this, uri)
      player.isLooping = true
      player.setOnPreparedListener { it.start() }
      player.setOnErrorListener { _, what, extra ->
        android.util.Log.w("RingingCallService", "MediaPlayer error what=$what extra=$extra")
        true // consumed — do not let the default error handling tear down the service
      }
      player.prepareAsync()
      mediaPlayer = player
    } catch (e: Throwable) {
      // Ringing degraded, not crashed — the actionable Notifee notification is still up
      // and still audible via its own (short) sound.
      android.util.Log.w("RingingCallService", "startRealRingtone failed: ${e.message}")
    }
  }

  private fun startVibration() {
    try {
      val pattern = longArrayOf(0, 1000, 1000)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
        vibrator = vm.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(pattern, 0)
      }
    } catch (e: Throwable) {
      android.util.Log.w("RingingCallService", "startVibration failed: ${e.message}")
    }
  }

  // ── Overlay (SYSTEM_ALERT_WINDOW) ──────────────────────────────────────────

  /**
   * Shows a persistent floating banner at the top of the screen with Accept/Reject
   * buttons. Uses TYPE_APPLICATION_OVERLAY, which requires the user to have granted
   * "Display over other apps" in Settings. If the permission is missing, this is a
   * silent no-op — the regular notification still works.
   */
  private fun showOverlay(title: String, body: String?, requestData: String?) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    if (!Settings.canDrawOverlays(this)) {
      android.util.Log.d("RingingCallService", "Overlay permission not granted, skipping overlay")
      return
    }

    try {
      removeOverlay() // clean up any stale overlay from a previous request

      val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val view = buildOverlayView(title, body, requestData)

      val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
      } else {
        @Suppress("DEPRECATION")
        WindowManager.LayoutParams.TYPE_PHONE
      }

      val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        layoutType,
        // NOT_FOCUSABLE: the overlay doesn't intercept input outside its bounds, so the
        // home screen / whatever is behind it remains usable. SHOW_WHEN_LOCKED and
        // TURN_SCREEN_ON ensure the overlay appears on a locked screen and wakes it.
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
        PixelFormat.TRANSLUCENT,
      )
      params.gravity = Gravity.TOP

      wm.addView(view, params)
      overlayView = view
    } catch (e: Throwable) {
      android.util.Log.w("RingingCallService", "showOverlay failed: ${e.message}")
    }
  }

  /**
   * Builds the overlay view hierarchy programmatically (no XML layout required).
   * Matches the app's dark/gold theme:
   *
   *  ┌──────────────────────────────────────────┐
   *  │  [🔮]  Incoming Call                     │
   *  │        From Ansh                         │
   *  │                                          │
   *  │  [ Reject ]              [ Accept ]      │
   *  └──────────────────────────────────────────┘
   */
  private fun buildOverlayView(title: String, body: String?, requestData: String?): View {
    val ctx: Context = this
    val density = resources.displayMetrics.density
    fun dp(v: Int) = (v * density + 0.5f).toInt()

    // ── Root container ──────────────────────────────────────────────────────
    val root = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      // Extra top padding for the status bar area (~40dp)
      setPadding(dp(16), dp(48), dp(16), dp(20))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#1E1028"))
        // Only bottom corners are rounded — top edge is flush with the screen edge
        cornerRadii = floatArrayOf(
          0f, 0f, 0f, 0f,
          dp(24).toFloat(), dp(24).toFloat(),
          dp(24).toFloat(), dp(24).toFloat(),
        )
      }
      elevation = dp(12).toFloat()
    }

    // ── Header row: icon + text ─────────────────────────────────────────────
    val headerRow = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(4), 0, dp(4), 0)
    }

    // App icon
    val icon = ImageView(ctx).apply {
      setImageResource(R.mipmap.ic_launcher_round)
      val iconSize = dp(48)
      layoutParams = LinearLayout.LayoutParams(iconSize, iconSize).apply {
        setMargins(0, 0, dp(14), 0)
      }
    }
    headerRow.addView(icon)

    // Title + body column
    val textCol = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    }

    val titleView = TextView(ctx).apply {
      text = "$title \uD83D\uDD14"  // 🔔
      setTextColor(Color.parseColor("#FFD700"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      typeface = Typeface.DEFAULT_BOLD
    }
    textCol.addView(titleView)

    if (!body.isNullOrEmpty()) {
      val bodyView = TextView(ctx).apply {
        text = body
        setTextColor(Color.parseColor("#DDDDDD"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        setPadding(0, dp(2), 0, 0)
      }
      textCol.addView(bodyView)
    }

    headerRow.addView(textCol)
    root.addView(headerRow)

    // ── Divider ─────────────────────────────────────────────────────────────
    val divider = View(ctx).apply {
      setBackgroundColor(Color.parseColor("#3A2A4A"))
      layoutParams = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, dp(1),
      ).apply { setMargins(0, dp(14), 0, dp(14)) }
    }
    root.addView(divider)

    // ── Button row ──────────────────────────────────────────────────────────
    val buttonRow = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(dp(8), 0, dp(8), 0)
    }

    // Reject button
    val rejectBtn = TextView(ctx).apply {
      text = "  ✕  Reject  "
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(14), dp(24), dp(14))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#C0392B"))
        cornerRadius = dp(28).toFloat()
      }
    }
    rejectBtn.setOnClickListener { handleOverlayAction("reject", requestData) }

    buttonRow.addView(
      rejectBtn,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
        setMargins(0, 0, dp(10), 0)
      },
    )

    // Accept button
    val acceptBtn = TextView(ctx).apply {
      text = "  ✓  Accept  "
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(dp(24), dp(14), dp(24), dp(14))
      background = GradientDrawable().apply {
        setColor(Color.parseColor("#27AE60"))
        cornerRadius = dp(28).toFloat()
      }
    }
    acceptBtn.setOnClickListener { handleOverlayAction("accept", requestData) }

    buttonRow.addView(
      acceptBtn,
      LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
        setMargins(dp(10), 0, 0, 0)
      },
    )

    root.addView(buttonRow)

    return root
  }

  /**
   * Handles an Accept or Reject tap on the overlay.
   *
   * Two delivery paths so the JS side always receives the action regardless of app state:
   *
   * 1. **SharedPreferences** (reliable for killed/cold-start): written BEFORE launching
   *    the Activity so the data survives even if the Activity launch fails. Consumed by
   *    NavigationScreen.js's onReady / AppState 'active' handler.
   *
   * 2. **Intent extra → MainActivity.onNewIntent → DeviceEvent** (immediate for
   *    backgrounded apps): the Activity is already alive, so onNewIntent fires and emits
   *    the DeviceEvent directly into the running JS bridge.
   */
  private fun handleOverlayAction(action: String, requestData: String?) {
    if (action == "accept") {
      // 1. Persist for the killed-app path
      getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putString("pending_action", action)
        .putString("pending_data", requestData ?: "{}")
        .apply()

      // 2. Launch / bring forward the Activity with extras for the backgrounded path
      try {
        val intent = Intent(this, MainActivity::class.java).apply {
          this.action = Intent.ACTION_MAIN
          addCategory(Intent.CATEGORY_LAUNCHER)
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
          putExtra("overlay_action", action)
          putExtra("overlay_data", requestData ?: "{}")
        }
        startActivity(intent)
      } catch (e: Throwable) {
        android.util.Log.w("RingingCallService", "Failed to launch MainActivity: ${e.message}")
      }
    } else if (action == "reject") {
      // Reject must NOT open or bring forward the app Activity.
      // Emit the onOverlayAction event directly to the live React Native context so JS can
      // call the reject API and clean up notifications in the background without opening the app.
      try {
        val reactApp = application as? com.facebook.react.ReactApplication
        val reactContext = reactApp?.reactNativeHost?.reactInstanceManager?.currentReactContext
        if (reactContext != null) {
          val emitter = reactContext.getJSModule(
            com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java
          )
          emitter.emit("onOverlayAction", com.facebook.react.bridge.Arguments.createMap().apply {
            putString("action", "reject")
            putString("data", requestData ?: "{}")
          })
        }
      } catch (e: Throwable) {
        android.util.Log.w("RingingCallService", "Failed to emit reject overlay action: ${e.message}")
      }
    }

    // 3. Stop this service (removes overlay, stops ringing, stops vibration)
    stopSelfSafely()
  }

  private fun removeOverlay() {
    try {
      overlayView?.let {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        wm.removeView(it)
      }
    } catch (_: Throwable) {
      // View may already have been removed (e.g. process tear-down race)
    }
    overlayView = null
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  override fun onDestroy() {
    handler.removeCallbacks(autoStop)
    removeOverlay()
    try {
      vibrator?.cancel()
    } catch (_: Throwable) {
    }
    try {
      mediaPlayer?.let {
        if (it.isPlaying) it.stop()
        it.release()
      }
    } catch (_: Throwable) {
    }
    mediaPlayer = null
    super.onDestroy()
    stopForegroundCompat()
  }

  // The app being swiped away mid-ring is the same as it never having woken up enough
  // to answer — nothing left that can accept/reject, so stop ringing rather than
  // continue for a request the astrologer has no way to act on anymore.
  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelfSafely()
    super.onTaskRemoved(rootIntent)
  }

  private fun stopSelfSafely() {
    stopForegroundCompat()
    stopSelf()
  }

  @Suppress("DEPRECATION")
  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      stopForeground(true)
    }
  }

  // ── Notification channel + builder ─────────────────────────────────────────

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Ringing (background)",
      // LOW and silent: the actual ring comes from the MediaPlayer above, and the
      // actionable Notifee notification already carries the visible/audible alert.
      // This channel's own notification exists only because Android requires every
      // foreground service to post one.
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Keeps the incoming-call ringtone playing in the background."
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(title: String, body: String?): Notification {
    val launch = Intent(this, MainActivity::class.java).apply {
      action = Intent.ACTION_MAIN
      addCategory(Intent.CATEGORY_LAUNCHER)
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    val contentIntent = PendingIntent.getActivity(this, 0, launch, pendingFlags)

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .apply { if (!body.isNullOrEmpty()) setContentText(body) }
      .setSmallIcon(R.drawable.ic_notification)
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()
  }
}
