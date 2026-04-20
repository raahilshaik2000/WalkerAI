package com.walkerai.roomscan

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

data class Vec3(val x: Float, val y: Float, val z: Float) {
    fun toWritableMap(): WritableMap = Arguments.createMap().apply {
        putDouble("x", x.toDouble())
        putDouble("y", y.toDouble())
        putDouble("z", z.toDouble())
    }
}

data class WallData(
    val id: String,
    val width: Float,
    val height: Float,
    val center: Vec3
) {
    fun toWritableMap(): WritableMap = Arguments.createMap().apply {
        putString("id", id)
        putDouble("width", width.toDouble())
        putDouble("height", height.toDouble())
        putMap("center", center.toWritableMap())
    }
}

data class RoomDimensions(
    val length: Float,
    val width: Float,
    val height: Float,
    val area: Float
) {
    fun toWritableMap(): WritableMap = Arguments.createMap().apply {
        putDouble("length", length.toDouble())
        putDouble("width", width.toDouble())
        putDouble("height", height.toDouble())
        putDouble("area", area.toDouble())
    }
}

data class RoomScanResult(
    val walls: List<WallData>,
    val roomDimensions: RoomDimensions
) {
    fun toWritableMap(): WritableMap = Arguments.createMap().apply {
        val wallsArray = Arguments.createArray()
        walls.forEach { wallsArray.pushMap(it.toWritableMap()) }
        putArray("walls", wallsArray)

        // Empty arrays for doors/windows/objects (Android v1 doesn't detect these)
        putArray("doors", Arguments.createArray())
        putArray("windows", Arguments.createArray())
        putArray("objects", Arguments.createArray())

        putMap("roomDimensions", roomDimensions.toWritableMap())
        putNull("usdzFilePath")
        putBoolean("isMock", false)
    }
}
