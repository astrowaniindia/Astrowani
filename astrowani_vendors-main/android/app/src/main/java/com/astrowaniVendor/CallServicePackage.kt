package com.astrowaniVendor

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * Registers CallServiceModule. Not autolinkable — it lives in the app itself rather
 * than in a node_module — so MainApplication.getPackages() adds it explicitly.
 */
class CallServicePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(CallServiceModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<out View, out ReactShadowNode<*>>> = emptyList()
}
