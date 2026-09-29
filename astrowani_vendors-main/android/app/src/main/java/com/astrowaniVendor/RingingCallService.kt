package com.astrowaniVendor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
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
 */
class RingingCallService : Service() {

  companion object {
    const val ACTION_START = "com.astrowaniVendor.ringingservice.START"
    const val ACTION_STOP = "com.astrowaniVendor.ringingservice.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"

    private const val CHANNEL_ID = "astrowani-ringing-service"
    private const val NOTIFICATION_ID = 4518

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

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelfSafely()
      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Incoming request"
    val body = intent?.getStringExtra(EXTRA_BODY)

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

    handler.removeCallbacks(autoStop)
    handler.postDelayed(autoStop, MAX_RING_MS)

    // Deliberately NOT START_STICKY: if the process dies the request is no longer
    // actionable from here anyway (Accept/Reject need a live JS bridge), so resurrecting
    // this service would just ring forever for a request nobody can act on.
    return START_NOT_STICKY
  }

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

  override fun onDestroy() {
    handler.removeCallbacks(autoStop)
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
