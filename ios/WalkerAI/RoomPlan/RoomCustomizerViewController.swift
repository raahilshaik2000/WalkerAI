import UIKit
import SceneKit
import React
import simd

private let SURFACE_NAME_PREFIX = "wai_surface_"

private func surfaceIdFromNodeName(_ name: String?) -> String? {
  guard let name = name, name.hasPrefix(SURFACE_NAME_PREFIX) else { return nil }
  return String(name.dropFirst(SURFACE_NAME_PREFIX.count))
}

/// Normalized room footprint from scanned walls so the floor plane aligns with wall geometry.
private struct RoomLayout {
  let length: Double
  let width: Double
  let height: Double
  let offsetX: Double
  let offsetY: Double
  let offsetZ: Double
  let lookAtY: Double

  static func from(json: [String: Any]) -> RoomLayout {
    let dims = (json["roomDimensions"] as? [String: Double]) ?? [:]
    let walls = (json["walls"] as? [[String: Any]]) ?? []
    let fallbackLength = dims["length"] ?? 4.0
    let fallbackWidth = dims["width"] ?? 3.0
    let fallbackHeight = dims["height"] ?? 2.7

    guard !walls.isEmpty else {
      return RoomLayout(
        length: fallbackLength,
        width: fallbackWidth,
        height: fallbackHeight,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        lookAtY: fallbackHeight * 0.4
      )
    }

    var minX = Double.infinity
    var maxX = -Double.infinity
    var minZ = Double.infinity
    var maxZ = -Double.infinity
    var minFloorY = Double.infinity
    var maxWallTop = -Double.infinity

    for wall in walls {
      guard let w = wall["width"] as? Double,
            let h = wall["height"] as? Double,
            let center = wall["center"] as? [String: Double],
            let cx = center["x"], let cy = center["y"], let cz = center["z"] else {
        continue
      }
      let angle = wall["angle"] as? Double ?? 0
      let halfX = abs(cos(angle)) * w / 2
      let halfZ = abs(sin(angle)) * w / 2

      minX = min(minX, cx - halfX)
      maxX = max(maxX, cx + halfX)
      minZ = min(minZ, cz - halfZ)
      maxZ = max(maxZ, cz + halfZ)
      minFloorY = min(minFloorY, cy - h / 2)
      maxWallTop = max(maxWallTop, cy + h / 2)
    }

    let hasBounds = minX.isFinite && maxX.isFinite && minZ.isFinite && maxZ.isFinite
    let length = hasBounds ? max(0.5, maxX - minX) : fallbackLength
    let width = hasBounds ? max(0.5, maxZ - minZ) : fallbackWidth
    let height = maxWallTop.isFinite && minFloorY.isFinite
      ? max(2.0, maxWallTop - minFloorY)
      : fallbackHeight
    let centerX = hasBounds ? (minX + maxX) / 2 : 0
    let centerZ = hasBounds ? (minZ + maxZ) / 2 : 0
    let floorY = minFloorY.isFinite ? minFloorY : 0

    return RoomLayout(
      length: length,
      width: width,
      height: height,
      offsetX: -centerX,
      offsetY: -floorY,
      offsetZ: -centerZ,
      lookAtY: height * 0.4
    )
  }
}

// MARK: - Texture Pattern Hints (derived from material name on the JS side)

private enum TexturePattern {
  case flat
  case granite       // dense speckle, multi-tone
  case marble        // soft veining
  case quartz        // fine speckle on cleaner base
  case wood          // horizontal grain stripes
  case tile          // grid lines for tile surfaces
  case mosaic        // small dense grid
  case terrazzo      // multi-color chips
  case stone         // larger irregular speckle
  case metal         // brushed lines for fixtures
}

private func patternForMaterialName(_ name: String) -> TexturePattern {
  let m = name.lowercased()
  if m.contains("granite") { return .granite }
  if m.contains("marble") || m.contains("quartzite") { return .marble }
  if m.contains("quartz") || m.contains("porcelain slab") { return .quartz }
  if m.contains("terrazzo") { return .terrazzo }
  if m.contains("stone") || m.contains("travertine") { return .stone }
  if m.contains("hardwood") || m.contains("oak") || m.contains("walnut")
      || m.contains("maple") || m.contains("vinyl plank") || m.contains("engineered") {
    return .wood
  }
  if m.contains("mosaic") || m.contains("zellige") { return .mosaic }
  if m.contains("tile") || m.contains("subway") { return .tile }
  if m.contains("chrome") || m.contains("nickel") || m.contains("brass") || m.contains("matte black") {
    return .metal
  }
  return .flat
}

class RoomCustomizerViewController: UIViewController {

  private var sceneView: SCNView!
  private var measurementData: String?
  private var roomTypeRaw: String?
  // Surfaces with multiple physical pieces (e.g. each wall in the room is its
  // own node but they all share the "walls" surface id) need to be stored as
  // an array so setSurfaceMaterial can update every one of them.
  private var surfaceNodes: [String: [SCNNode]] = [:]
  private var textureCache: [String: UIImage] = [:]
  private var contentNode: SCNNode?
  private var cameraNode: SCNNode?
  private var initialCameraTransform: SCNMatrix4?
  private var roomLayout: RoomLayout?
  /// True when the live SceneKit scene is the RoomPlan USDZ mesh (not box fallback).
  private var usesCapturedMesh = false

  weak var bridgeView: RoomCustomizerView?

  init(measurementData: String?, roomType: String?) {
    self.measurementData = measurementData
    self.roomTypeRaw = roomType
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(white: 0.06, alpha: 1.0)
    setupSceneView()
    buildScene()
    setupTapRecognizer()
  }

  // MARK: - Setup

  private func setupSceneView() {
    sceneView = SCNView(frame: view.bounds)
    sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    sceneView.backgroundColor = UIColor(red: 0.09, green: 0.10, blue: 0.12, alpha: 1.0)
    sceneView.allowsCameraControl = true
    sceneView.autoenablesDefaultLighting = false
    sceneView.antialiasingMode = .multisampling4X
    sceneView.preferredFramesPerSecond = 60
    sceneView.isPlaying = true
    view.addSubview(sceneView)
  }

  private func setupTapRecognizer() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    tap.cancelsTouchesInView = false

    let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
    doubleTap.numberOfTapsRequired = 2
    doubleTap.cancelsTouchesInView = false
    tap.require(toFail: doubleTap)

    sceneView.addGestureRecognizer(doubleTap)
    sceneView.addGestureRecognizer(tap)
  }

  // MARK: - Scene Building

  private func buildScene() {
    surfaceNodes.removeAll()
    usesCapturedMesh = false
    contentNode = nil

    guard let jsonStr = measurementData,
          let data = jsonStr.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      let scene = SCNScene()
      scene.background.contents = roomBackdropColor()
      sceneView.scene = scene
      addPlaceholderLabel()
      return
    }

    let layout = RoomLayout.from(json: json)
    roomLayout = layout
    let isBathroom = (roomTypeRaw ?? "").lowercased() == "bathroom"

    if let usdzPath = json["usdzFilePath"] as? String,
       !usdzPath.isEmpty,
       FileManager.default.fileExists(atPath: usdzPath),
       let usdzScene = loadUSDZScene(path: usdzPath) {
      NSLog("[RoomCustomizer] Loading RoomPlan USDZ mesh: \(usdzPath)")
      usdzScene.background.contents = roomBackdropColor()
      sceneView.scene = usdzScene
      usesCapturedMesh = true
      contentNode = usdzScene.rootNode

      let placed = classifyAndRegisterCapturedMesh(
        meshRoot: usdzScene.rootNode,
        json: json,
        layout: layout,
        isBathroom: isBathroom
      )

      // Do NOT inject kitchen/bath box furniture onto a live RoomPlan mesh —
      // those placeholders sit in the wrong coords and make the 3D look broken.
      polishCapturedMeshAppearance(root: usdzScene.rootNode)

      // Recenter mesh so the room sits near the origin (stable camera + lighting).
      // Classification already ran in RoomPlan coordinates before this shift.
      centerCapturedMesh(usdzScene.rootNode)
      _ = placed

      setupCamera(for: usdzScene, layout: layout)
      setupLighting(for: usdzScene, lookAtY: Float(layout.lookAtY))
      return
    }

    let missingPath = (json["usdzFilePath"] as? String) ?? ""
    if missingPath.isEmpty {
      NSLog("[RoomCustomizer] No usdzFilePath in scan data — using box fallback")
    } else if !FileManager.default.fileExists(atPath: missingPath) {
      NSLog("[RoomCustomizer] USDZ missing on disk (\(missingPath)) — using box fallback. Rescan room.")
    } else {
      NSLog("[RoomCustomizer] USDZ failed to load — using box fallback")
    }

    // Fallback: measurement boxes when USDZ is missing (mock / AR measure / failed export).
    let scene = SCNScene()
    scene.background.contents = roomBackdropColor()
    sceneView.scene = scene

    let content = SCNNode()
    content.name = "wai_room_content"
    scene.rootNode.addChildNode(content)
    contentNode = content

    addFloor(to: content, length: layout.length, width: layout.width)

    let walls = (json["walls"] as? [[String: Any]]) ?? []
    addWalls(walls, to: content, layout: layout)

    let doors = (json["doors"] as? [[String: Any]]) ?? []
    let windows = (json["windows"] as? [[String: Any]]) ?? []
    addOpenings(doors: doors, windows: windows, to: content, layout: layout)

    let objects = (json["objects"] as? [[String: Any]]) ?? []
    let placed = addScannedObjects(objects, to: content, layout: layout, isBathroom: isBathroom)

    if isBathroom {
      if !placed.contains("vanity") || !placed.contains("vanity_counter") || !placed.contains("shower_tile") {
        addBathroomFurniture(
          to: content,
          length: layout.length,
          width: layout.width,
          height: layout.height,
          skipSurfaces: placed
        )
      } else if !placed.contains("floor_tile") {
        addBathroomFloorTile(to: content, length: layout.length, width: layout.width)
      }
    } else {
      addKitchenFurniture(
        to: content,
        length: layout.length,
        width: layout.width,
        height: layout.height,
        skipSurfaces: placed
      )
    }

    setupCamera(for: scene, layout: layout)
    setupLighting(for: scene, lookAtY: Float(layout.lookAtY))
  }

  private func loadUSDZScene(path: String) -> SCNScene? {
    let url = URL(fileURLWithPath: path)
    do {
      return try SCNScene(url: url, options: [
        .checkConsistency: true,
      ])
    } catch {
      NSLog("[RoomCustomizer] USDZ load failed: \(error.localizedDescription)")
      return nil
    }
  }

  private struct MeshCandidate {
    let node: SCNNode
    let center: SIMD3<Float>
    let extent: SIMD3<Float>
    var xzArea: Float { extent.x * extent.z }
    var volume: Float { max(extent.x, 0.01) * max(extent.y, 0.01) * max(extent.z, 0.01) }
  }

  private func worldAABB(of node: SCNNode) -> (min: SIMD3<Float>, max: SIMD3<Float>)? {
    let (lmin, lmax) = node.boundingBox
    var worldMin = SIMD3<Float>(repeating: Float.greatestFiniteMagnitude)
    var worldMax = SIMD3<Float>(repeating: -Float.greatestFiniteMagnitude)
    var hasPoint = false
    for x in [lmin.x, lmax.x] {
      for y in [lmin.y, lmax.y] {
        for z in [lmin.z, lmax.z] {
          let world = node.convertPosition(SCNVector3(x, y, z), to: nil)
          let p = SIMD3<Float>(world.x, world.y, world.z)
          worldMin = min(worldMin, p)
          worldMax = max(worldMax, p)
          hasPoint = true
        }
      }
    }
    guard hasPoint else { return nil }
    return (worldMin, worldMax)
  }

  private func collectMeshCandidates(from root: SCNNode) -> [MeshCandidate] {
    var candidates: [MeshCandidate] = []
    root.enumerateChildNodes { node, _ in
      guard node.geometry != nil, node.camera == nil, node.light == nil else { return }
      if node.geometry is SCNText { return }
      guard let aabb = worldAABB(of: node) else { return }
      let extent = abs(aabb.max - aabb.min)
      // Skip tiny decorative bits
      if extent.x < 0.05 && extent.y < 0.05 && extent.z < 0.05 { return }
      let center = (aabb.min + aabb.max) * 0.5
      candidates.append(MeshCandidate(node: node, center: center, extent: extent))
    }
    return candidates
  }

  /// Tag RoomPlan USDZ mesh nodes as editable surfaces using measurement metadata.
  @discardableResult
  private func classifyAndRegisterCapturedMesh(
    meshRoot: SCNNode,
    json: [String: Any],
    layout: RoomLayout,
    isBathroom: Bool
  ) -> Set<String> {
    var placed = Set<String>()
    var candidates = collectMeshCandidates(from: meshRoot)
    guard !candidates.isEmpty else { return placed }

    // 1) Floor — largest nearly-horizontal slab near the bottom of the room.
    if let floorIdx = candidates.indices
      .filter({ candidates[$0].extent.y < 0.35 && candidates[$0].xzArea > 0.4 })
      .max(by: { candidates[$0].xzArea < candidates[$1].xzArea }) {
      let floorId = isBathroom ? "floor_tile" : "flooring"
      // Also register bathroom floor_tile AND kitchen flooring when bath uses floor_tile as primary.
      registerSurface(candidates[floorIdx].node, surfaceId: floorId)
      if isBathroom {
        registerSurface(candidates[floorIdx].node, surfaceId: "flooring")
      }
      placed.insert(floorId)
      placed.insert("flooring")
      candidates.remove(at: floorIdx)
    }

    // 2) Walls — match each scanned wall center to the nearest tall thin mesh.
    let walls = (json["walls"] as? [[String: Any]]) ?? []
    for wall in walls {
      guard let center = wall["center"] as? [String: Double],
            let cx = center["x"], let cy = center["y"], let cz = center["z"] else { continue }
      let target = SIMD3<Float>(Float(cx), Float(cy), Float(cz))
      guard let bestIdx = candidates.indices
        .filter({
          let c = candidates[$0]
          let thin = min(c.extent.x, c.extent.z) < 0.45
          let tall = c.extent.y > 1.2
          return thin && tall
        })
        .min(by: {
          simd_distance(candidates[$0].center, target) < simd_distance(candidates[$1].center, target)
        }),
            simd_distance(candidates[bestIdx].center, target) < 1.25 else {
        continue
      }
      registerSurface(candidates[bestIdx].node, surfaceId: "walls")
      placed.insert("walls")
      candidates.remove(at: bestIdx)
    }

    // If no wall matched by center, promote remaining tall thin meshes to walls.
    if !placed.contains("walls") {
      let wallLike = candidates.indices.filter {
        let c = candidates[$0]
        return min(c.extent.x, c.extent.z) < 0.45 && c.extent.y > 1.2
      }
      for idx in wallLike.reversed() {
        registerSurface(candidates[idx].node, surfaceId: "walls")
        placed.insert("walls")
        candidates.remove(at: idx)
      }
    }

    // 3) Objects — match RoomPlan objects to remaining meshes by center.
    let objects = (json["objects"] as? [[String: Any]]) ?? []
    for obj in objects {
      guard let center = obj["center"] as? [String: Double],
            let cx = center["x"], let cy = center["y"], let cz = center["z"] else { continue }
      let category = String(obj["category"] as? String ?? "").lowercased()
      guard let surfaceId = surfaceIdForScannedCategory(category, isBathroom: isBathroom) else { continue }
      let target = SIMD3<Float>(Float(cx), Float(cy), Float(cz))
      guard let bestIdx = candidates.indices.min(by: {
        simd_distance(candidates[$0].center, target) < simd_distance(candidates[$1].center, target)
      }), simd_distance(candidates[bestIdx].center, target) < 1.0 else {
        continue
      }
      registerSurface(candidates[bestIdx].node, surfaceId: surfaceId)
      placed.insert(surfaceId)
      let matched = candidates.remove(at: bestIdx)

      // Countertop slab on top of cabinet/vanity mesh if counter surface still empty.
      let counterId = surfaceId == "vanity" ? "vanity_counter" : (surfaceId == "cabinets" ? "countertops" : nil)
      if let counterId = counterId, !placed.contains(counterId) {
        let topY = matched.center.y + matched.extent.y * 0.5
        let slab = SCNBox(
          width: CGFloat(max(0.2, Double(matched.extent.x) + 0.02)),
          height: 0.035,
          length: CGFloat(max(0.2, Double(matched.extent.z) + 0.02)),
          chamferRadius: 0.003
        )
        let mat = SCNMaterial()
        mat.diffuse.contents = UIColor(red: 0.97, green: 0.96, blue: 0.93, alpha: 1.0)
        mat.roughness.contents = 0.25
        mat.lightingModel = .physicallyBased
        slab.materials = [mat]
        let slabNode = SCNNode(geometry: slab)
        slabNode.position = SCNVector3(matched.center.x, topY + 0.02, matched.center.z)
        registerSurface(slabNode, surfaceId: counterId)
        applyShowroomFinish(to: slabNode, surfaceId: counterId)
        placed.insert(counterId)
        meshRoot.addChildNode(slabNode)
      }
    }

    // 4) Leftover mid-height storage-like meshes → cabinets/vanity if still missing.
    if !placed.contains(isBathroom ? "vanity" : "cabinets") {
      let storageLike = candidates.indices.filter {
        let c = candidates[$0]
        return c.extent.y > 0.45 && c.extent.y < 2.2 && c.xzArea > 0.15 && c.xzArea < 4.0
      }
      .sorted { candidates[$0].volume > candidates[$1].volume }
      if let idx = storageLike.first {
        let sid = isBathroom ? "vanity" : "cabinets"
        registerSurface(candidates[idx].node, surfaceId: sid)
        placed.insert(sid)
        candidates.remove(at: idx)
      }
    }

    _ = layout
    return placed
  }

  /// Soft showroom finishes so raw RoomPlan USDZ isn't flat gray plastic.
  private func polishCapturedMeshAppearance(root: SCNNode) {
    root.enumerateChildNodes { node, _ in
      guard node.geometry != nil, node.camera == nil, node.light == nil else { return }
      if node.geometry is SCNText { return }
      let surfaceId = surfaceIdFromNodeName(node.name)
      applyShowroomFinish(to: node, surfaceId: surfaceId)
    }
  }

  /// Shift top-level mesh nodes so the room floor/center sits near the origin.
  private func centerCapturedMesh(_ root: SCNNode) {
    let bounds = root.boundingBox
    let spanX = bounds.max.x - bounds.min.x
    let spanY = bounds.max.y - bounds.min.y
    let spanZ = bounds.max.z - bounds.min.z
    guard spanX.isFinite, spanY.isFinite, spanZ.isFinite, spanX > 0.2, spanZ > 0.2 else { return }

    let shiftX = (bounds.min.x + bounds.max.x) * 0.5
    let shiftY = bounds.min.y
    let shiftZ = (bounds.min.z + bounds.max.z) * 0.5
    for child in root.childNodes {
      if child.camera != nil || child.light != nil { continue }
      child.position.x -= shiftX
      child.position.y -= shiftY
      child.position.z -= shiftZ
    }
  }

  private func applyShowroomFinish(to node: SCNNode, surfaceId: String?) {
    guard let geometry = node.geometry else { return }
    let mat = SCNMaterial()
    mat.lightingModel = .physicallyBased
    mat.metalness.contents = 0.04
    mat.emission.contents = UIColor.black

    switch surfaceId {
    case "walls":
      // Warm modern architectural greige wall — distinct from pure white counters & dark cabinets
      mat.diffuse.contents = UIColor(red: 0.91, green: 0.89, blue: 0.86, alpha: 1.0)
      mat.roughness.contents = 0.85
      mat.isDoubleSided = true
    case "flooring", "floor_tile":
      // Rich natural golden oak hardwood flooring
      mat.diffuse.contents = UIColor(red: 0.76, green: 0.61, blue: 0.39, alpha: 1.0)
      mat.roughness.contents = 0.50
      mat.isDoubleSided = true
    case "cabinets":
      // Sophisticated deep navy shaker cabinets (striking contrast against walls & counters)
      mat.diffuse.contents = UIColor(red: 0.16, green: 0.22, blue: 0.29, alpha: 1.0)
      mat.roughness.contents = 0.40
    case "vanity":
      // Natural white oak vanity
      mat.diffuse.contents = UIColor(red: 0.74, green: 0.58, blue: 0.38, alpha: 1.0)
      mat.roughness.contents = 0.45
    case "countertops", "vanity_counter":
      // Polished bright Calacatta quartz with high specularity
      mat.diffuse.contents = UIColor(red: 0.98, green: 0.98, blue: 0.97, alpha: 1.0)
      mat.roughness.contents = 0.15
      mat.metalness.contents = 0.10
    case "backsplash":
      // Glazed sea-glass subway tile
      mat.diffuse.contents = UIColor(red: 0.54, green: 0.65, blue: 0.64, alpha: 1.0)
      mat.roughness.contents = 0.25
    case "shower_tile":
      // Slate grey porcelain tile
      mat.diffuse.contents = UIColor(red: 0.42, green: 0.46, blue: 0.50, alpha: 1.0)
      mat.roughness.contents = 0.30
    default:
      let name = (node.name ?? "").lowercased()
      if name.contains("stove") || name.contains("oven") || name.contains("refrigerator") || name.contains("dishwasher") || name.contains("appliance") {
        // Metallic stainless steel appliances
        mat.diffuse.contents = UIColor(red: 0.58, green: 0.60, blue: 0.62, alpha: 1.0)
        mat.metalness.contents = 0.85
        mat.roughness.contents = 0.20
      } else {
        // Distinct warm charcoal architectural accent
        mat.diffuse.contents = UIColor(red: 0.45, green: 0.48, blue: 0.52, alpha: 1.0)
        mat.roughness.contents = 0.60
      }
      mat.isDoubleSided = true
    }

    geometry.materials = [mat]
  }

  private func roomBackdropColor() -> UIColor {
    UIColor(red: 0.10, green: 0.11, blue: 0.13, alpha: 1.0)
  }

  private func addFloor(to parent: SCNNode, length: Double, width: Double) {
    let geo = SCNPlane(width: CGFloat(length), height: CGFloat(width))
    let mat = SCNMaterial()
    mat.diffuse.contents = UIColor(red: 0.78, green: 0.66, blue: 0.46, alpha: 1.0)
    mat.roughness.contents = 0.7
    mat.isDoubleSided = true
    mat.lightingModel = .physicallyBased
    geo.materials = [mat]
    let node = SCNNode(geometry: geo)
    node.eulerAngles.x = -.pi / 2
    // Slightly above y=0 so the floor renders cleanly under walls without z-fighting.
    node.position = SCNVector3(0, 0.002, 0)
    registerSurface(node, surfaceId: "flooring")
    parent.addChildNode(node)
  }

  private func addWalls(_ walls: [[String: Any]], to parent: SCNNode, layout: RoomLayout) {
    let length = layout.length
    let width = layout.width
    let height = layout.height
    let ox = layout.offsetX
    let oy = layout.offsetY
    let oz = layout.offsetZ

    if !walls.isEmpty {
      for wall in walls {
        guard let w = wall["width"] as? Double,
              let h = wall["height"] as? Double,
              let center = wall["center"] as? [String: Double],
              let cx = center["x"], let cy = center["y"], let cz = center["z"] else {
          continue
        }
        let angle = wall["angle"] as? Double ?? 0

        let geo = SCNBox(width: CGFloat(w), height: CGFloat(h), length: 0.06, chamferRadius: 0.002)
        let mat = SCNMaterial()
        mat.diffuse.contents = UIColor(red: 0.95, green: 0.93, blue: 0.88, alpha: 1.0)
        mat.roughness.contents = 0.88
        mat.metalness.contents = 0.02
        mat.lightingModel = .physicallyBased
        mat.isDoubleSided = true
        geo.materials = [mat]

        let node = SCNNode(geometry: geo)
        node.position = SCNVector3(
          Float(cx + ox),
          Float(cy + oy),
          Float(cz + oz)
        )
        node.eulerAngles.y = -Float(angle)
        registerSurface(node, surfaceId: "walls")
        parent.addChildNode(node)
      }
    } else {
      // Create 3 enclosing room walls around the floor (Back, Left, Right)
      let wallMat = SCNMaterial()
      wallMat.diffuse.contents = UIColor(red: 0.95, green: 0.93, blue: 0.88, alpha: 1.0)
      wallMat.roughness.contents = 0.88
      wallMat.metalness.contents = 0.02
      wallMat.lightingModel = .physicallyBased
      wallMat.isDoubleSided = true

      // Back wall
      let backGeo = SCNBox(width: CGFloat(length), height: CGFloat(height), length: 0.06, chamferRadius: 0.002)
      backGeo.materials = [wallMat]
      let backNode = SCNNode(geometry: backGeo)
      backNode.position = SCNVector3(0, Float(height / 2), Float(-width / 2))
      registerSurface(backNode, surfaceId: "walls")
      parent.addChildNode(backNode)

      // Left wall
      let leftGeo = SCNBox(width: 0.06, height: CGFloat(height), length: CGFloat(width), chamferRadius: 0)
      leftGeo.materials = [wallMat]
      let leftNode = SCNNode(geometry: leftGeo)
      leftNode.position = SCNVector3(Float(-length / 2), Float(height / 2), 0)
      registerSurface(leftNode, surfaceId: "walls")
      parent.addChildNode(leftNode)

      // Right wall
      let rightGeo = SCNBox(width: 0.06, height: CGFloat(height), length: CGFloat(width), chamferRadius: 0)
      rightGeo.materials = [wallMat]
      let rightNode = SCNNode(geometry: rightGeo)
      rightNode.position = SCNVector3(Float(length / 2), Float(height / 2), 0)
      registerSurface(rightNode, surfaceId: "walls")
      parent.addChildNode(rightNode)
    }
  }

  // MARK: - Doors / Windows (from scan — spatial layout fidelity)

  private func addOpenings(
    doors: [[String: Any]],
    windows: [[String: Any]],
    to parent: SCNNode,
    layout: RoomLayout
  ) {
    let ox = layout.offsetX
    let oy = layout.offsetY
    let oz = layout.offsetZ

    for door in doors {
      guard let w = door["width"] as? Double,
            let h = door["height"] as? Double,
            let center = door["center"] as? [String: Double],
            let cx = center["x"], let cy = center["y"], let cz = center["z"] else {
        continue
      }
      let angle = door["angle"] as? Double ?? 0
      let geo = SCNBox(width: CGFloat(max(0.4, w)), height: CGFloat(max(0.8, h)), length: 0.08, chamferRadius: 0)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.45, green: 0.32, blue: 0.22, alpha: 0.85)
      mat.transparency = 0.35
      mat.isDoubleSided = true
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(Float(cx + ox), Float(cy + oy), Float(cz + oz))
      node.eulerAngles.y = -Float(angle)
      node.name = "wai_opening_door"
      parent.addChildNode(node)
    }

    for window in windows {
      guard let w = window["width"] as? Double,
            let h = window["height"] as? Double,
            let center = window["center"] as? [String: Double],
            let cx = center["x"], let cy = center["y"], let cz = center["z"] else {
        continue
      }
      let angle = window["angle"] as? Double ?? 0
      let geo = SCNBox(width: CGFloat(max(0.3, w)), height: CGFloat(max(0.3, h)), length: 0.06, chamferRadius: 0)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.55, green: 0.75, blue: 0.95, alpha: 0.55)
      mat.transparency = 0.45
      mat.isDoubleSided = true
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(Float(cx + ox), Float(cy + oy), Float(cz + oz))
      node.eulerAngles.y = -Float(angle)
      node.name = "wai_opening_window"
      parent.addChildNode(node)
    }
  }

  /// Place RoomPlan-detected objects at scanned size/pose. Returns surface ids that were filled from scan.
  @discardableResult
  private func addScannedObjects(
    _ objects: [[String: Any]],
    to parent: SCNNode,
    layout: RoomLayout,
    isBathroom: Bool
  ) -> Set<String> {
    var placed = Set<String>()
    let ox = layout.offsetX
    let oy = layout.offsetY
    let oz = layout.offsetZ

    for obj in objects {
      guard let w = obj["width"] as? Double,
            let h = obj["height"] as? Double,
            let d = obj["depth"] as? Double,
            let center = obj["center"] as? [String: Double],
            let cx = center["x"], let cy = center["y"], let cz = center["z"] else {
        continue
      }
      let angle = obj["angle"] as? Double ?? 0
      let category = String(obj["category"] as? String ?? "").lowercased()
      let surfaceId = surfaceIdForScannedCategory(category, isBathroom: isBathroom)

      let geo = SCNBox(
        width: CGFloat(max(0.15, w)),
        height: CGFloat(max(0.15, h)),
        length: CGFloat(max(0.15, d)),
        chamferRadius: 0.008
      )
      let mat = SCNMaterial()
      let isAppliance = category.contains("stove") || category.contains("oven") || category.contains("dishwasher") || category.contains("refrigerator")
      if isAppliance {
        mat.diffuse.contents = UIColor(red: 0.58, green: 0.60, blue: 0.62, alpha: 1.0)
        mat.metalness.contents = 0.85
        mat.roughness.contents = 0.20
      } else {
        mat.diffuse.contents = defaultColor(for: surfaceId)
        mat.roughness.contents = 0.45
      }
      mat.lightingModel = .physicallyBased
      geo.materials = [mat]

      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(Float(cx + ox), Float(cy + oy), Float(cz + oz))
      node.eulerAngles.y = -Float(angle)
      if let surfaceId = surfaceId {
        registerSurface(node, surfaceId: surfaceId)
        placed.insert(surfaceId)

        // Counter slab on top of scanned base cabinets / vanity.
        if surfaceId == "cabinets" || surfaceId == "vanity" {
          let counterId = surfaceId == "vanity" ? "vanity_counter" : "countertops"
          let slabH: CGFloat = 0.04
          let slab = SCNBox(
            width: CGFloat(max(0.15, w)) + 0.02,
            height: slabH,
            length: CGFloat(max(0.15, d)) + 0.02,
            chamferRadius: 0.004
          )
          let slabMat = SCNMaterial()
          slabMat.diffuse.contents = UIColor(red: 0.98, green: 0.98, blue: 0.97, alpha: 1.0)
          slabMat.roughness.contents = 0.15
          slabMat.metalness.contents = 0.10
          slabMat.lightingModel = .physicallyBased
          slab.materials = [slabMat]
          let slabNode = SCNNode(geometry: slab)
          slabNode.position = SCNVector3(
            Float(cx + ox),
            Float(cy + oy + h / 2 + Double(slabH) / 2),
            Float(cz + oz)
          )
          slabNode.eulerAngles.y = -Float(angle)
          registerSurface(slabNode, surfaceId: counterId)
          placed.insert(counterId)
          parent.addChildNode(slabNode)
        }
      } else {
        node.name = "wai_scanned_\(category)"
      }
      parent.addChildNode(node)
    }

    return placed
  }

  private func surfaceIdForScannedCategory(_ category: String, isBathroom: Bool) -> String? {
    // RoomPlan String(describing:) is typically the case name ("storage", "sink", …).
    if category.contains("storage") {
      return isBathroom ? "vanity" : "cabinets"
    }
    if category.contains("sink") {
      return isBathroom ? "vanity_counter" : "countertops"
    }
    if category.contains("bathtub") || category.contains("toilet") {
      return "shower_tile"
    }
    if category.contains("stove") || category.contains("oven")
        || category.contains("dishwasher") || category.contains("refrigerator") {
      return nil // appliances — geometry only
    }
    return nil
  }

  private func defaultColor(for surfaceId: String?) -> UIColor {
    switch surfaceId {
    case "cabinets":
      return UIColor(red: 0.16, green: 0.22, blue: 0.29, alpha: 1.0) // Deep Navy Shaker
    case "vanity":
      return UIColor(red: 0.74, green: 0.58, blue: 0.38, alpha: 1.0) // Warm Oak
    case "countertops", "vanity_counter":
      return UIColor(red: 0.98, green: 0.98, blue: 0.97, alpha: 1.0) // Polished Quartz
    case "backsplash":
      return UIColor(red: 0.54, green: 0.65, blue: 0.64, alpha: 1.0) // Sea Glass Glazed Tile
    case "shower_tile":
      return UIColor(red: 0.42, green: 0.46, blue: 0.50, alpha: 1.0) // Slate Grey Tile
    case "flooring", "floor_tile":
      return UIColor(red: 0.76, green: 0.61, blue: 0.39, alpha: 1.0) // Natural Oak
    case "walls":
      return UIColor(red: 0.91, green: 0.89, blue: 0.86, alpha: 1.0) // Studio Greige
    default:
      return UIColor(red: 0.45, green: 0.48, blue: 0.52, alpha: 1.0) // Architectural Accent
    }
  }

  // MARK: - Synthetic Kitchen Furniture (only for surfaces missing from scan)

  private func addKitchenFurniture(
    to parent: SCNNode,
    length: Double,
    width: Double,
    height: Double,
    skipSurfaces: Set<String> = [],
    centeredFallback: Bool = false
  ) {
    // Anchor against the "back" wall on -Z, centered along X
    let runWidth = min(length - 0.4, 3.4)
    if runWidth <= 0.5 { return }

    let baseHeight: CGFloat = 0.9
    let baseDepth: CGFloat = 0.6
    let counterThickness: CGFloat = 0.04
    let upperHeight: CGFloat = 0.7
    let upperDepth: CGFloat = 0.32
    let upperOffsetY: CGFloat = 1.5

    // Box-fallback scenes are recentered to origin. USDZ mesh stays in RoomPlan coords.
    let originX: Float
    let originZ: Float
    let floorY: Float
    if centeredFallback, let layout = roomLayout {
      originX = Float(-layout.offsetX)
      originZ = Float(-layout.offsetZ)
      floorY = Float(-layout.offsetY)
    } else {
      originX = 0
      originZ = 0
      floorY = 0
    }

    let backZ = originZ - Float(width / 2) + 0.04 + Float(baseDepth) / 2
    let needsCabinets = !skipSurfaces.contains("cabinets")
    let needsCounters = !skipSurfaces.contains("countertops")
    let needsBacksplash = !skipSurfaces.contains("backsplash")

    // Base cabinets (Deep Navy Shaker)
    if needsCabinets {
      let geo = SCNBox(width: CGFloat(runWidth), height: baseHeight, length: baseDepth, chamferRadius: 0.012)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.16, green: 0.22, blue: 0.29, alpha: 1.0)
      mat.roughness.contents = 0.40
      mat.metalness.contents = 0.04
      mat.lightingModel = .physicallyBased
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(originX, floorY + Float(baseHeight / 2), backZ)
      registerSurface(node, surfaceId: "cabinets")
      parent.addChildNode(node)
    }

    // Countertop (Polished Calacatta Quartz)
    if needsCounters {
      let geo = SCNBox(width: CGFloat(runWidth) + 0.04, height: counterThickness, length: baseDepth + 0.04, chamferRadius: 0.006)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.98, green: 0.98, blue: 0.97, alpha: 1.0)
      mat.roughness.contents = 0.15
      mat.metalness.contents = 0.10
      mat.lightingModel = .physicallyBased
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(originX, floorY + Float(baseHeight + counterThickness / 2), backZ)
      registerSurface(node, surfaceId: "countertops")
      parent.addChildNode(node)
    }

    // Upper cabinets (Deep Navy Shaker)
    if needsCabinets {
      let geo = SCNBox(width: CGFloat(runWidth), height: upperHeight, length: upperDepth, chamferRadius: 0.012)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.16, green: 0.22, blue: 0.29, alpha: 1.0)
      mat.roughness.contents = 0.40
      mat.metalness.contents = 0.04
      mat.lightingModel = .physicallyBased
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      let upperBackZ = originZ - Float(width / 2) + 0.04 + Float(upperDepth) / 2
      node.position = SCNVector3(originX, floorY + Float(upperOffsetY + upperHeight / 2), upperBackZ)
      registerSurface(node, surfaceId: "cabinets")
      parent.addChildNode(node)
    }

    _ = height // reserved for future ceiling support

    // Backsplash (Glazed Sea Glass Tile)
    if needsBacksplash {
      let backsplashHeight = upperOffsetY - (baseHeight + counterThickness) - 0.02
      if backsplashHeight > 0.1 {
        let geo = SCNBox(width: CGFloat(runWidth), height: backsplashHeight, length: 0.015, chamferRadius: 0)
        let mat = SCNMaterial()
        mat.diffuse.contents = UIColor(red: 0.54, green: 0.65, blue: 0.64, alpha: 1.0)
        mat.roughness.contents = 0.25
        mat.lightingModel = .physicallyBased
        geo.materials = [mat]
        let node = SCNNode(geometry: geo)
        node.position = SCNVector3(
          originX,
          floorY + Float(baseHeight + counterThickness + backsplashHeight / 2),
          originZ - Float(width / 2) + 0.05
        )
        registerSurface(node, surfaceId: "backsplash")
        parent.addChildNode(node)
      }
    }
  }

  // MARK: - Synthetic Bathroom Furniture

  private func addBathroomFloorTile(to parent: SCNNode, length: Double, width: Double) {
    let geo = SCNPlane(width: CGFloat(length), height: CGFloat(width))
    let mat = SCNMaterial()
    mat.diffuse.contents = UIColor(red: 0.72, green: 0.7, blue: 0.66, alpha: 1.0)
    mat.roughness.contents = 0.5
    mat.isDoubleSided = true
    mat.lightingModel = .physicallyBased
    geo.materials = [mat]
    let node = SCNNode(geometry: geo)
    node.eulerAngles.x = -.pi / 2
    node.position = SCNVector3(0, 0.003, 0)
    registerSurface(node, surfaceId: "floor_tile")
    parent.addChildNode(node)
  }

  private func addBathroomFurniture(
    to parent: SCNNode,
    length: Double,
    width: Double,
    height: Double,
    skipSurfaces: Set<String> = [],
    centeredFallback: Bool = false
  ) {
    let vanityWidth = min(length - 0.8, 1.2)
    if vanityWidth <= 0.4 { return }

    let vanityHeight: CGFloat = 0.85
    let vanityDepth: CGFloat = 0.55
    let counterThickness: CGFloat = 0.04

    let originX: Float
    let originZ: Float
    let floorY: Float
    if centeredFallback, let layout = roomLayout {
      originX = Float(-layout.offsetX)
      originZ = Float(-layout.offsetZ)
      floorY = Float(-layout.offsetY)
    } else {
      originX = 0
      originZ = 0
      floorY = 0
    }

    let backZ = originZ - Float(width / 2) + 0.04 + Float(vanityDepth) / 2
    let needsVanity = !skipSurfaces.contains("vanity")
    let needsCounter = !skipSurfaces.contains("vanity_counter")
    let needsShower = !skipSurfaces.contains("shower_tile")
    let needsFloor = !skipSurfaces.contains("floor_tile")

    // Vanity base (Warm White Oak)
    if needsVanity {
      let geo = SCNBox(width: CGFloat(vanityWidth), height: vanityHeight, length: vanityDepth, chamferRadius: 0.01)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.74, green: 0.58, blue: 0.38, alpha: 1.0)
      mat.roughness.contents = 0.45
      mat.lightingModel = .physicallyBased
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(originX - Float(length / 4), floorY + Float(vanityHeight / 2), backZ)
      registerSurface(node, surfaceId: "vanity")
      parent.addChildNode(node)
    }

    // Vanity counter (Polished Bright Quartz)
    if needsCounter {
      let geo = SCNBox(width: CGFloat(vanityWidth) + 0.04, height: counterThickness, length: vanityDepth + 0.04, chamferRadius: 0.005)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.98, green: 0.98, blue: 0.97, alpha: 1.0)
      mat.roughness.contents = 0.15
      mat.metalness.contents = 0.10
      mat.lightingModel = .physicallyBased
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(originX - Float(length / 4), floorY + Float(vanityHeight + counterThickness / 2), backZ)
      registerSurface(node, surfaceId: "vanity_counter")
      parent.addChildNode(node)
    }
    

    // Shower tile wall (Slate Grey Tile)
    if needsShower {
      let showerWidth = min(width - 0.4, 1.2)
      let showerHeight: CGFloat = min(2.2, CGFloat(height) - 0.1)
      let geo = SCNBox(width: 0.04, height: showerHeight, length: CGFloat(showerWidth), chamferRadius: 0)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.42, green: 0.46, blue: 0.50, alpha: 1.0)
      mat.roughness.contents = 0.30
      mat.lightingModel = .physicallyBased
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(
        originX + Float(length / 2 - 0.05),
        floorY + Float(showerHeight / 2),
        originZ - Float(width / 2) + Float(showerWidth) / 2 + 0.04
      )
      registerSurface(node, surfaceId: "shower_tile")
      parent.addChildNode(node)
    }

    // Floor tile covering the room floor flush (bathroom — same footprint as main floor)
    if needsFloor {
      if centeredFallback {
        let geo = SCNPlane(width: CGFloat(length), height: CGFloat(width))
        let mat = SCNMaterial()
        mat.diffuse.contents = UIColor(red: 0.72, green: 0.7, blue: 0.66, alpha: 1.0)
        mat.roughness.contents = 0.5
        mat.isDoubleSided = true
        mat.lightingModel = .physicallyBased
        geo.materials = [mat]
        let node = SCNNode(geometry: geo)
        node.eulerAngles.x = -.pi / 2
        node.position = SCNVector3(originX, floorY + 0.003, originZ)
        registerSurface(node, surfaceId: "floor_tile")
        parent.addChildNode(node)
      } else {
        addBathroomFloorTile(to: parent, length: length, width: width)
      }
    }
  }

  // MARK: - Surface Registration + Material Swap

  private func registerSurface(_ node: SCNNode, surfaceId: String) {
    // Preserve first surface id on the node name for hit-testing; still track multi-ids.
    if surfaceIdFromNodeName(node.name) == nil {
      node.name = "\(SURFACE_NAME_PREFIX)\(surfaceId)"
    }
    var list = surfaceNodes[surfaceId] ?? []
    if !list.contains(node) {
      list.append(node)
      surfaceNodes[surfaceId] = list
    }
  }

  func setSurfaceMaterial(
    surfaceId: String,
    colorHex: String,
    materialName: String,
    roughness: Double,
    metalness: Double,
    textureURL: String? = nil
  ) {
    guard let nodes = surfaceNodes[surfaceId], !nodes.isEmpty,
          let color = colorFromHex(colorHex) else { return }

    let isFloorSurface = surfaceId == "flooring" || surfaceId == "floor_tile"
    let floorScaleX = Float(roomLayout?.length ?? 4.0)
    let floorScaleZ = Float(roomLayout?.width ?? 3.0)
    let trimmedURL = textureURL?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

    let apply: (UIImage?) -> Void = { [weak self] texture in
      guard let self = self else { return }
      DispatchQueue.main.async {
        for node in nodes {
          guard let geometry = node.geometry else { continue }
          let mat = SCNMaterial()
          if let texture = texture {
            mat.diffuse.contents = texture
            mat.diffuse.wrapS = .repeat
            mat.diffuse.wrapT = .repeat
            if isFloorSurface {
              mat.diffuse.contentsTransform = SCNMatrix4MakeScale(floorScaleX * 2.5, floorScaleZ * 2.5, 1)
            } else {
              // Product photos: show once across the face rather than a tiny tile.
              mat.diffuse.contentsTransform = SCNMatrix4MakeScale(1.0, 1.0, 1)
              mat.diffuse.wrapS = .clamp
              mat.diffuse.wrapT = .clamp
            }
          } else {
            mat.diffuse.contents = color
          }
          mat.roughness.contents = roughness
          mat.metalness.contents = metalness
          mat.isDoubleSided = isFloorSurface || surfaceId == "walls"
          mat.lightingModel = .physicallyBased
          geometry.materials = [mat]
        }
      }
    }

    // Supplier catalog photo — prefer over procedural when available.
    if !trimmedURL.isEmpty, let url = URL(string: trimmedURL), url.scheme?.hasPrefix("http") == true {
      if let cached = textureCache[trimmedURL] {
        apply(cached)
        return
      }
      URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
        guard let self = self else { return }
        guard let data = data, let image = UIImage(data: data) else {
          self.applyProceduralOrFlat(
            surfaceId: surfaceId,
            color: color,
            materialName: materialName,
            roughness: roughness,
            metalness: metalness,
            isFloorSurface: isFloorSurface,
            floorScaleX: floorScaleX,
            floorScaleZ: floorScaleZ,
            nodes: nodes
          )
          return
        }
        self.textureCache[trimmedURL] = image
        apply(image)
      }.resume()
      return
    }

    applyProceduralOrFlat(
      surfaceId: surfaceId,
      color: color,
      materialName: materialName,
      roughness: roughness,
      metalness: metalness,
      isFloorSurface: isFloorSurface,
      floorScaleX: floorScaleX,
      floorScaleZ: floorScaleZ,
      nodes: nodes
    )
  }

  private func applyProceduralOrFlat(
    surfaceId: String,
    color: UIColor,
    materialName: String,
    roughness: Double,
    metalness: Double,
    isFloorSurface: Bool,
    floorScaleX: Float,
    floorScaleZ: Float,
    nodes: [SCNNode]
  ) {
    let pattern = patternForMaterialName(materialName)
    let textureKey = "\(materialName.lowercased())|\(colorHexKey(color))"
    let texture: UIImage? = (pattern == .flat) ? nil : (textureCache[textureKey] ?? generateTexture(pattern: pattern, baseColor: color))
    if let texture = texture {
      textureCache[textureKey] = texture
    }

    DispatchQueue.main.async {
      for node in nodes {
        guard let geometry = node.geometry else { continue }
        let mat = SCNMaterial()
        if let texture = texture {
          mat.diffuse.contents = texture
          mat.diffuse.wrapS = .repeat
          mat.diffuse.wrapT = .repeat
          if isFloorSurface {
            mat.diffuse.contentsTransform = SCNMatrix4MakeScale(floorScaleX * 2.5, floorScaleZ * 2.5, 1)
          }
        } else {
          mat.diffuse.contents = color
        }
        mat.roughness.contents = roughness
        mat.metalness.contents = metalness
        mat.isDoubleSided = isFloorSurface || surfaceId == "walls"
        mat.lightingModel = .physicallyBased
        geometry.materials = [mat]
      }
    }
    _ = surfaceId
  }

  private func colorHexKey(_ color: UIColor) -> String {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    color.getRed(&r, green: &g, blue: &b, alpha: &a)
    return String(format: "%02x%02x%02x", Int(r * 255), Int(g * 255), Int(b * 255))
  }

  private func colorFromHex(_ hex: String) -> UIColor? {
    var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleaned.hasPrefix("#") { cleaned.removeFirst() }
    guard cleaned.count == 6, let value = UInt32(cleaned, radix: 16) else { return nil }
    let r = CGFloat((value >> 16) & 0xff) / 255.0
    let g = CGFloat((value >> 8) & 0xff) / 255.0
    let b = CGFloat(value & 0xff) / 255.0
    return UIColor(red: r, green: g, blue: b, alpha: 1.0)
  }

  // MARK: - Procedural Texture Generation
  //
  // Each generator returns a tileable UIImage sized 256x256 that shifts the
  // surface from "flat color" to "actually looks like a real material".
  // Lightweight: drawn once per (material + color) and cached, then SceneKit
  // reuses the GPU texture across taps.

  private func generateTexture(pattern: TexturePattern, baseColor: UIColor) -> UIImage? {
    let size = CGSize(width: 256, height: 256)
    UIGraphicsBeginImageContextWithOptions(size, true, 1.0)
    defer { UIGraphicsEndImageContext() }
    guard let ctx = UIGraphicsGetCurrentContext() else { return nil }

    // Always start with base color
    ctx.setFillColor(baseColor.cgColor)
    ctx.fill(CGRect(origin: .zero, size: size))

    switch pattern {
    case .flat:
      break
    case .granite:
      drawSpeckle(ctx, size: size, count: 1400, minRadius: 0.6, maxRadius: 2.4,
                  alphaRange: 0.12...0.42, includeLight: true, includeDark: true)
    case .marble:
      drawMarbleVeins(ctx, size: size, veinCount: 6)
      drawSpeckle(ctx, size: size, count: 250, minRadius: 0.4, maxRadius: 1.0,
                  alphaRange: 0.06...0.18, includeLight: true, includeDark: false)
    case .quartz:
      drawSpeckle(ctx, size: size, count: 700, minRadius: 0.4, maxRadius: 1.1,
                  alphaRange: 0.08...0.22, includeLight: true, includeDark: true)
    case .wood:
      drawWoodGrain(ctx, size: size, baseColor: baseColor)
    case .tile:
      drawTileGrid(ctx, size: size, tileSize: 64)
    case .mosaic:
      drawTileGrid(ctx, size: size, tileSize: 24)
    case .terrazzo:
      drawTerrazzo(ctx, size: size)
    case .stone:
      drawSpeckle(ctx, size: size, count: 500, minRadius: 1.0, maxRadius: 3.5,
                  alphaRange: 0.10...0.32, includeLight: true, includeDark: true)
    case .metal:
      drawBrushedMetal(ctx, size: size)
    }

    return UIGraphicsGetImageFromCurrentImageContext()
  }

  // V2 procedural texture generators. Each material is built in layers
  // (base variation -> mid features -> fine grain -> highlights/shadows)
  // to look closer to real photography than the original single-pass
  // primitive splat that V1 used.

  private func drawSpeckle(
    _ ctx: CGContext, size: CGSize, count: Int,
    minRadius: CGFloat, maxRadius: CGFloat,
    alphaRange: ClosedRange<CGFloat>, includeLight: Bool, includeDark: Bool
  ) {
    // Layer 1: large soft cloud variation so the base isn't dead flat.
    for _ in 0..<14 {
      let cx = CGFloat.random(in: 0...size.width)
      let cy = CGFloat.random(in: 0...size.height)
      let radius = CGFloat.random(in: 50...140)
      let useLight = Bool.random()
      let tone: CGFloat = useLight ? CGFloat.random(in: 0.72...0.92) : CGFloat.random(in: 0.08...0.28)
      let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [
          UIColor(white: tone, alpha: 0.08).cgColor,
          UIColor(white: tone, alpha: 0.0).cgColor,
        ] as CFArray,
        locations: [0.0, 1.0]
      )!
      ctx.drawRadialGradient(
        gradient,
        startCenter: CGPoint(x: cx, y: cy), startRadius: 0,
        endCenter: CGPoint(x: cx, y: cy), endRadius: radius,
        options: []
      )
    }

    // Layer 2: small specks (the original behaviour but with cluster bias
    // so they form little groups instead of being uniformly scattered).
    let clusterCount = max(8, count / 40)
    for _ in 0..<clusterCount {
      let cx = CGFloat.random(in: 0...size.width)
      let cy = CGFloat.random(in: 0...size.height)
      let groupSize = count / clusterCount
      for _ in 0..<groupSize {
        // Bivariate normal-ish around (cx, cy). Average two uniforms for
        // poor-man's Gaussian shape — tightens the cluster without
        // costing trig.
        let dx = (CGFloat.random(in: -1...1) + CGFloat.random(in: -1...1)) * 18
        let dy = (CGFloat.random(in: -1...1) + CGFloat.random(in: -1...1)) * 18
        let x = cx + dx
        let y = cy + dy
        let r = CGFloat.random(in: minRadius...maxRadius)
        let alpha = CGFloat.random(in: alphaRange)
        let useLight = includeLight && (includeDark ? Bool.random() : true)
        let tone: CGFloat = useLight
          ? CGFloat.random(in: 0.78...0.97)
          : CGFloat.random(in: 0.05...0.22)
        ctx.setFillColor(UIColor(white: tone, alpha: alpha).cgColor)
        ctx.fillEllipse(in: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
      }
    }
  }

  private func drawMarbleVeins(_ ctx: CGContext, size: CGSize, veinCount: Int) {
    // Layer 1: faint soft background veining so the marble feels layered.
    for _ in 0..<3 {
      let startY = CGFloat.random(in: 0...size.height)
      let path = UIBezierPath()
      path.move(to: CGPoint(x: -10, y: startY))
      let segments = 5
      var currentX: CGFloat = -10
      var currentY: CGFloat = startY
      for _ in 0..<segments {
        let nextX = currentX + size.width / CGFloat(segments) + CGFloat.random(in: -20...20)
        let nextY = currentY + CGFloat.random(in: -40...40)
        let ctrl1 = CGPoint(x: currentX + CGFloat.random(in: 20...60), y: currentY + CGFloat.random(in: -20...20))
        let ctrl2 = CGPoint(x: nextX - CGFloat.random(in: 20...60), y: nextY + CGFloat.random(in: -20...20))
        path.addCurve(to: CGPoint(x: nextX, y: nextY), controlPoint1: ctrl1, controlPoint2: ctrl2)
        currentX = nextX
        currentY = nextY
      }
      ctx.setStrokeColor(UIColor(white: 0.55, alpha: CGFloat.random(in: 0.06...0.12)).cgColor)
      ctx.setLineWidth(CGFloat.random(in: 6...14))
      ctx.addPath(path.cgPath)
      ctx.strokePath()
    }

    // Layer 2: primary veins as smooth Bezier curves. Real marble veins
    // are smooth and meandering, not the jagged polylines V1 produced.
    for _ in 0..<veinCount {
      let path = UIBezierPath()
      let startX = CGFloat.random(in: -10...size.width)
      let startY = CGFloat.random(in: 0...size.height)
      path.move(to: CGPoint(x: startX, y: startY))
      var currentX = startX
      var currentY = startY
      for _ in 0..<6 {
        let nextX = currentX + CGFloat.random(in: 30...75)
        let nextY = currentY + CGFloat.random(in: -22...22)
        let ctrl1 = CGPoint(
          x: currentX + CGFloat.random(in: 10...30),
          y: currentY + CGFloat.random(in: -25...25)
        )
        let ctrl2 = CGPoint(
          x: nextX - CGFloat.random(in: 10...30),
          y: nextY + CGFloat.random(in: -25...25)
        )
        path.addCurve(to: CGPoint(x: nextX, y: nextY), controlPoint1: ctrl1, controlPoint2: ctrl2)
        currentX = nextX
        currentY = nextY
      }
      ctx.setStrokeColor(UIColor(white: 0.22, alpha: CGFloat.random(in: 0.22...0.38)).cgColor)
      ctx.setLineWidth(CGFloat.random(in: 0.6...1.8))
      ctx.addPath(path.cgPath)
      ctx.strokePath()

      // Layer 3: thinner shadow vein offset slightly for depth.
      ctx.setStrokeColor(UIColor(white: 0.40, alpha: CGFloat.random(in: 0.10...0.20)).cgColor)
      ctx.setLineWidth(0.4)
      let shadowPath = path.copy() as! UIBezierPath
      shadowPath.apply(CGAffineTransform(translationX: 1.5, y: 1.5))
      ctx.addPath(shadowPath.cgPath)
      ctx.strokePath()
    }
  }

  private func drawWoodGrain(_ ctx: CGContext, size: CGSize, baseColor: UIColor) {
    var br: CGFloat = 0, bg: CGFloat = 0, bb: CGFloat = 0, ba: CGFloat = 0
    baseColor.getRed(&br, green: &bg, blue: &bb, alpha: &ba)

    // Layer 1: dense small-grained stripes for the underlying grain feel.
    var y: CGFloat = 0
    while y < size.height {
      let stripeHeight = CGFloat.random(in: 0.4...1.5)
      let toneShift = CGFloat.random(in: -0.06...0.06)
      let stripeColor = UIColor(
        red: max(0, min(1, br + toneShift)),
        green: max(0, min(1, bg + toneShift * 0.85)),
        blue: max(0, min(1, bb + toneShift * 0.70)),
        alpha: 1.0
      )
      ctx.setFillColor(stripeColor.cgColor)
      ctx.fill(CGRect(x: 0, y: y, width: size.width, height: stripeHeight))
      y += stripeHeight
    }

    // Layer 2: a few much wider tonal bands so the grain has long-range
    // variation matching real planks (light vs dark heartwood zones).
    for _ in 0..<6 {
      let bandY = CGFloat.random(in: 0...size.height)
      let bandHeight = CGFloat.random(in: 12...36)
      let toneShift = CGFloat.random(in: -0.10...0.05)
      let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [
          UIColor(red: 0, green: 0, blue: 0, alpha: 0).cgColor,
          UIColor(white: toneShift < 0 ? 0.15 : 0.85, alpha: 0.16).cgColor,
          UIColor(red: 0, green: 0, blue: 0, alpha: 0).cgColor,
        ] as CFArray,
        locations: [0.0, 0.5, 1.0]
      )!
      ctx.saveGState()
      ctx.clip(to: CGRect(x: 0, y: bandY - bandHeight / 2, width: size.width, height: bandHeight))
      ctx.drawLinearGradient(
        gradient,
        start: CGPoint(x: 0, y: bandY - bandHeight / 2),
        end: CGPoint(x: 0, y: bandY + bandHeight / 2),
        options: []
      )
      ctx.restoreGState()
    }

    // Layer 3: knots — elliptical with rings around them so they look like
    // tree-eyes, not random dark blobs.
    let knotCount = Int.random(in: 2...5)
    for _ in 0..<knotCount {
      let kx = CGFloat.random(in: 20...(size.width - 20))
      let ky = CGFloat.random(in: 20...(size.height - 20))
      let kw = CGFloat.random(in: 8...18)
      let kh = kw * CGFloat.random(in: 0.55...0.8)
      // Outer rings (multiple concentric)
      for r in 0..<3 {
        let inset = CGFloat(r) * 2.5
        ctx.setStrokeColor(UIColor(white: 0.10, alpha: 0.22 - CGFloat(r) * 0.05).cgColor)
        ctx.setLineWidth(0.8)
        ctx.strokeEllipse(in: CGRect(x: kx - kw - inset, y: ky - kh - inset, width: (kw + inset) * 2, height: (kh + inset) * 2))
      }
      // Core
      ctx.setFillColor(UIColor(white: 0.08, alpha: 0.55).cgColor)
      ctx.fillEllipse(in: CGRect(x: kx - kw / 2, y: ky - kh / 2, width: kw, height: kh))
    }

    // Layer 4: long subtle grain streaks running with the wood.
    for _ in 0..<60 {
      let startX = CGFloat.random(in: -20...size.width)
      let startY = CGFloat.random(in: 0...size.height)
      let length = CGFloat.random(in: 60...180)
      ctx.setStrokeColor(UIColor(white: 0.08, alpha: CGFloat.random(in: 0.05...0.12)).cgColor)
      ctx.setLineWidth(CGFloat.random(in: 0.3...0.7))
      ctx.move(to: CGPoint(x: startX, y: startY))
      ctx.addLine(to: CGPoint(x: startX + length, y: startY + CGFloat.random(in: -1.5...1.5)))
      ctx.strokePath()
    }
  }

  private func drawTileGrid(_ ctx: CGContext, size: CGSize, tileSize: CGFloat) {
    // Grout: darker recessed channel between tiles. Drawn first so tile
    // highlights land on top.
    let groutWidth: CGFloat = max(1.5, tileSize * 0.04)
    ctx.setFillColor(UIColor(white: 0.18, alpha: 0.72).cgColor)
    var x: CGFloat = 0
    while x <= size.width {
      ctx.fill(CGRect(x: x - groutWidth / 2, y: 0, width: groutWidth, height: size.height))
      x += tileSize
    }
    var y: CGFloat = 0
    while y <= size.height {
      ctx.fill(CGRect(x: 0, y: y - groutWidth / 2, width: size.width, height: groutWidth))
      y += tileSize
    }

    // Per-tile variation: each tile gets a subtle warm/cool tone shift,
    // an inner highlight gradient, and a soft edge shadow toward the
    // grout. Makes each square look hand-laid instead of uniform.
    var ix: CGFloat = 0
    while ix < size.width {
      var iy: CGFloat = 0
      while iy < size.height {
        let tileRect = CGRect(
          x: ix + groutWidth / 2 + 0.5,
          y: iy + groutWidth / 2 + 0.5,
          width: tileSize - groutWidth - 1,
          height: tileSize - groutWidth - 1
        )

        // Tonal jitter (color, not just brightness)
        let toneShift = CGFloat.random(in: -0.05...0.05)
        let warmth = CGFloat.random(in: -0.03...0.03)
        let tint: UIColor
        if toneShift < 0 {
          tint = UIColor(red: 0.1 + warmth, green: 0.1, blue: 0.1 - warmth, alpha: abs(toneShift))
        } else {
          tint = UIColor(red: 0.95 + warmth, green: 0.95, blue: 0.95 - warmth, alpha: toneShift)
        }
        ctx.setFillColor(tint.cgColor)
        ctx.fill(tileRect)

        // Highlight gradient: light from upper-left
        let gradient = CGGradient(
          colorsSpace: CGColorSpaceCreateDeviceRGB(),
          colors: [
            UIColor(white: 1.0, alpha: 0.08).cgColor,
            UIColor(white: 0.0, alpha: 0.0).cgColor,
            UIColor(white: 0.0, alpha: 0.08).cgColor,
          ] as CFArray,
          locations: [0.0, 0.55, 1.0]
        )!
        ctx.saveGState()
        ctx.clip(to: tileRect)
        ctx.drawLinearGradient(
          gradient,
          start: CGPoint(x: tileRect.minX, y: tileRect.minY),
          end: CGPoint(x: tileRect.maxX, y: tileRect.maxY),
          options: []
        )
        ctx.restoreGState()

        iy += tileSize
      }
      ix += tileSize
    }
  }

  private func drawTerrazzo(_ ctx: CGContext, size: CGSize) {
    let chipColors: [UIColor] = [
      UIColor(white: 0.96, alpha: 0.78),
      UIColor(white: 0.10, alpha: 0.62),
      UIColor(red: 0.85, green: 0.55, blue: 0.30, alpha: 0.68),
      UIColor(red: 0.55, green: 0.65, blue: 0.55, alpha: 0.60),
      UIColor(red: 0.78, green: 0.36, blue: 0.20, alpha: 0.55),
      UIColor(white: 0.45, alpha: 0.50),
    ]

    // Background micro-grit so the matrix between chips looks polished
    // concrete-ish instead of dead flat.
    for _ in 0..<400 {
      let x = CGFloat.random(in: 0...size.width)
      let y = CGFloat.random(in: 0...size.height)
      ctx.setFillColor(UIColor(white: CGFloat.random(in: 0.4...0.9), alpha: 0.06).cgColor)
      ctx.fillEllipse(in: CGRect(x: x, y: y, width: 0.6, height: 0.6))
    }

    // Chips: rotated rounded rects, color from the palette, with a thin
    // dark border for the polished-edge effect real terrazzo has.
    for _ in 0..<300 {
      let x = CGFloat.random(in: 0...size.width)
      let y = CGFloat.random(in: 0...size.height)
      let w = CGFloat.random(in: 3...12)
      let h = CGFloat.random(in: 3...12)
      let rotation = CGFloat.random(in: 0...(.pi * 2))
      let color = chipColors.randomElement()!
      ctx.saveGState()
      ctx.translateBy(x: x, y: y)
      ctx.rotate(by: rotation)
      let path = UIBezierPath(
        roundedRect: CGRect(x: -w / 2, y: -h / 2, width: w, height: h),
        cornerRadius: CGFloat.random(in: 0.8...2.0)
      )
      ctx.setFillColor(color.cgColor)
      ctx.addPath(path.cgPath)
      ctx.fillPath()
      // Edge highlight
      ctx.setStrokeColor(UIColor(white: 0.0, alpha: 0.20).cgColor)
      ctx.setLineWidth(0.4)
      ctx.addPath(path.cgPath)
      ctx.strokePath()
      ctx.restoreGState()
    }
  }

  private func drawBrushedMetal(_ ctx: CGContext, size: CGSize) {
    // Horizontal anisotropic streaks at varying densities. Real brushed
    // metal has thousands of micro-scratches that catch light unevenly;
    // we approximate with two passes of dense fine lines + a few wider
    // reflection bands.
    for _ in 0..<1400 {
      let y = CGFloat.random(in: 0...size.height)
      let tone: CGFloat = Bool.random() ? CGFloat.random(in: 0.86...0.98) : CGFloat.random(in: 0.30...0.48)
      ctx.setStrokeColor(UIColor(white: tone, alpha: CGFloat.random(in: 0.05...0.18)).cgColor)
      ctx.setLineWidth(CGFloat.random(in: 0.25...0.6))
      ctx.move(to: CGPoint(x: 0, y: y))
      ctx.addLine(to: CGPoint(x: size.width, y: y + CGFloat.random(in: -0.3...0.3)))
      ctx.strokePath()
    }

    // Wider reflection bands give the impression of light catching the
    // surface non-uniformly. Real brushed steel does this in macro view.
    for _ in 0..<3 {
      let cy = CGFloat.random(in: 0...size.height)
      let bandHeight = CGFloat.random(in: 14...32)
      let gradient = CGGradient(
        colorsSpace: CGColorSpaceCreateDeviceRGB(),
        colors: [
          UIColor(white: 1.0, alpha: 0.0).cgColor,
          UIColor(white: 1.0, alpha: 0.08).cgColor,
          UIColor(white: 1.0, alpha: 0.0).cgColor,
        ] as CFArray,
        locations: [0.0, 0.5, 1.0]
      )!
      ctx.saveGState()
      ctx.clip(to: CGRect(x: 0, y: cy - bandHeight / 2, width: size.width, height: bandHeight))
      ctx.drawLinearGradient(
        gradient,
        start: CGPoint(x: 0, y: cy - bandHeight / 2),
        end: CGPoint(x: 0, y: cy + bandHeight / 2),
        options: []
      )
      ctx.restoreGState()
    }
  }

  // MARK: - Hit Testing

  @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
    let location = gesture.location(in: sceneView)
    let options: [SCNHitTestOption: Any] = [
      .boundingBoxOnly: false,
      .ignoreHiddenNodes: true,
    ]
    let results = sceneView.hitTest(location, options: options)
    guard let first = results.first else { return }

    // Walk up the parent chain to find a node we registered (name has wai_surface_ prefix).
    var node: SCNNode? = first.node
    while let current = node {
      if let surfaceId = surfaceIdFromNodeName(current.name) {
        bridgeView?.emitSurfaceTap(surfaceId: surfaceId)
        return
      }
      node = current.parent
    }
  }

  @objc private func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
    guard let cam = cameraNode ?? sceneView.pointOfView,
          let initTransform = initialCameraTransform else { return }
    SCNTransaction.begin()
    SCNTransaction.animationDuration = 0.45
    cam.transform = initTransform
    SCNTransaction.commit()
  }

  // MARK: - Helpers

  private func setupCamera(for scene: SCNScene, layout: RoomLayout) {
    let camNode = SCNNode()
    let camera = SCNCamera()
    camera.zNear = 0.05
    camera.zFar = 100
    camera.fieldOfView = 62
    camera.wantsHDR = true
    camera.wantsExposureAdaptation = false
    camera.exposureOffset = -0.15
    camera.automaticallyAdjustsZRange = true
    camNode.camera = camera

    let boundsNode = contentNode ?? scene.rootNode
    let bounds = boundsNode.boundingBox
    let spanX = bounds.max.x - bounds.min.x
    let spanZ = bounds.max.z - bounds.min.z
    let spanY = bounds.max.y - bounds.min.y
    let maxSpan = Swift.max(
      2.5 as Float,
      Swift.max(spanX, spanZ),
      Float(layout.length),
      Float(layout.width)
    )
    let lookY: Float = usesCapturedMesh
      ? (bounds.min.y + bounds.max.y) * 0.42
      : Float(layout.lookAtY)
    let center = SCNVector3(
      (bounds.min.x + bounds.max.x) / 2,
      lookY,
      (bounds.min.z + bounds.max.z) / 2
    )

    // Wide elevated dollhouse 3/4 angle: pulls camera back so whole room is comfortably framed
    let camDist = maxSpan * 1.35
    camNode.position = SCNVector3(
      center.x + camDist * 0.65,
      center.y + maxSpan * 0.85,
      center.z + camDist * 0.75
    )
    camNode.look(at: center)
    scene.rootNode.addChildNode(camNode)
    sceneView.pointOfView = camNode
    self.cameraNode = camNode
    self.initialCameraTransform = camNode.transform
    _ = spanY
  }

  private func setupLighting(for scene: SCNScene, lookAtY: Float) {
    let boundsNode = contentNode ?? scene.rootNode
    let bounds = boundsNode.boundingBox
    let cx = (bounds.min.x + bounds.max.x) / 2
    let cy = usesCapturedMesh
      ? (bounds.min.y + bounds.max.y) / 2
      : lookAtY
    let cz = (bounds.min.z + bounds.max.z) / 2
    let span = Swift.max(
      2.0 as Float,
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    )
    let target = SCNVector3(cx, cy, cz)

    // Soft IBL base so PBR materials don't look dead/flat.
    scene.lightingEnvironment.contents = UIColor(red: 0.55, green: 0.58, blue: 0.62, alpha: 1.0)
    scene.lightingEnvironment.intensity = 0.85

    let ambient = SCNNode()
    ambient.light = SCNLight()
    ambient.light?.type = .ambient
    ambient.light?.color = UIColor(red: 0.92, green: 0.93, blue: 0.95, alpha: 1.0)
    ambient.light?.intensity = 420
    scene.rootNode.addChildNode(ambient)

    let key = SCNNode()
    key.light = SCNLight()
    key.light?.type = .directional
    key.light?.color = UIColor(red: 1.0, green: 0.98, blue: 0.94, alpha: 1.0)
    key.light?.intensity = 1100
    key.light?.castsShadow = !usesCapturedMesh
    key.light?.shadowMode = .deferred
    key.light?.shadowSampleCount = 8
    key.light?.shadowRadius = 3
    key.position = SCNVector3(cx + span * 0.55, cy + span * 0.95, cz + span * 0.4)
    key.look(at: target)
    scene.rootNode.addChildNode(key)

    let fill = SCNNode()
    fill.light = SCNLight()
    fill.light?.type = .directional
    fill.light?.color = UIColor(red: 0.82, green: 0.88, blue: 1.0, alpha: 1.0)
    fill.light?.intensity = 420
    fill.position = SCNVector3(cx - span * 0.6, cy + span * 0.55, cz - span * 0.35)
    fill.look(at: target)
    scene.rootNode.addChildNode(fill)

    // Soft ceiling bounce — reads more like a real interior.
    let ceiling = SCNNode()
    ceiling.light = SCNLight()
    ceiling.light?.type = .omni
    ceiling.light?.color = UIColor(red: 1.0, green: 0.97, blue: 0.92, alpha: 1.0)
    ceiling.light?.intensity = 650
    ceiling.light?.attenuationStartDistance = CGFloat(span * 0.4)
    ceiling.light?.attenuationEndDistance = CGFloat(span * 2.8)
    ceiling.position = SCNVector3(cx, bounds.max.y + span * 0.15, cz)
    scene.rootNode.addChildNode(ceiling)

    let rim = SCNNode()
    rim.light = SCNLight()
    rim.light?.type = .directional
    rim.light?.color = UIColor(red: 0.95, green: 0.96, blue: 1.0, alpha: 1.0)
    rim.light?.intensity = 220
    rim.position = SCNVector3(cx - span * 0.2, cy + span * 0.3, cz + span * 0.8)
    rim.look(at: target)
    scene.rootNode.addChildNode(rim)
  }

  private func addPlaceholderLabel() {
    let label = UILabel()
    label.text = "3D customizer unavailable\nScan a room or use manual measurements first."
    label.numberOfLines = 0
    label.textAlignment = .center
    label.textColor = UIColor(white: 0.5, alpha: 1.0)
    label.font = .systemFont(ofSize: 15, weight: .medium)
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)
    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 20),
      label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -20),
    ])
  }
}

// MARK: - React Native Bridge View

@objc(RoomCustomizerView)
class RoomCustomizerView: UIView {

  private var viewController: RoomCustomizerViewController?
  private var currentMeasurementData: String?
  private var currentRoomType: String?

  @objc var onSurfaceTap: RCTBubblingEventBlock?

  @objc var measurementData: String? {
    didSet {
      currentMeasurementData = measurementData
      rebuild()
    }
  }

  @objc var roomType: String? {
    didSet {
      currentRoomType = roomType
      rebuild()
    }
  }

  private func rebuild() {
    guard currentMeasurementData != nil else { return }
    viewController?.view.removeFromSuperview()
    viewController = nil

    let vc = RoomCustomizerViewController(measurementData: currentMeasurementData, roomType: currentRoomType)
    vc.bridgeView = self
    vc.view.frame = bounds
    vc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(vc.view)
    viewController = vc
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    viewController?.view.frame = bounds
  }

  // MARK: - Public Bridge API

  func emitSurfaceTap(surfaceId: String) {
    onSurfaceTap?(["surfaceId": surfaceId])
  }

  @objc func setSurfaceMaterial(
    _ surfaceId: String,
    colorHex: String,
    materialName: String,
    roughness: NSNumber,
    metalness: NSNumber,
    textureURL: NSString?
  ) {
    viewController?.setSurfaceMaterial(
      surfaceId: surfaceId,
      colorHex: colorHex,
      materialName: materialName,
      roughness: roughness.doubleValue,
      metalness: metalness.doubleValue,
      textureURL: textureURL as String?
    )
  }
}
