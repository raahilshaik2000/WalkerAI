package com.walkerai.roomscan

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Session

class RoomScanModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    companion object {
        const val NAME = "RoomScanModule"
        const val REQUEST_CODE_SCAN = 9001
        const val RESULT_SCAN_DATA = "scan_data"
        const val RESULT_ERROR = "scan_error"
        const val RESULT_CANCELLED = "scan_cancelled"

        // Singleton to pass data between Activity and Module
        var pendingScanResult: RoomScanResult? = null
        var pendingError: String? = null
    }

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = NAME

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun checkDeviceSupport(promise: Promise) {
        try {
            val availability = ArCoreApk.getInstance().checkAvailability(reactContext)

            if (availability.isTransient) {
                // Re-check — availability is still being determined
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("supported", false)
                    putString("reason", "Checking AR availability. Please try again.")
                })
                return
            }

            if (!availability.isSupported) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("supported", false)
                    putString("reason", "This device does not support ARCore. Room scanning requires a compatible Android device.")
                })
                return
            }

            // Check if Depth API is available
            try {
                val session = Session(reactContext)
                val depthSupported = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
                session.close()

                if (!depthSupported) {
                    promise.resolve(Arguments.createMap().apply {
                        putBoolean("supported", false)
                        putString("reason", "This device supports AR but not depth scanning. Room measurement requires depth sensor support.")
                    })
                    return
                }

                promise.resolve(Arguments.createMap().apply {
                    putBoolean("supported", true)
                })
            } catch (e: Exception) {
                promise.resolve(Arguments.createMap().apply {
                    putBoolean("supported", false)
                    putString("reason", "Could not initialize AR session: ${e.message}")
                })
            }
        } catch (e: Exception) {
            promise.resolve(Arguments.createMap().apply {
                putBoolean("supported", false)
                putString("reason", "AR check failed: ${e.message}")
            })
        }
    }

    @ReactMethod
    fun startScan(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity")
            return
        }

        try {
            val intent = Intent(activity, RoomScanActivity::class.java)
            activity.startActivityForResult(intent, REQUEST_CODE_SCAN)
            promise.resolve(Arguments.createMap().apply {
                putString("status", "scanning")
            })
        } catch (e: Exception) {
            promise.reject("LAUNCH_FAILED", "Failed to start scan: ${e.message}")
        }
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        // Send broadcast to stop the scan activity
        val intent = Intent("com.walkerai.STOP_SCAN")
        reactContext.sendBroadcast(intent)
        promise.resolve(Arguments.createMap().apply {
            putString("status", "stopped")
        })
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    override fun onActivityResult(activity: Activity?, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE_SCAN) return

        when (resultCode) {
            Activity.RESULT_OK -> {
                val result = pendingScanResult
                if (result != null) {
                    sendEvent("onScanCompleted", result.toWritableMap())
                    pendingScanResult = null
                } else {
                    sendEvent("onScanError", Arguments.createMap().apply {
                        putString("error", "No scan data received")
                    })
                }
            }
            Activity.RESULT_CANCELED -> {
                val error = pendingError
                if (error != null) {
                    sendEvent("onScanError", Arguments.createMap().apply {
                        putString("error", error)
                    })
                    pendingError = null
                } else {
                    sendEvent("onScanCancelled", null)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent?) {}
}
