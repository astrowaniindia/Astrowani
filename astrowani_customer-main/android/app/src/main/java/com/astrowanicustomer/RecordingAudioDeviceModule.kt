package com.astrowanicustomer

import android.content.Context
import org.webrtc.audio.AudioDeviceModule
import org.webrtc.audio.JavaAudioDeviceModule

/**
 * The audio device module react-native-webrtc is told to use (WebRTCModuleOptions), identical to
 * its own default except that captured microphone buffers are also handed to [CallRecorder].
 *
 * It builds a FRESH JavaAudioDeviceModule every time WebRTC asks for one. react-native-webrtc
 * releases the module it is given right after building its PeerConnectionFactory, and it builds
 * that factory again whenever the JS context is recreated (a hot-update reload). Handing it one
 * long-lived JavaAudioDeviceModule would give the second construction an already-released
 * object; a per-request fresh one cannot.
 */
class RecordingAudioDeviceModule(private val context: Context) : AudioDeviceModule {
  @Volatile private var delegate: JavaAudioDeviceModule? = null

  private fun fresh(): JavaAudioDeviceModule =
    JavaAudioDeviceModule.builder(context)
      .setEnableVolumeLogger(false)
      .setSamplesReadyCallback { samples -> CallRecorder.onSamples(samples) }
      .createAudioDeviceModule()
      .also { delegate = it }

  override fun getNativeAudioDeviceModulePointer(): Long = fresh().nativeAudioDeviceModulePointer

  override fun release() {
    delegate?.release()
    delegate = null
  }

  override fun setSpeakerMute(mute: Boolean) { delegate?.setSpeakerMute(mute) }

  override fun setMicrophoneMute(mute: Boolean) { delegate?.setMicrophoneMute(mute) }
}
