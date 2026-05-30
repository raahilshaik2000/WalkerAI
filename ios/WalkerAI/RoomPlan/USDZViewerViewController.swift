import UIKit
import SceneKit

class USDZViewerViewController: UIViewController {

  private var sceneView: SCNView!
  private var filePath: String?
  private var measurementData: String?

  init(filePath: String?, measurementData: String? = nil) {
    self.filePath = filePath
    self.measurementData = measurementData
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    setupSceneView()

    if filePath != nil {
      loadModel()
    } else {
      buildSceneFromMeasurements()
    }
  }

  private func setupSceneView() {
    sceneView = SCNView(frame: view.bounds)
    sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    sceneView.backgroundColor = .black
    sceneView.allowsCameraControl = true
    sceneView.autoenablesDefaultLighting = false
    sceneView.antialiasingMode = .multisampling4X
    view.addSubview(sceneView)
  }

  // MARK: - Load USDZ + overlay measurements

  private func loadModel() {
    guard let path = filePath else {
      buildSceneFromMeasurements()
      return
    }

    let url = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: path) else {
      buildSceneFromMeasurements()
      return
    }

    do {
      let scene = try SCNScene(url: url, options: [.checkConsistency: true])
      sceneView.scene = scene
      setupCamera(for: scene)
      setupLighting(for: scene)
      addMeasurementLabels(to: scene)
    } catch {
      buildSceneFromMeasurements()
    }
  }

  // MARK: - Build 3D scene from measurement data (when no USDZ)

  private func buildSceneFromMeasurements() {
    guard let jsonStr = measurementData,
          let data = jsonStr.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      showPlaceholder()
      return
    }

    let scene = SCNScene()
    scene.background.contents = UIColor.black
    sceneView.scene = scene

    let wallColor = UIColor(red: 0.85, green: 0.85, blue: 0.9, alpha: 1.0)
    let doorColor = UIColor(red: 0.2, green: 0.83, blue: 0.6, alpha: 1.0)
    let windowColor = UIColor(red: 0.38, green: 0.65, blue: 0.98, alpha: 0.5)
    let dimColor = UIColor(red: 1.0, green: 0.42, blue: 0.0, alpha: 1.0)
    let wallThickness: Float = 0.08

    // Parse walls
    if let walls = json["walls"] as? [[String: Any]] {
      for wall in walls {
        guard let width = wall["width"] as? Double,
              let height = wall["height"] as? Double,
              let center = wall["center"] as? [String: Double],
              let cx = center["x"], let cy = center["y"], let cz = center["z"] else { continue }

        let angle = angleFrom(wall)
        let isHorizontal = abs(cos(angle)) >= abs(sin(angle))
        let wallGeo = SCNBox(width: CGFloat(width), height: CGFloat(height), length: CGFloat(wallThickness), chamferRadius: 0)

        let material = SCNMaterial()
        material.diffuse.contents = wallColor
        material.transparency = 0.7
        wallGeo.materials = [material]

        let wallNode = SCNNode(geometry: wallGeo)
        wallNode.position = SCNVector3(Float(cx), Float(cy), Float(cz))
        wallNode.eulerAngles.y = -angle
        scene.rootNode.addChildNode(wallNode)

        // Add dimension label on the wall
        let labelText = String(format: "%.1fm", width)
        let textNode = createTextNode(labelText, color: dimColor, size: 0.12)
        if isHorizontal {
          textNode.position = SCNVector3(Float(cx), Float(height) + 0.15, Float(cz) - 0.15)
        } else {
          textNode.position = SCNVector3(Float(cx) - 0.15, Float(height) + 0.15, Float(cz))
          textNode.eulerAngles.y = .pi / 2
        }
        scene.rootNode.addChildNode(textNode)

        // Height label on vertical edge
        let hLabel = String(format: "↕ %.1fm", height)
        let hNode = createTextNode(hLabel, color: UIColor(white: 0.6, alpha: 1), size: 0.08)
        if isHorizontal {
          hNode.position = SCNVector3(Float(cx) + Float(width / 2) + 0.1, Float(cy), Float(cz))
        } else {
          hNode.position = SCNVector3(Float(cx), Float(cy), Float(cz) + Float(width / 2) + 0.1)
        }
        scene.rootNode.addChildNode(hNode)
      }
    }

    // Parse doors
    if let doors = json["doors"] as? [[String: Any]] {
      for door in doors {
        guard let width = door["width"] as? Double,
              let height = door["height"] as? Double,
              let center = door["center"] as? [String: Double],
              let cx = center["x"], let cy = center["y"], let cz = center["z"] else { continue }

        let doorGeo = SCNBox(width: CGFloat(width), height: CGFloat(height), length: 0.05, chamferRadius: 0.01)
        let mat = SCNMaterial()
        mat.diffuse.contents = doorColor
        mat.transparency = 0.8
        doorGeo.materials = [mat]

        let doorNode = SCNNode(geometry: doorGeo)
        doorNode.position = SCNVector3(Float(cx), Float(cy), Float(cz))
        doorNode.eulerAngles.y = -angleFrom(door)
        scene.rootNode.addChildNode(doorNode)

        let labelText = String(format: "Door %.1fm", width)
        let textNode = createTextNode(labelText, color: doorColor, size: 0.08)
        textNode.position = SCNVector3(Float(cx), Float(height) + 0.1, Float(cz))
        scene.rootNode.addChildNode(textNode)
      }
    }

    // Parse windows
    if let windows = json["windows"] as? [[String: Any]] {
      for window in windows {
        guard let width = window["width"] as? Double,
              let height = window["height"] as? Double,
              let center = window["center"] as? [String: Double],
              let cx = center["x"], let cy = center["y"], let cz = center["z"] else { continue }

        let winGeo = SCNBox(width: CGFloat(width), height: CGFloat(height), length: 0.03, chamferRadius: 0)
        let mat = SCNMaterial()
        mat.diffuse.contents = windowColor
        mat.transparency = 0.5
        winGeo.materials = [mat]

        let winNode = SCNNode(geometry: winGeo)
        winNode.position = SCNVector3(Float(cx), Float(cy), Float(cz))
        winNode.eulerAngles.y = -angleFrom(window)
        scene.rootNode.addChildNode(winNode)

        let labelText = String(format: "Window %.1fm", width)
        let textNode = createTextNode(labelText, color: UIColor(red: 0.38, green: 0.65, blue: 0.98, alpha: 1), size: 0.08)
        textNode.position = SCNVector3(Float(cx), Float(cy) + Float(height / 2) + 0.1, Float(cz))
        scene.rootNode.addChildNode(textNode)
      }
    }

    // Floor plane
    if let dims = json["roomDimensions"] as? [String: Double],
       let length = dims["length"], let width = dims["width"] {
      let floorGeo = SCNPlane(width: CGFloat(length) + 0.2, height: CGFloat(width) + 0.2)
      let floorMat = SCNMaterial()
      floorMat.diffuse.contents = UIColor(white: 0.08, alpha: 1.0)
      floorGeo.materials = [floorMat]
      let floorNode = SCNNode(geometry: floorGeo)
      floorNode.eulerAngles.x = -.pi / 2
      floorNode.position = SCNVector3(0, 0, 0)
      scene.rootNode.addChildNode(floorNode)

      // Room dimensions label on floor
      let areaLabel = String(format: "%.1f × %.1fm (%.1f m²)", length, width, length * width)
      let areaNode = createTextNode(areaLabel, color: dimColor, size: 0.1)
      areaNode.position = SCNVector3(0, 0.02, 0)
      areaNode.eulerAngles.x = -.pi / 2
      scene.rootNode.addChildNode(areaNode)
    }

    setupCamera(for: scene)
    setupLighting(for: scene)
  }

  // MARK: - Add measurement labels to USDZ scene

  private func addMeasurementLabels(to scene: SCNScene) {
    guard let jsonStr = measurementData,
          let data = jsonStr.data(using: .utf8),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

    let dimColor = UIColor(red: 1.0, green: 0.42, blue: 0.0, alpha: 1.0)

    if let walls = json["walls"] as? [[String: Any]] {
      for wall in walls {
        guard let width = wall["width"] as? Double,
              let height = wall["height"] as? Double,
              let center = wall["center"] as? [String: Double],
              let cx = center["x"], let cy = center["y"], let cz = center["z"] else { continue }

        let labelText = String(format: "%.1fm", width)
        let textNode = createTextNode(labelText, color: dimColor, size: 0.12)
        textNode.position = SCNVector3(Float(cx), Float(height) + 0.15, Float(cz))
        textNode.constraints = [SCNBillboardConstraint()]
        scene.rootNode.addChildNode(textNode)
      }
    }
  }

  // MARK: - Helpers

  private func createTextNode(_ text: String, color: UIColor, size: CGFloat) -> SCNNode {
    let textGeo = SCNText(string: text, extrusionDepth: 0.005)
    textGeo.font = UIFont.systemFont(ofSize: size, weight: .bold)
    textGeo.flatness = 0.1
    textGeo.firstMaterial?.diffuse.contents = color
    textGeo.firstMaterial?.isDoubleSided = true

    let textNode = SCNNode(geometry: textGeo)

    // Center the text
    let (min, max) = textNode.boundingBox
    let dx = (max.x - min.x) / 2
    let dy = (max.y - min.y) / 2
    textNode.pivot = SCNMatrix4MakeTranslation(dx + min.x, dy + min.y, 0)

    // Billboard constraint so text always faces camera
    textNode.constraints = [SCNBillboardConstraint()]

    return textNode
  }

  private func angleFrom(_ item: [String: Any]) -> Float {
    if let angle = item["angle"] as? Double {
      return Float(angle)
    }
    if let angle = item["angle"] as? Float {
      return angle
    }
    return 0
  }

  private func setupCamera(for scene: SCNScene) {
    let cameraNode = SCNNode()
    let camera = SCNCamera()
    camera.automaticallyAdjustsZRange = true
    camera.usesOrthographicProjection = true
    camera.zNear = 0.01
    camera.zFar = 100

    let bounds = scene.rootNode.boundingBox
    let minBox = bounds.min
    let maxBox = bounds.max
    let spanX = maxBox.x - minBox.x
    let spanY = maxBox.y - minBox.y
    let spanZ = maxBox.z - minBox.z
    let maxSpan = Swift.max(3.0, Swift.max(spanX, spanZ))
    let center = SCNVector3(
      x: (minBox.x + maxBox.x) / 2,
      y: Swift.max(0.8, spanY * 0.35),
      z: (minBox.z + maxBox.z) / 2
    )

    camera.orthographicScale = Double(Swift.max(maxSpan * 1.45, spanY * 1.25))
    cameraNode.camera = camera
    cameraNode.position = SCNVector3(
      x: center.x + maxSpan * 0.75,
      y: maxBox.y + maxSpan * 0.85,
      z: center.z + maxSpan * 0.75
    )
    cameraNode.look(at: center)
    scene.rootNode.addChildNode(cameraNode)
    sceneView.pointOfView = cameraNode
  }

  private func setupLighting(for scene: SCNScene) {
    let ambientLight = SCNNode()
    ambientLight.light = SCNLight()
    ambientLight.light?.type = .ambient
    ambientLight.light?.color = UIColor(white: 0.5, alpha: 1.0)
    ambientLight.light?.intensity = 800
    scene.rootNode.addChildNode(ambientLight)

    let directionalLight = SCNNode()
    directionalLight.light = SCNLight()
    directionalLight.light?.type = .directional
    directionalLight.light?.color = UIColor(white: 1.0, alpha: 1.0)
    directionalLight.light?.intensity = 1000
    directionalLight.light?.castsShadow = true
    directionalLight.position = SCNVector3(x: 3, y: 10, z: 5)
    directionalLight.look(at: SCNVector3(x: 0, y: 0, z: 0))
    scene.rootNode.addChildNode(directionalLight)
  }

  private func showPlaceholder() {
    let label = UILabel()
    label.text = "3D model not available"
    label.textColor = UIColor(white: 0.4, alpha: 1.0)
    label.font = .systemFont(ofSize: 16, weight: .medium)
    label.textAlignment = .center
    label.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(label)

    NSLayoutConstraint.activate([
      label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      label.centerYAnchor.constraint(equalTo: view.centerYAnchor)
    ])
  }
}

// MARK: - React Native Bridge View

@objc(USDZViewerView)
class USDZViewerView: UIView {

  private var viewController: USDZViewerViewController?
  private var currentFilePath: String?
  private var currentMeasurementData: String?

  @objc var filePath: String? {
    didSet {
      currentFilePath = filePath
      rebuildIfReady()
    }
  }

  @objc var measurementData: String? {
    didSet {
      currentMeasurementData = measurementData
      rebuildIfReady()
    }
  }

  private func rebuildIfReady() {
    // Rebuild when we have at least measurementData
    guard currentMeasurementData != nil || currentFilePath != nil else { return }

    viewController?.view.removeFromSuperview()
    viewController = nil

    let vc = USDZViewerViewController(filePath: currentFilePath, measurementData: currentMeasurementData)
    vc.view.frame = bounds
    vc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(vc.view)
    viewController = vc
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    viewController?.view.frame = bounds
  }
}
