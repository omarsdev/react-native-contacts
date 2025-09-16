package com.contactsupdated

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.turbomodule.core.interfaces.TurboModule

abstract class NativeContactsLastUpdatedSpec(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), TurboModule {
  abstract fun hasPermission(promise: Promise)
  abstract fun requestPermission(promise: Promise)
  abstract fun getContactsSortedByLastUpdated(options: ReadableMap?, promise: Promise)
}
