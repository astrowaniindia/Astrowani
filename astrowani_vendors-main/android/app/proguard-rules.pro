# Astrowani VENDOR app — R8 / ProGuard keep rules.
#
# WHY THIS FILE HAS CONTENT NOW (2026-08-19). R8 was disabled
# (enableProguardInReleaseBuilds = false) and this file was empty, which is what
# Play Console's "Your app is not optimized" recommendation refers to. Enabling
# R8 on a React Native app with this many reflective native SDKs is the risky
# part: R8 renames and removes classes that are only ever reached by reflection
# or from JNI, and those failures do NOT appear at build time — the build
# succeeds and the app crashes at runtime, in the release variant only.
#
# So these rules are deliberately CONSERVATIVE. They keep more than a
# maximally-tuned config would. The size and performance win still comes from
# dead-code removal across the dependency graph; squeezing the last few percent
# is not worth a production crash. If APK size ever needs to shrink further,
# tighten these one library at a time with a device test after each.
#
# NOTE: most modern AARs ship their own consumer-proguard-rules.pro, which R8
# applies automatically — React Native core included. The rules below cover the
# libraries where that is absent, incomplete, or historically unreliable.

# ─────────────────────────────────────────────────────────────────────────────
# Generic safety — reflection, JNI, serialization
# ─────────────────────────────────────────────────────────────────────────────
# Anything called from native code must keep its exact name.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}
# Enum valueOf/values are looked up reflectively by many libraries.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
# Keep annotations and generic signatures — libraries inspect both at runtime.
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
# Keep line numbers so a release stack trace is still readable. Sentry needs
# SourceFile/LineNumberTable; renaming SourceFile hides the original name.
-keepattributes SourceFile, LineNumberTable
-renamesourcefileattribute SourceFile

# ─────────────────────────────────────────────────────────────────────────────
# React Native bridge surface
# RN ships consumer rules, but the annotation-driven keeps below are the ones
# that break silently (a stripped @ReactProp setter just stops applying).
# ─────────────────────────────────────────────────────────────────────────────
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
    void set*(***);
    *** get*();
}
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp <methods>;
    @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>;
}
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.uimanager.ViewManager { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.react.**

# ─────────────────────────────────────────────────────────────────────────────
# Payments — Razorpay. Its checkout activity and callbacks are reflective, and a
# broken payment flow is the single most expensive thing R8 could break here.
# ─────────────────────────────────────────────────────────────────────────────
-keep class com.razorpay.** { *; }
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-dontwarn com.razorpay.**
-optimizations !method/inlining/*

# ─────────────────────────────────────────────────────────────────────────────
# Realtime calling — WebRTC is JNI-heavy end to end.
# ─────────────────────────────────────────────────────────────────────────────
-keep class org.webrtc.** { *; }
-keep class com.oney.WebRTCModule.** { *; }
-dontwarn org.webrtc.**

# ─────────────────────────────────────────────────────────────────────────────
# Crash reporting + analytics
# ─────────────────────────────────────────────────────────────────────────────
-keep class io.sentry.** { *; }
-dontwarn io.sentry.**
-keep class com.posthog.** { *; }
-dontwarn com.posthog.**

# ─────────────────────────────────────────────────────────────────────────────
# Firebase / Google Play services — messaging is what delivers call pushes.
# ─────────────────────────────────────────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
-keep class io.invertase.firebase.** { *; }
-dontwarn io.invertase.firebase.**

# Local + remote notifications
-keep class com.dieam.reactnativepushnotification.** { *; }
-dontwarn com.dieam.reactnativepushnotification.**

# ─────────────────────────────────────────────────────────────────────────────
# Networking — OkHttp/Okio back RN's fetch and most SDKs. These are the standard
# published rules; without the -dontwarn pair the build fails on optional deps.
# ─────────────────────────────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ─────────────────────────────────────────────────────────────────────────────
# Images — react-native-fast-image is backed by Glide, which generates and finds
# its AppGlideModule reflectively.
# ─────────────────────────────────────────────────────────────────────────────
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep class * extends com.bumptech.glide.module.AppGlideModule { <init>(...); }
-keep public enum com.bumptech.glide.load.ImageHeaderParser$** { **[] $VALUES; public *; }
-dontwarn com.bumptech.glide.**

# ─────────────────────────────────────────────────────────────────────────────
# Remaining RN native modules that are loaded by name from JS.
# ─────────────────────────────────────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.horcrux.svg.** { *; }
-keep class com.reactnativecommunity.webview.** { *; }
-keep class com.zoontek.rnpermissions.** { *; }
-keep class com.imagepicker.** { *; }
-keep class com.learnium.RNDeviceInfo.** { *; }
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class com.oblador.vectoricons.** { *; }
-keep class com.zmxv.RNSound.** { *; }
-keep class com.reactlibrary.** { *; }
-keep class com.hotupdater.** { *; }
-dontwarn com.hotupdater.**

# ─────────────────────────────────────────────────────────────────────────────
# Vendor-only modules
# ─────────────────────────────────────────────────────────────────────────────
# Pre-existing rule, retained: zego was kept before R8 was ever switched on.
-keep class **.zego.**  { *; }

-keep class io.invertase.notifee.** { *; }
-keep class app.notifee.** { *; }
-dontwarn app.notifee.**

# Audio recording (voice notes) + filesystem + image cropping
-keep class com.dooboolab.** { *; }
-keep class com.rnfs.** { *; }
-keep class com.reactnative.ivpusic.imagepicker.** { *; }
-dontwarn com.reactnative.ivpusic.imagepicker.**

# OTPLESS: dead code (nothing imports startOtpVerification.js) but the native SDK
# is still compiled into the APK via the otpless-react-native dependency, so its
# classes must survive R8 or the app can fail to initialise.
-keep class com.otpless.** { *; }
-dontwarn com.otpless.**

-keep class com.BV.LinearGradient.** { *; }
