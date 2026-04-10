import UIKit
import SceneKit

class USDZViewerViewController: UIViewController {

  private var sceneView: SCNView!
  private var filePath: String?

  init(filePath: String?) {
    self.filePath = filePath
    super.init(nibName: nil, bundle: nil)
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    setupSceneView()
    loadModel()
  }

  private func setupSceneView() {
    sceneView = SCNView(frame: view.bounds)
    sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    sceneView.backgroundColor = .black
    sceneView.allowsCameraControl = true
    sceneView.autoenablesDefaultLighting = true
    sceneView.antialiasingMode = .multisampling4X
    view.addSubview(sceneView)
  }

  private func loadModel() {
    guard let path = filePath else {
      showPlaceholder()
      return
    }

    let url = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: path) else {
      showPlaceholder()
      return
    }

    do {
      let scene = try SCNScene(url: url, options: [
        .checkConsistency: true
      ])
      sceneView.scene = scene
      setupCamera(for: scene)
      setupLighting(for: scene)
    } catch {
      print("Failed to load USDZ: \(error)")
      showPlaceholder()
    }
  }

  private func setupCamera(for scene: SCNScene) {
    let cameraNode = SCNNode()
    let camera = SCNCamera()
    camera.automaticallyAdjustsZRange = true
    cameraNode.camera = camera

    // Position camera above and to the side for a good overview angle
    cameraNode.position = SCNVector3(x: 0, y: 5, z: 5)
    cameraNode.look(at: SCNVector3(x: 0, y: 0, z: 0))
    scene.rootNode.addChildNode(cameraNode)
  }

  private func setupLighting(for scene: SCNScene) {
    // Ambient light for overall illumination
    let ambientLight = SCNNode()
    ambientLight.light = SCNLight()
    ambientLight.light?.type = .ambient
    ambientLight.light?.color = UIColor(white: 0.4, alpha: 1.0)
    scene.rootNode.addChildNode(ambientLight)

    // Directional light for definition
    let directionalLight = SCNNode()
    directionalLight.light = SCNLight()
    directionalLight.light?.type = .directional
    directionalLight.light?.color = UIColor(white: 0.8, alpha: 1.0)
    directionalLight.position = SCNVector3(x: 5, y: 10, z: 5)
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

  @objc var filePath: String? {
    didSet {
      setupViewer()
    }
  }

  private func setupViewer() {
    viewController?.view.removeFromSuperview()
    viewController = nil

    let vc = USDZViewerViewController(filePath: filePath)
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

