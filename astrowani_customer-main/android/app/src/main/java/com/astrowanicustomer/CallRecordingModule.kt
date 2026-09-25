package com.astrowanicustomer

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * JS bridge for CallRecorder. Legacy (non-TurboModule) module: newArchEnabled=false.
 *
 * Every method RESOLVES rather than rejecting -- recording is an audit aid and must never break
 * a call by throwing into a call screen.
 */
class CallRecordingModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "CallRecording"

  private fun dir(): File = File(reactContext.cacheDir, "call_recordings")

  @ReactMethod
  fun start(sessionId: String, promise: Promise) {
    try {
      // Leftovers from calls that crashed before upload; never let them pile up.
      dir().listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 24L * 3600 * 1000 }?.forEach { it.delete() }
      val safe = sessionId.replace(Regex("[^A-Za-z0-9_-]"), "_")
      val file = File(dir(), "$safe-${System.currentTimeMillis()}.aac")
      lastFile = file
      promise.resolve(CallRecorder.start(file))
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun setMuted(muted: Boolean, promise: Promise) {
    CallRecorder.setMuted(muted)
    promise.resolve(true)
  }

  /** Resolves { path, bytes, durationMs } or null when nothing was recording. */
  @ReactMethod
  fun stop(promise: Promise) {
    // The encoder drains on its own thread; do not block the JS bridge thread while it does.
    Thread {
      try {
        val r = CallRecorder.stop()
        val f = lastFile
        if (r == null || f == null || !f.exists() || r.first <= 0) {
          f?.delete()
          promise.resolve(null)
        } else {
          val map = Arguments.createMap()
          map.putString("path", f.absolutePath)
          map.putDouble("bytes", r.first.toDouble())
          map.putDouble("durationMs", r.second.toDouble())
          promise.resolve(map)
        }
      } catch (e: Throwable) {
        promise.resolve(null)
      }
    }.start()
  }

  @ReactMethod
  fun deleteFile(path: String, promise: Promise) {
    try {
      // Only ever inside our own recordings folder.
      val f = File(path)
      if (f.canonicalPath.startsWith(dir().canonicalPath)) f.delete()
      promise.resolve(true)
    } catch (e: Throwable) {
      promise.resolve(false)
    }
  }

  companion object {
    @Volatile private var lastFile: File? = null
  }
}
