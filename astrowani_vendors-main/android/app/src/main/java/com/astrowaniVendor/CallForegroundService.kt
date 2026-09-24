package com.astrowaniVendor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/**
 * Keeps the microphone alive while a call is in progress.
 *
 * THE BUG THIS FIXES: on Android 11+ the OS silences the microphone for any app that
 * is not in the foreground, and from Android 14 (API 34) the only way to keep
 * capturing is to run a foreground service whose type is `microphone`. This app
 * targets SDK 36, declared no <service> at all, and did not hold
 * FOREGROUND_SERVICE_MICROPHONE — so the moment the astrologer switched apps or hit
 * Home, their voice stopped reaching the customer, and came back only when they
 * returned to the app. That matches the reported symptom exactly.
 *
 * Note an `ongoing: true` local notification is NOT sufficient and never was — it
 * looks like a call notification but grants no microphone privilege. Only a real
 * foreground service of type `microphone` does. (The customer app already had such a
 * notification, which is why the problem looked like it should already be handled.)
 *
 * Starting this service also stops Android from freezing or killing the process while
 * backgrounded, which is the likely cause of the rarer "call just cut" report.
 *
 * MUST be started while the app is in the foreground — Android forbids launching a
 * microphone-type foreground service from the background, and RECORD_AUDIO must
 * already be granted. Both hold: it is started from the call screen at the moment the
 * call connects, after permissions were requested.
 */
class CallForegroundService : Service() {

  companion object {
    const val ACTION_START = "com.astrowaniVendor.callservice.START"
    const val ACTION_STOP = "com.astrowaniVendor.callservice.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    // What the service is keeping alive. "call" (audio call, the original and the
    // default, so an older caller that sends no mode behaves exactly as before), "chat",
    // "video" (a video call: camera + microphone), or "live" (a broadcast).
    const val EXTRA_MODE = "mode"
    const val MODE_CALL = "call"
    const val MODE_CHAT = "chat"
    const val MODE_VIDEO = "video"
    const val MODE_LIVE = "live"

    private const val CHANNEL_ID = "astrowani-ongoing-call"
    private const val NOTIFICATION_ID = 4517

    // Belt and braces: if the JS side never gets to call stop() (process asleep, session
    // ended by the server while the app was away) the service ends itself rather than
    // leaving a "chat in progress" notification pinned forever. Sessions are capped at
    // 2h server-side (MAX_BILLED_SESSION_MS); live has no cap, so it gets a long one.
    private const val MAX_CALL_OR_CHAT_MS = 3L * 60 * 60 * 1000
    private const val MAX_LIVE_MS = 12L * 60 * 60 * 1000
  }

  private var mode: String = MODE_CALL
  private val handler = Handler(Looper.getMainLooper())
  private val autoStop = Runnable { stopSelfSafely() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelfSafely()
      return START_NOT_STICKY
    }

    mode = intent?.getStringExtra(EXTRA_MODE) ?: MODE_CALL
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Call in progress"
    val body = intent?.getStringExtra(EXTRA_BODY) ?: "Tap to return to your call"

    createChannel()

    // startForeground MUST happen within ~5s of startForegroundService or Android
    // kills the process, so it is the first thing done here.
    val notification = buildNotification(title, body)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      var started = false
      try {
        startForeground(NOTIFICATION_ID, notification, typeFor(mode))
        started = true
      } catch (e: Throwable) {
        // A live broadcast asks for camera|microphone; Android 14+ refuses the camera
        // type if the CAMERA permission is not granted at this instant. Fall back to
        // microphone rather than failing outright — audio still keeps flowing.
        android.util.Log.w("CallFgService", "typed startForeground failed for $mode: ${e.message}")
      }
      if (!started) {
        try {
          startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } catch (e: Throwable) {
          // Nothing more to try — better to end quietly than crash the call/chat screen.
          android.util.Log.w("CallFgService", "fallback startForeground failed: ${e.message}")
          stopSelf()
          return START_NOT_STICKY
        }
      }
    } else {
      // Pre-Q has no typed foreground services, and pre-Android 11 does not gag a
      // backgrounded app's microphone either, so the plain call is correct there.
      startForeground(NOTIFICATION_ID, notification)
    }

    handler.removeCallbacks(autoStop)
    handler.postDelayed(autoStop, if (mode == MODE_LIVE) MAX_LIVE_MS else MAX_CALL_OR_CHAT_MS)

    // Deliberately NOT START_STICKY: if the process dies the call is over, and
    // resurrecting a service for a call that no longer exists would leave an
    // undismissable notification with no way to end it.
    return START_NOT_STICKY
  }

  private fun typeFor(mode: String): Int = when (mode) {
    // The socket has to survive the app being backgrounded; no camera or mic involved.
    MODE_CHAT -> ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    // A video call must keep publishing video while backgrounded, not just audio — with
    // the microphone type alone Android stops the camera and the customer sees a freeze.
    MODE_VIDEO, MODE_LIVE ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      } else {
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
      }
    else -> ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
  }

  // Android 15 caps a dataSync service at 6h per 24h and, when the cap is hit, calls this;
  // the service MUST stop promptly or the app is killed with an ANR. Two overloads because
  // API 34 delivers (startId) and API 35+ delivers (startId, fgsType).
  override fun onTimeout(startId: Int) {
    stopSelfSafely()
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    stopSelfSafely()
  }

  override fun onDestroy() {
    handler.removeCallbacks(autoStop)
    super.onDestroy()
    stopForegroundCompat()
  }

  // A swiped-away CALL is over (the peer connection dies with the app), so tear the
  // notification down rather than leaving an orphan. A CHAT or LIVE stream is different:
  // the server keeps the session open for a grace window and the app resumes it when
  // reopened, so the notification is exactly what lets the astrologer find their way back.
  // It goes away when the JS side ends the session, when the server's session_ended push
  // arrives, or via the auto-stop timer above.
  override fun onTaskRemoved(rootIntent: Intent?) {
    if (mode == MODE_CALL) stopSelfSafely()
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

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Ongoing call",
      // LOW: the call screen is already the user's focus; this must not buzz or
      // make a sound every time a call starts.
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Keeps your microphone working while a call is in progress."
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(title: String, body: String): Notification {
    // Tapping brings the existing task back to the front, which resumes the live
    // call screen. No deep link needed: the whole point of this service is that the
    // process stays alive, so the screen is still mounted.
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
      .setContentText(body)
      // The app's existing notification silhouette (already shipped across every
      // density bucket and used for FCM). A launcher icon would render as a
      // white blob here, since Android forces status-bar icons to a silhouette.
      .setSmallIcon(R.drawable.ic_notification)
      .setContentIntent(contentIntent)
      .setOngoing(true)          // not swipeable — it ends when the call ends
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(
        if (mode == MODE_CALL) NotificationCompat.CATEGORY_CALL else NotificationCompat.CATEGORY_SERVICE,
      )
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()
  }
}
