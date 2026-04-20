package com.walkerai.roomscan

import android.opengl.GLES20
import android.opengl.Matrix
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.TrackingState
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.abs

class PlaneRenderer {

    private var program: Int = 0
    private var positionHandle: Int = 0
    private var colorHandle: Int = 0
    private var mvpMatrixHandle: Int = 0
    private var initialized = false

    private val vertexShaderCode = """
        uniform mat4 uMVPMatrix;
        attribute vec4 vPosition;
        void main() {
            gl_Position = uMVPMatrix * vPosition;
        }
    """.trimIndent()

    private val fragmentShaderCode = """
        precision mediump float;
        uniform vec4 vColor;
        void main() {
            gl_FragColor = vColor;
        }
    """.trimIndent()

    fun initialize() {
        if (initialized) return

        val vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexShaderCode)
        val fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentShaderCode)

        program = GLES20.glCreateProgram().also {
            GLES20.glAttachShader(it, vertexShader)
            GLES20.glAttachShader(it, fragmentShader)
            GLES20.glLinkProgram(it)
        }

        positionHandle = GLES20.glGetAttribLocation(program, "vPosition")
        colorHandle = GLES20.glGetUniformLocation(program, "vColor")
        mvpMatrixHandle = GLES20.glGetUniformLocation(program, "uMVPMatrix")

        initialized = true
    }

    fun drawPlanes(
        planes: Collection<Plane>,
        viewMatrix: FloatArray,
        projectionMatrix: FloatArray
    ) {
        if (!initialized) return

        GLES20.glUseProgram(program)
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)

        for (plane in planes) {
            if (plane.trackingState != TrackingState.TRACKING) continue
            if (plane.subsumedBy != null) continue

            val pose = plane.centerPose
            val normal = floatArrayOf(0f, 1f, 0f)
            pose.rotateVector(normal, 0, normal, 0)
            val isVertical = abs(normal[1]) < 0.3f

            // Color: white for vertical (walls), gray for horizontal (floor/ceiling)
            val color = if (isVertical) {
                floatArrayOf(1f, 1f, 1f, 0.15f)
            } else {
                floatArrayOf(0.5f, 0.5f, 0.5f, 0.1f)
            }

            drawPlaneOutline(plane, viewMatrix, projectionMatrix, color)
        }

        GLES20.glDisable(GLES20.GL_BLEND)
    }

    private fun drawPlaneOutline(
        plane: Plane,
        viewMatrix: FloatArray,
        projectionMatrix: FloatArray,
        color: FloatArray
    ) {
        val polygon = plane.polygon ?: return
        if (polygon.remaining() < 6) return // Need at least 3 vertices

        val pose = plane.centerPose
        val modelMatrix = FloatArray(16)
        pose.toMatrix(modelMatrix, 0)

        val mvpMatrix = FloatArray(16)
        val mvMatrix = FloatArray(16)
        Matrix.multiplyMM(mvMatrix, 0, viewMatrix, 0, modelMatrix, 0)
        Matrix.multiplyMM(mvpMatrix, 0, projectionMatrix, 0, mvMatrix, 0)

        // Build line vertices from polygon boundary
        val vertexCount = polygon.remaining() / 2
        val vertices = FloatArray(vertexCount * 3)
        for (i in 0 until vertexCount) {
            vertices[i * 3] = polygon.get(i * 2)
            vertices[i * 3 + 1] = 0f
            vertices[i * 3 + 2] = polygon.get(i * 2 + 1)
        }

        val vertexBuffer: FloatBuffer = ByteBuffer
            .allocateDirect(vertices.size * 4)
            .order(ByteOrder.nativeOrder())
            .asFloatBuffer()
            .put(vertices)
        vertexBuffer.position(0)

        GLES20.glUniformMatrix4fv(mvpMatrixHandle, 1, false, mvpMatrix, 0)
        GLES20.glUniform4fv(colorHandle, 1, color, 0)
        GLES20.glEnableVertexAttribArray(positionHandle)
        GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, 12, vertexBuffer)
        GLES20.glLineWidth(3f)
        GLES20.glDrawArrays(GLES20.GL_LINE_LOOP, 0, vertexCount)
        GLES20.glDisableVertexAttribArray(positionHandle)
    }

    private fun loadShader(type: Int, shaderCode: String): Int {
        return GLES20.glCreateShader(type).also { shader ->
            GLES20.glShaderSource(shader, shaderCode)
            GLES20.glCompileShader(shader)
        }
    }
}
