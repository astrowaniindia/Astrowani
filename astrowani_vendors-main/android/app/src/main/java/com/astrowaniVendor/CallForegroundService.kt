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
import android.os.IBinder
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

    private const val CHANNEL_ID = "astrowani-ongoing-call"
    private const val NOTIFICATION_ID = 4517
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopSelfSafely()
      return START_NOT_STICKY
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Call in progress"
    val body = intent?.getStringExtra(EXTRA_BODY) ?: "Tap to return to your call"

    createChannel()

    // startForeground MUST happen within ~5s of startForegroundService or Android
    // kills the process, so it is the first thing done here.
    val notification = buildNotification(title, body)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      // Pre-Q has no typed foreground services, and pre-Android 11 does not gag a
      // backgrounded app's microphone either, so the plain call is correct there.
      startForeground(NOTIFICATION_ID, notification)
    }

    // Deliberately NOT START_STICKY: if the process dies the call is over, and
    // resurrecting a service for a call that no longer exists would leave an
    // undismissable notification with no way to end it.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    super.onDestroy()
    stopForegroundCompat()
  }

  // If the app is swiped away, tear the notification down rather than leaving an
  // orphan pinned to a call that can no longer be running.
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
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()
  }
}
