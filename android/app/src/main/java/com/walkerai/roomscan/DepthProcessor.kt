package com.walkerai.roomscan

import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

class DepthProcessor {

    private var floorY: Float? = null
    private var ceilingY: Float? = null
    private val verticalPlanes = mutableListOf<PlaneInfo>()

    data class PlaneInfo(
        val centerX: Float,
        val centerY: Float,
        val centerZ: Float,
        val extentX: Float,
        val extentZ: Float,
        val isVertical: Boolean,
        val normal: FloatArray
    )

    fun processFrame(frame: Frame, session: Session) {
        val planes = session.getAllTrackables(Plane::class.java)

        for (plane in planes) {
            if (plane.trackingState != TrackingState.TRACKING) continue
            if (plane.subsumedBy != null) continue

            val pose = plane.centerPose
            val cx = pose.tx()
            val cy = pose.ty()
            val cz = pose.tz()
            val extentX = plane.extentX
            val extentZ = plane.extentZ

            // Get plane normal from pose rotation
            val normal = floatArrayOf(0f, 1f, 0f)
            pose.rotateVector(normal, 0, normal, 0)

            val isVertical = abs(normal[1]) < 0.3f // Normal mostly horizontal = vertical plane
            val isHorizontal = abs(normal[1]) > 0.7f

            if (isHorizontal) {
                // Classify as floor or ceiling based on height
                if (floorY == null || cy < floorY!!) floorY = cy
                if (ceilingY == null || cy > ceilingY!!) ceilingY = cy
            }

            if (isVertical) {
                // Check if this plane is already tracked (nearby existing)
                val existing = verticalPlanes.indexOfFirst { existing ->
                    val dist = sqrt(
                        (existing.centerX - cx) * (existing.centerX - cx) +
                        (existing.centerZ - cz) * (existing.centerZ - cz)
                    )
                    dist < 0.5f
                }
                val info = PlaneInfo(cx, cy, cz, extentX, extentZ, true, normal)
                if (existing >= 0) {
                    // Update with larger extents
                    val old = verticalPlanes[existing]
                    verticalPlanes[existing] = info.copy(
                        extentX = max(old.extentX, extentX),
                        extentZ = max(old.extentZ, extentZ)
                    )
                } else {
                    verticalPlanes.add(info)
                }
            }
        }
    }

    fun getDetectedWallCount(): Int = verticalPlanes.size

    fun buildResult(): RoomScanResult {
        val roomHeight = if (floorY != null && ceilingY != null) {
            ceilingY!! - floorY!!
        } else {
            2.7f // Default room height
        }

        val walls = verticalPlanes.mapIndexed { i, plane ->
            // Wall width is the larger extent
            val wallWidth = max(plane.extentX, plane.extentZ)

            WallData(
                id = "wall_$i",
                width = wallWidth,
                height = roomHeight,
                center = Vec3(
                    plane.centerX,
                    (floorY ?: 0f) + roomHeight / 2f,
                    plane.centerZ
                )
            )
        }

        // Calculate room dimensions from wall positions
        val roomLength: Float
        val roomWidth: Float

        if (walls.size >= 2) {
            val allX = walls.map { it.center.x }
            val allZ = walls.map { it.center.z }
            val xRange = (allX.maxOrNull() ?: 0f) - (allX.minOrNull() ?: 0f)
            val zRange = (allZ.maxOrNull() ?: 0f) - (allZ.minOrNull() ?: 0f)

            // Add the average wall width to account for wall thickness
            val avgWidth = walls.map { it.width }.average().toFloat()
            roomLength = max(xRange, zRange) + avgWidth
            roomWidth = min(xRange, zRange) + avgWidth
        } else if (walls.size == 1) {
            roomLength = walls[0].width
            roomWidth = walls[0].width * 0.75f // Assume roughly rectangular
        } else {
            roomLength = 0f
            roomWidth = 0f
        }

        return RoomScanResult(
            walls = walls,
            roomDimensions = RoomDimensions(
                length = roomLength,
                width = roomWidth,
                height = roomHeight,
                area = roomLength * roomWidth
            )
        )
    }

    fun reset() {
        floorY = null
        ceilingY = null
        verticalPlanes.clear()
    }
}
