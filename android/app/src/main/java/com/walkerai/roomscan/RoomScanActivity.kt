package com.walkerai.roomscan

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.ar.core.*
import com.google.ar.core.exceptions.*
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

class RoomScanActivity : AppCompatActivity(), GLSurfaceView.Renderer {

    private lateinit var glSurfaceView: GLSurfaceView
    private var session: Session? = null
    private var depthProcessor = DepthProcessor()
    private var planeRenderer = PlaneRenderer()
    private lateinit var statusText: TextView
    private lateinit var wallCountText: TextView

    private val viewMatrix = FloatArray(16)
    private val projectionMatrix = FloatArray(16)

    private val stopReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            finishScan()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
        }

        // GL Surface for camera + AR rendering
        glSurfaceView = GLSurfaceView(this).apply {
            preserveEGLContextOnPause = true
            setEGLContextClientVersion(2)
            setRenderer(this@RoomScanActivity)
            renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        }
        root.addView(glSurfaceView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))

        // Status overlay at top
        statusText = TextView(this).apply {
            text = "Move slowly around the room"
            setTextColor(Color.WHITE)
            textSize = 16f
            setPadding(24, 16, 24, 16)
            setBackgroundColor(Color.argb(150, 0, 0, 0))
            gravity = Gravity.CENTER
        }
        root.addView(statusText, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.CENTER_HORIZONTAL
        ).apply { topMargin = 100 })

        // Wall count indicator
        wallCountText = TextView(this).apply {
            text = "Walls detected: 0"
            setTextColor(Color.argb(200, 255, 107, 0))
            textSize = 14f
            setPadding(24, 8, 24, 8)
            setBackgroundColor(Color.argb(150, 0, 0, 0))
            gravity = Gravity.CENTER
        }
        root.addView(wallCountText, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.CENTER_HORIZONTAL
        ).apply { topMargin = 160 })

        // Bottom button bar
        val buttonBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(32, 24, 32, 48)
            setBackgroundColor(Color.argb(200, 0, 0, 0))
        }

        // Cancel button
        val cancelBtn = TextView(this).apply {
            text = "Cancel"
            setTextColor(Color.WHITE)
            textSize = 17f
            setPadding(48, 24, 48, 24)
            setBackgroundColor(Color.argb(80, 255, 255, 255))
            gravity = Gravity.CENTER
            setOnClickListener { cancelScan() }
        }
        cancelBtn.background?.let {
            val gd = android.graphics.drawable.GradientDrawable()
            gd.setColor(Color.argb(40, 255, 255, 255))
            gd.cornerRadius = 50f
            cancelBtn.background = gd
        } ?: run {
            val gd = android.graphics.drawable.GradientDrawable()
            gd.setColor(Color.argb(40, 255, 255, 255))
            gd.cornerRadius = 50f
            cancelBtn.background = gd
        }

        // Done button
        val doneBtn = TextView(this).apply {
            text = "Done"
            setTextColor(Color.BLACK)
            textSize = 17f
            setPadding(64, 24, 64, 24)
            gravity = Gravity.CENTER
            setOnClickListener { finishScan() }
        }
        val doneBg = android.graphics.drawable.GradientDrawable()
        doneBg.setColor(Color.WHITE)
        doneBg.cornerRadius = 50f
        doneBtn.background = doneBg

        buttonBar.addView(cancelBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginEnd = 16
        })
        buttonBar.addView(doneBtn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

        root.addView(buttonBar, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM
        ))

        setContentView(root)

        registerReceiver(stopReceiver, IntentFilter("com.walkerai.STOP_SCAN"), RECEIVER_NOT_EXPORTED)
    }

    override fun onResume() {
        super.onResume()

        if (session == null) {
            try {
                // Ensure ARCore is installed
                when (ArCoreApk.getInstance().requestInstall(this, true)) {
                    ArCoreApk.InstallStatus.INSTALLED -> {}
                    ArCoreApk.InstallStatus.INSTALL_REQUESTED -> return
                }

                session = Session(this).apply {
                    val config = Config(this).apply {
                        planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
                        if (isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                            depthMode = Config.DepthMode.AUTOMATIC
                        }
                        updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                        lightEstimationMode = Config.LightEstimationMode.AMBIENT_INTENSITY
                    }
                    configure(config)
                }
            } catch (e: UnavailableArcoreNotInstalledException) {
                handleError("ARCore is not installed")
                return
            } catch (e: UnavailableDeviceNotCompatibleException) {
                handleError("This device does not support AR")
                return
            } catch (e: Exception) {
                handleError("Failed to create AR session: ${e.message}")
                return
            }
        }

        try {
            session?.resume()
        } catch (e: CameraNotAvailableException) {
            handleError("Camera not available")
            return
        }

        glSurfaceView.onResume()
    }

    override fun onPause() {
        super.onPause()
        session?.pause()
        glSurfaceView.onPause()
    }

    override fun onDestroy() {
        super.onDestroy()
        try { unregisterReceiver(stopReceiver) } catch (_: Exception) {}
        session?.close()
        session = null
    }

    // MARK: - GLSurfaceView.Renderer

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        planeRenderer.initialize()
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        GLES20.glViewport(0, 0, width, height)
        session?.setDisplayGeometry(windowManager.defaultDisplay.rotation, width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)

        val currentSession = session ?: return

        try {
            val frame = currentSession.update()
            val camera = frame.camera

            if (camera.trackingState != TrackingState.TRACKING) {
                runOnUiThread {
                    statusText.text = "Searching for surfaces..."
                }
                return
            }

            camera.getViewMatrix(viewMatrix, 0)
            camera.getProjectionMatrix(projectionMatrix, 0, 0.1f, 100f)

            // Process depth and planes
            depthProcessor.processFrame(frame, currentSession)

            // Draw plane overlays
            val planes = currentSession.getAllTrackables(Plane::class.java)
            planeRenderer.drawPlanes(planes, viewMatrix, projectionMatrix)

            // Update UI
            val wallCount = depthProcessor.getDetectedWallCount()
            runOnUiThread {
                wallCountText.text = "Walls detected: $wallCount"
                statusText.text = when {
                    wallCount == 0 -> "Point at walls and move slowly"
                    wallCount < 3 -> "Keep scanning — turn to capture more walls"
                    wallCount < 4 -> "Good coverage! Scan remaining walls or tap Done"
                    else -> "Great coverage! Tap Done when ready"
                }
            }
        } catch (_: Exception) {
            // Frame update failed, skip
        }
    }

    // MARK: - Actions

    private fun finishScan() {
        val result = depthProcessor.buildResult()
        RoomScanModule.pendingScanResult = result
        setResult(Activity.RESULT_OK)
        finish()
    }

    private fun cancelScan() {
        depthProcessor.reset()
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    private fun handleError(message: String) {
        RoomScanModule.pendingError = message
        setResult(Activity.RESULT_CANCELED)
        finish()
    }
}
