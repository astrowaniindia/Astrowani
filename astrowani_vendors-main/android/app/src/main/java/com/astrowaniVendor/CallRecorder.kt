package com.astrowaniVendor

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import org.webrtc.audio.JavaAudioDeviceModule
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Records THIS phone's own microphone during a call, as AAC (ADTS) speech audio.
 *
 * WHY THIS SHAPE: calls are peer-to-peer WebRTC, so the server never sees the audio. WebRTC's
 * audio device module hands every captured microphone buffer to a callback; RecordingAudioDeviceModule
 * forwards them here. Each side records only ITS OWN voice and uploads it, so no playback capture,
 * no MediaProjection and no second microphone open (which Android may refuse or silence) is needed.
 *
 * THE MUTE RULE, load-bearing: the callback receives the RAW hardware microphone, before WebRTC
 * applies the app's mute. Without [setMuted] a user who muted themselves would still be recorded.
 * The call screens call setMuted on every mute toggle, and buffers are DROPPED while muted.
 *
 * onSamples runs on WebRTC's audio thread, so it only copies the buffer into a bounded queue; a
 * separate thread encodes and writes. If the queue is full the buffer is dropped rather than
 * blocking audio capture -- a gap in a recording is acceptable, glitching the call is not.
 */
object CallRecorder {
  private const val BITRATE = 32_000
  private const val MAX_BYTES = 40L * 1024 * 1024
  private val ADTS_RATES = intArrayOf(96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350)

  @Volatile private var active: Session? = null
  @Volatile private var muted = false

  /** Called from the audio thread for every captured microphone buffer. */
  fun onSamples(samples: JavaAudioDeviceModule.AudioSamples) {
    val s = active ?: return
    if (muted) return
    s.offer(samples.data.copyOf(), samples.sampleRate, samples.channelCount)
  }

  fun setMuted(value: Boolean) { muted = value }

  fun start(file: File): Boolean {
    stopAndJoin()
    return try {
      file.parentFile?.mkdirs()
      val session = Session(file)
      muted = false
      active = session
      session.begin()
      true
    } catch (e: Throwable) {
      active = null
      false
    }
  }

  /** Finishes the file. Returns (bytes, durationMs) or null if nothing was being recorded. */
  fun stop(): Pair<Long, Long>? = stopAndJoin()

  private fun stopAndJoin(): Pair<Long, Long>? {
    val s = active ?: return null
    active = null
    return s.finish()
  }

  private class Session(val file: File) {
    private val queue = ArrayBlockingQueue<Chunk>(600) // ~6 s of 10 ms buffers
    private val startedAt = System.currentTimeMillis()
    private var thread: Thread? = null
    @Volatile private var done = false
    @Volatile private var bytesWritten = 0L

    private class Chunk(val data: ByteArray, val rate: Int, val channels: Int)

    fun begin() {
      val t = Thread({ run() }, "call-recorder")
      thread = t
      t.start()
    }

    fun offer(data: ByteArray, rate: Int, channels: Int) {
      if (done) return
      queue.offer(Chunk(data, rate, channels)) // full -> dropped
    }

    fun finish(): Pair<Long, Long> {
      done = true
      try { thread?.join(6000) } catch (_: InterruptedException) {}
      return Pair(bytesWritten, System.currentTimeMillis() - startedAt)
    }

    private fun run() {
      var codec: MediaCodec? = null
      var out: FileOutputStream? = null
      var rate = 0
      var channels = 1
      val info = MediaCodec.BufferInfo()
      var ptsUs = 0L
      try {
        out = FileOutputStream(file)
        while (true) {
          val chunk = queue.poll(200, TimeUnit.MILLISECONDS)
          if (chunk == null) {
            if (done) break
            continue
          }
          if (codec == null) {
            rate = chunk.rate
            channels = chunk.channels
            val fmt = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, rate, channels).apply {
              setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
              setInteger(MediaFormat.KEY_BIT_RATE, BITRATE)
              setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384)
            }
            codec = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC)
            codec.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()
          }
          if (bytesWritten < MAX_BYTES) {
            feed(codec, chunk.data, ptsUs)
            ptsUs += chunk.data.size * 1_000_000L / (2L * rate * channels)
            drain(codec, out, info, rate, channels, false)
          }
        }
        if (codec != null) {
          val idx = codec.dequeueInputBuffer(20_000)
          if (idx >= 0) codec.queueInputBuffer(idx, 0, 0, ptsUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
          drain(codec, out, info, rate, channels, true)
        }
      } catch (_: Throwable) {
        // A recording failure must never affect the call; the file just ends early.
      } finally {
        try { codec?.stop() } catch (_: Throwable) {}
        try { codec?.release() } catch (_: Throwable) {}
        try { out?.flush(); out?.close() } catch (_: Throwable) {}
      }
    }

    private fun feed(codec: MediaCodec, data: ByteArray, ptsUs: Long) {
      var offset = 0
      while (offset < data.size) {
        val idx = codec.dequeueInputBuffer(10_000)
        if (idx < 0) return
        val buf = codec.getInputBuffer(idx) ?: return
        buf.clear()
        val n = minOf(buf.remaining(), data.size - offset)
        buf.put(data, offset, n)
        codec.queueInputBuffer(idx, 0, n, ptsUs, 0)
        offset += n
      }
    }

    private fun drain(codec: MediaCodec, out: FileOutputStream, info: MediaCodec.BufferInfo, rate: Int, channels: Int, untilEos: Boolean) {
      var tries = 0
      while (true) {
        val idx = codec.dequeueOutputBuffer(info, if (untilEos) 20_000 else 0)
        if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) {
          // Live: nothing more ready right now. Final drain: wait a bounded time for EOS.
          if (!untilEos || ++tries > 50) return
          continue
        }
        if (idx < 0) continue // format / buffers-changed notifications
        val buf = codec.getOutputBuffer(idx)
        if (buf != null && info.size > 0 && (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
          buf.position(info.offset)
          buf.limit(info.offset + info.size)
          val frame = ByteArray(info.size)
          buf.get(frame)
          out.write(adtsHeader(info.size + 7, rate, channels))
          out.write(frame)
          bytesWritten += info.size + 7
        }
        codec.releaseOutputBuffer(idx, false)
        if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return
      }
    }

    private fun adtsHeader(frameLen: Int, rate: Int, channels: Int): ByteArray {
      val freqIdx = ADTS_RATES.indexOf(rate).let { if (it < 0) 3 else it }
      val h = ByteArray(7)
      h[0] = 0xFF.toByte()
      h[1] = 0xF1.toByte()
      h[2] = (((2 - 1) shl 6) or (freqIdx shl 2) or (channels shr 2)).toByte()
      h[3] = (((channels and 3) shl 6) or (frameLen shr 11)).toByte()
      h[4] = ((frameLen and 0x7FF) shr 3).toByte()
      h[5] = (((frameLen and 7) shl 5) or 0x1F).toByte()
      h[6] = 0xFC.toByte()
      return h
    }
  }
}
