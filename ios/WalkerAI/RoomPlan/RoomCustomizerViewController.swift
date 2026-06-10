import UIKit
import SceneKit
import React

private let SURFACE_NAME_PREFIX = "wai_surface_"

private func surfaceIdFromNodeName(_ name: String?) -> String? {
  guard let name = name, name.hasPrefix(SURFACE_NAME_PREFIX) else { return nil }
  return String(name.dropFirst(SURFACE_NAME_PREFIX.count))
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
    for wall in walls {
      guard let w = wall["width"] as? Double,
            let h = wall["height"] as? Double,
            let center = wall["center"] as? [String: Double],
            let cx = center["x"], let cy = center["y"], let cz = center["z"] else {
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

    // Upper cabinets (same surface id as base — pick "cabinets" once, both update)
    do {
      let geo = SCNBox(width: CGFloat(runWidth), height: upperHeight, length: upperDepth, chamferRadius: 0.01)
      let mat = SCNMaterial()
      mat.diffuse.contents = UIColor(red: 0.95, green: 0.93, blue: 0.91, alpha: 1.0)
      mat.roughness.contents = 0.4
      geo.materials = [mat]
      let node = SCNNode(geometry: geo)
      let upperBackZ = -(width / 2) + 0.04 + Double(upperDepth) / 2
      node.position = SCNVector3(0, Float(upperOffsetY + upperHeight / 2), Float(upperBackZ))
      registerSurface(node, surfaceId: "cabinets")
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
    var list = surfaceNodes[surfaceId] ?? []
    list.append(node)
    surfaceNodes[surfaceId] = list
  }

  func setSurfaceMaterial(surfaceId: String, colorHex: String, materialName: String, roughness: Double, metalness: Double) {
    guard let nodes = surfaceNodes[surfaceId], !nodes.isEmpty,
          let color = colorFromHex(colorHex) else { return }

    let pattern = patternForMaterialName(materialName)
    let textureKey = "\(materialName.lowercased())|\(colorHex.lowercased())"
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
        } else {
          mat.diffuse.contents = color
        }
        mat.roughness.contents = roughness
        mat.metalness.contents = metalness
        geometry.materials = [mat]
      }
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

  @objc func setSurfaceMaterial(_ surfaceId: String, colorHex: String, materialName: String, roughness: NSNumber, metalness: NSNumber) {
    viewController?.setSurfaceMaterial(
      surfaceId: surfaceId,
      colorHex: colorHex,
      materialName: materialName,
      roughness: roughness.doubleValue,
      metalness: metalness.doubleValue
    )
  }
}
