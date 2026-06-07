import UIKit
import SceneKit
import React

private let SURFACE_NAME_PREFIX = "wai_surface_"

private func surfaceIdFromNodeName(_ name: String?) -> String? {
  guard let name = name, name.hasPrefix(SURFACE_NAME_PREFIX) else { return nil }
  return String(name.dropFirst(SURFACE_NAME_PREFIX.count))
}

class RoomCustomizerViewController: UIViewController {

  private var sceneView: SCNView!
  private var measurementData: String?
  private var roomTypeRaw: String?
  private var surfaceNodes: [String: SCNNode] = [:]

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
    sceneView.backgroundColor = UIColor(white: 0.06, alpha: 1.0)
    sceneView.allowsCameraControl = true
    sceneView.autoenablesDefaultLighting = false
    sceneView.antialiasingMode = .multisampling4X
    view.addSubview(sceneView)
  }

  private func setupTapRecognizer() {
    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    tap.cancelsTouchesInView = false
    sceneView.addGestureRecognizer(tap)
  }

  // MARK: - Scene Building

  private func buildScene() {
    let scene = SCNScene()
    scene.background.contents = UIColor(white: 0.06, alpha: 1.0)
    sceneView.scene = scene

    guard let jsonStr = measurementData,
          let data = jsonStr.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      addPlaceholderLabel()
      return
    }

    let dims = (json["roomDimensions"] as? [String: Double]) ?? [:]
    let length = dims["length"] ?? 4.0
    let widthDim = dims["width"] ?? 3.0
    let height = dims["height"] ?? 2.7

    addFloor(to: scene, length: length, width: widthDim)

    if let walls = json["walls"] as? [[String: Any]] {
      addWalls(walls, to: scene, height: height)
    }

    let isBathroom = (roomTypeRaw ?? "").lowercased() == "bathroom"
    if isBathroom {
      addBathroomFurniture(to: scene, length: length, width: widthDim, height: height)
    } else {
      addKitchenFurniture(to: scene, length: length, width: widthDim, height: height)
    }

    setupCamera(for: scene, length: length, width: widthDim, height: height)
    setupLighting(for: scene)
  }

  private func addFloor(to scene: SCNScene, length: Double, width: Double) {
    let geo = SCNPlane(width: CGFloat(length) + 0.4, height: CGFloat(width) + 0.4)
    let mat = SCNMaterial()
    mat.diffuse.contents = UIColor(red: 0.78, green: 0.66, blue: 0.46, alpha: 1.0)
    mat.roughness.contents = 0.7
    geo.materials = [mat]
    let node = SCNNode(geometry: geo)
    node.eulerAngles.x = -.pi / 2
    node.position = SCNVector3(0, 0, 0)
    registerSurface(node, surfaceId: "flooring")
    scene.rootNode.addChildNode(node)
  }

  private func addWalls(_ walls: [[String: Any]], to scene: SCNScene, height: Double) {
    var index = 0
    for wall in walls {
      guard let w = wall["width"] as? Double,
            let h = wall["height"] as? Double,
            let center = wall["center"] as? [String: Double],
            let cx = center["x"], let cy = center["y"], let cz = center["z"] else {
        index += 1
        continue
      }
      let angle = wall["angle"] as? Double ?? 0

      let geo = SCNBox(width: CGFloat(w), height: CGFloat(h), length: 0.06, chamferRadius: 0)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.95, green: 0.93, blue: 0.88, alpha: 1.0)
      mat.roughness.contents = 0.9
      geo.materials = [mat]

      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(Float(cx), Float(cy), Float(cz))
      node.eulerAngles.y = -Float(angle)
      registerSurface(node, surfaceId: "walls")
      scene.rootNode.addChildNode(node)

      index += 1
    }
    _ = height // reserved for future ceiling support
  }

  // MARK: - Synthetic Kitchen Furniture (anchored to the longest wall)

  private func addKitchenFurniture(to scene: SCNScene, length: Double, width: Double, height: Double) {
    // Anchor against the "back" wall on -Z, centered along X
    let runWidth = min(length - 0.6, 3.4)
    if runWidth <= 0.5 { return }

    let baseHeight: CGFloat = 0.9
    let baseDepth: CGFloat = 0.6
    let counterThickness: CGFloat = 0.04
    let upperHeight: CGFloat = 0.7
    let upperDepth: CGFloat = 0.32
    let upperOffsetY: CGFloat = 1.5
    let backZ = -(width / 2) + 0.04 + Double(baseDepth) / 2

    // Base cabinets
    do {
      let geo = SCNBox(width: CGFloat(runWidth), height: baseHeight, length: baseDepth, chamferRadius: 0.01)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.95, green: 0.93, blue: 0.91, alpha: 1.0)
      mat.roughness.contents = 0.4
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(0, Float(baseHeight / 2), Float(backZ))
      registerSurface(node, surfaceId: "cabinets")
      scene.rootNode.addChildNode(node)
    }

    // Countertop
    do {
      let geo = SCNBox(width: CGFloat(runWidth) + 0.04, height: counterThickness, length: baseDepth + 0.04, chamferRadius: 0.005)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.97, green: 0.96, blue: 0.93, alpha: 1.0)
      mat.roughness.contents = 0.2
      mat.metalness.contents = 0.05
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(0, Float(baseHeight + counterThickness / 2), Float(backZ))
      registerSurface(node, surfaceId: "countertops")
      scene.rootNode.addChildNode(node)
    }

    // Upper cabinets
    do {
      let geo = SCNBox(width: CGFloat(runWidth), height: upperHeight, length: upperDepth, chamferRadius: 0.01)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.95, green: 0.93, blue: 0.91, alpha: 1.0)
      mat.roughness.contents = 0.4
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      let upperBackZ = -(width / 2) + 0.04 + Double(upperDepth) / 2
      node.position = SCNVector3(0, Float(upperOffsetY + upperHeight / 2), Float(upperBackZ))
      registerSurface(node, surfaceId: "cabinets")  // upper cabinets share cabinets category for V1
      scene.rootNode.addChildNode(node)
    }

    _ = height // reserved for future ceiling support

    // Backsplash (between countertop top and upper cabinets bottom)
    do {
      let backsplashHeight = upperOffsetY - (baseHeight + counterThickness) - 0.02
      if backsplashHeight > 0.1 {
        let geo = SCNBox(width: CGFloat(runWidth), height: backsplashHeight, length: 0.015, chamferRadius: 0)
        let mat = SCNMaterial()
        mat.diffuse.contents = UIColor(red: 0.97, green: 0.97, blue: 0.95, alpha: 1.0)
        mat.roughness.contents = 0.3
        geo.materials = [mat]
        let node = SCNNode(geometry: geo)
        node.position = SCNVector3(0, Float(baseHeight + counterThickness + backsplashHeight / 2), Float(-(width / 2) + 0.05))
        registerSurface(node, surfaceId: "backsplash")
        scene.rootNode.addChildNode(node)
      }
    }
  }

  // MARK: - Synthetic Bathroom Furniture

  private func addBathroomFurniture(to scene: SCNScene, length: Double, width: Double, height: Double) {
    let vanityWidth = min(length - 0.8, 1.2)
    if vanityWidth <= 0.4 { return }

    let vanityHeight: CGFloat = 0.85
    let vanityDepth: CGFloat = 0.55
    let counterThickness: CGFloat = 0.04
    let backZ = -(width / 2) + 0.04 + Double(vanityDepth) / 2

    // Vanity base
    do {
      let geo = SCNBox(width: CGFloat(vanityWidth), height: vanityHeight, length: vanityDepth, chamferRadius: 0.01)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.96, green: 0.94, blue: 0.9, alpha: 1.0)
      mat.roughness.contents = 0.4
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(Float(-length / 4), Float(vanityHeight / 2), Float(backZ))
      registerSurface(node, surfaceId: "vanity")
      scene.rootNode.addChildNode(node)
    }

    // Vanity counter
    do {
      let geo = SCNBox(width: CGFloat(vanityWidth) + 0.04, height: counterThickness, length: vanityDepth + 0.04, chamferRadius: 0.005)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.97, green: 0.96, blue: 0.93, alpha: 1.0)
      mat.roughness.contents = 0.2
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(Float(-length / 4), Float(vanityHeight + counterThickness / 2), Float(backZ))
      registerSurface(node, surfaceId: "vanity_counter")
      scene.rootNode.addChildNode(node)
    }

    // Shower tile wall (right side)
    do {
      let showerWidth = min(width - 0.4, 1.2)
      let showerHeight: CGFloat = min(2.1, CGFloat(height) - 0.2)
      let geo = SCNBox(width: 0.04, height: showerHeight, length: CGFloat(showerWidth), chamferRadius: 0)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.66, green: 0.65, blue: 0.62, alpha: 1.0)
      mat.roughness.contents = 0.3
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.position = SCNVector3(Float(length / 2 - 0.05), Float(showerHeight / 2), 0)
      registerSurface(node, surfaceId: "shower_tile")
      scene.rootNode.addChildNode(node)
    }

    // Floor tile insert (overlays the floor in a portion of the room)
    do {
      let tileLength = min(length - 0.2, 2.0)
      let tileWidth = min(width - 0.2, 2.0)
      let geo = SCNPlane(width: CGFloat(tileLength), height: CGFloat(tileWidth))
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.72, green: 0.7, blue: 0.66, alpha: 1.0)
      mat.roughness.contents = 0.5
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      node.eulerAngles.x = -.pi / 2
      node.position = SCNVector3(0, 0.005, 0)
      registerSurface(node, surfaceId: "floor_tile")
      scene.rootNode.addChildNode(node)
    }
  }

  // MARK: - Surface Registration + Material Swap

  private func registerSurface(_ node: SCNNode, surfaceId: String) {
    node.name = "\(SURFACE_NAME_PREFIX)\(surfaceId)"
    surfaceNodes[surfaceId] = node
  }

  func setSurfaceMaterial(surfaceId: String, colorHex: String, roughness: Double, metalness: Double) {
    guard let node = surfaceNodes[surfaceId],
          let geometry = node.geometry,
          let color = colorFromHex(colorHex) else { return }
    DispatchQueue.main.async {
      let mat = SCNMaterial()
      mat.diffuse.contents = color
      mat.roughness.contents = roughness
      mat.metalness.contents = metalness
      geometry.materials = [mat]
    }
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

  // MARK: - Helpers

  private func setupCamera(for scene: SCNScene, length: Double, width: Double, height: Double) {
    let cameraNode = SCNNode()
    let camera = SCNCamera()
    camera.zNear = 0.05
    camera.zFar = 100
    camera.fieldOfView = 55
    cameraNode.camera = camera

    let maxSpan = max(length, width)
    let distance = maxSpan * 1.4

    cameraNode.position = SCNVector3(Float(distance * 0.7), Float(height * 1.2), Float(distance * 0.9))
    cameraNode.look(at: SCNVector3(0, Float(height * 0.4), 0))
    scene.rootNode.addChildNode(cameraNode)
    sceneView.pointOfView = cameraNode
  }

  private func setupLighting(for scene: SCNScene) {
    let ambient = SCNNode()
    ambient.light = SCNLight()
    ambient.light?.type = .ambient
    ambient.light?.color = UIColor(white: 0.6, alpha: 1.0)
    ambient.light?.intensity = 700
    scene.rootNode.addChildNode(ambient)

    let key = SCNNode()
    key.light = SCNLight()
    key.light?.type = .directional
    key.light?.color = UIColor(white: 1.0, alpha: 1.0)
    key.light?.intensity = 900
    key.position = SCNVector3(2, 6, 3)
    key.look(at: SCNVector3(0, 0, 0))
    scene.rootNode.addChildNode(key)

    let fill = SCNNode()
    fill.light = SCNLight()
    fill.light?.type = .directional
    fill.light?.color = UIColor(red: 0.92, green: 0.95, blue: 1.0, alpha: 1.0)
    fill.light?.intensity = 350
    fill.position = SCNVector3(-3, 4, -2)
    fill.look(at: SCNVector3(0, 0, 0))
    scene.rootNode.addChildNode(fill)
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

  @objc func setSurfaceMaterial(_ surfaceId: String, colorHex: String, roughness: NSNumber, metalness: NSNumber) {
    viewController?.setSurfaceMaterial(
      surfaceId: surfaceId,
      colorHex: colorHex,
      roughness: roughness.doubleValue,
      metalness: metalness.doubleValue
    )
  }
}
