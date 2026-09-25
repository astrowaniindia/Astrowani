package com.astrowanicustomer

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import com.hotupdater.HotUpdater
import com.oney.WebRTCModule.WebRTCModuleOptions

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
              // Lives in this app rather than a node_module, so autolinking cannot see it.
              // Keeps the mic alive while backgrounded during a call — see
              // CallForegroundService.kt.
              add(CallServicePackage())
              // Records this phone's own microphone during a call, for the admin's contact-detail
              // audit. Dormant unless an admin enables it. See CallRecorder.kt.
              add(CallRecordingPackage())
              // Reads which QR poster / ad this install came from, for the admin's
              // offline-QR attribution. See InstallReferrerModule.kt.
              add(InstallReferrerPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        // OTA: serve the latest downloaded bundle if hot-updater has one, else fall back to
        // the bundle baked into the APK. See MD files/deployment-and-releases.md.
        override fun getJSBundleFile(): String? = HotUpdater.getJSBundleFile(applicationContext)

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)
    // Same audio device module react-native-webrtc would build, plus a microphone tap for call
    // recording. Must be set before the WebRTC native module is constructed.
    WebRTCModuleOptions.getInstance().audioDeviceModule = RecordingAudioDeviceModule(this)
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
  }
}
