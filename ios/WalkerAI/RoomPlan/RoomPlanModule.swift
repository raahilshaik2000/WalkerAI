import Foundation
import UIKit
import React

#if canImport(RoomPlan)
import RoomPlan
#endif

#if canImport(ARKit)
import ARKit
#endif

#if canImport(SceneKit)
import SceneKit
#endif

@objc(RoomPlanModule)
class RoomPlanModule: RCTEventEmitter {

  private var hasListeners = false

  override static func moduleName() -> String! {
    return "RoomPlanModule"
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return ["onScanCompleted", "onScanError", "onScanCancelled"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  // MARK: - Check Device Support

  @objc func checkDeviceSupport(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if targetEnvironment(simulator)
    resolve(["supported": true, "reason": "Simulator uses mock room scan data for development and QA."])
    return
    #else
    if #available(iOS 16.0, *) {
      #if canImport(RoomPlan)
      let supported = RoomCaptureSession.isSupported
      #if canImport(ARKit)
      let arMeasureSupported = ARWorldTrackingConfiguration.isSupported
      #else
      let arMeasureSupported = false
      #endif
      resolve([
        "supported": supported || arMeasureSupported,
        "mode": supported ? "roomplan" : (arMeasureSupported ? "ar_measure" : "unsupported"),
        "reason": supported
          ? nil
          : (arMeasureSupported
              ? "This iPhone does not have LiDAR, so WalkerAI will use manual AR point measurements."
              : "This device does not support AR room measurement.")
      ])
      #else
      resolve(["supported": false, "reason": "RoomPlan framework not available."])
      #endif
    } else {
      resolve(["supported": false, "reason": "Room scanning requires iOS 16 or later."])
    }
    #endif
  }

  // MARK: - Start Scan

  @objc func startScan(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if targetEnvironment(simulator)
    // Return mock data after a brief delay to simulate scanning
    DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
      let mockData = self?.generateMockScanData() ?? [:]
      self?.sendEvent(withName: "onScanCompleted", body: mockData)
    }
    resolve(["status": "scanning"])
    return
    #else
    if #available(iOS 16.0, *) {
      #if canImport(RoomPlan)
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        guard let rootVC = UIApplication.shared
          .connectedScenes
          .compactMap({ $0 as? UIWindowScene })
          .flatMap({ $0.windows })
          .first(where: { $0.isKeyWindow })?
          .rootViewController else {
            reject("NO_ROOT_VC", "Could not find root view controller", nil)
            return
        }

        var presenter = rootVC
        while let presented = presenter.presentedViewController {
          presenter = presented
        }
        if presenter is RoomCaptureViewController {
          resolve(["status": "scanning"])
          return
        }
        #if canImport(ARKit)
        if presenter is ARMeasureViewController {
          resolve(["status": "scanning"])
          return
        }
        #endif

        if RoomCaptureSession.isSupported {
          let captureVC = RoomCaptureViewController()
          captureVC.modalPresentationStyle = .fullScreen
          captureVC.onScanCompleted = { [weak self] data in
            self?.sendEvent(withName: "onScanCompleted", body: data)
          }
          captureVC.onScanError = { [weak self] error in
            self?.sendEvent(withName: "onScanError", body: ["error": error])
          }
          captureVC.onScanCancelled = { [weak self] in
            self?.sendEvent(withName: "onScanCancelled", body: nil)
          }

          presenter.present(captureVC, animated: true)
          resolve(["status": "scanning", "mode": "roomplan"])
          return
        }

        #if canImport(ARKit)
        guard ARWorldTrackingConfiguration.isSupported else {
          reject("UNSUPPORTED_DEVICE", "This device does not support AR room measurement.", nil)
          return
        }

        let measureVC = ARMeasureViewController()
        measureVC.modalPresentationStyle = .fullScreen
        measureVC.onScanCompleted = { [weak self] data in
          self?.sendEvent(withName: "onScanCompleted", body: data)
        }
        measureVC.onScanCancelled = { [weak self] in
          self?.sendEvent(withName: "onScanCancelled", body: nil)
        }
        presenter.present(measureVC, animated: true)
        resolve(["status": "scanning", "mode": "ar_measure"])
        #else
        reject("UNSUPPORTED_DEVICE", "This device does not support AR room measurement.", nil)
        #endif
      }
      #else
      reject("UNAVAILABLE", "RoomPlan framework not available", nil)
      #endif
    } else {
      reject("UNAVAILABLE", "Room scanning requires iOS 16 or later", nil)
    }
    #endif
  }

  // MARK: - Stop Scan

  @objc func stopScan(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let rootVC = UIApplication.shared
        .connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows })
        .first(where: { $0.isKeyWindow })?
        .rootViewController else {
          resolve(["status": "no_active_scan"])
          return
      }

      var presenter = rootVC
      while let presented = presenter.presentedViewController {
        presenter = presented
      }

      if let captureVC = presenter as? RoomCaptureViewController {
        captureVC.finishScan()
        resolve(["status": "stopped"])
        return
      }

      #if canImport(ARKit)
      if #available(iOS 13.0, *), let measureVC = presenter as? ARMeasureViewController {
        measureVC.cancelMeasurement()
        resolve(["status": "stopped"])
        return
      }
      #endif

      resolve(["status": "no_active_scan"])
    }
  }

  // MARK: - Mock Data for Simulator

  private func generateMockScanData() -> [String: Any] {
    // Realistic L-shaped living room mock
    let walls: [[String: Any]] = [
      ["id": "wall_1", "width": 4.2, "height": 2.7, "angle": 0.0, "center": ["x": 0.0, "y": 1.35, "z": -2.1]],
      ["id": "wall_2", "width": 3.5, "height": 2.7, "angle": Double.pi / 2, "center": ["x": 2.1, "y": 1.35, "z": 0.0]],
      ["id": "wall_3", "width": 2.0, "height": 2.7, "angle": 0.0, "center": ["x": 1.1, "y": 1.35, "z": 1.75]],
      ["id": "wall_4", "width": 1.5, "height": 2.7, "angle": Double.pi / 2, "center": ["x": 0.1, "y": 1.35, "z": 1.0]],
      ["id": "wall_5", "width": 2.5, "height": 2.7, "angle": 0.0, "center": ["x": -1.15, "y": 1.35, "z": 1.75]],
      ["id": "wall_6", "width": 3.5, "height": 2.7, "angle": Double.pi / 2, "center": ["x": -2.1, "y": 1.35, "z": 0.0]]
    ]

    let doors: [[String: Any]] = [
      ["id": "door_1", "width": 0.9, "height": 2.1, "center": ["x": -1.5, "y": 1.05, "z": -2.1]],
      ["id": "door_2", "width": 0.8, "height": 2.1, "center": ["x": 2.1, "y": 1.05, "z": 1.2]]
    ]

    let windows: [[String: Any]] = [
      ["id": "window_1", "width": 1.2, "height": 1.0, "center": ["x": 1.0, "y": 1.8, "z": -2.1]],
      ["id": "window_2", "width": 1.5, "height": 1.2, "center": ["x": 2.1, "y": 1.8, "z": -0.8]]
    ]

    let objects: [[String: Any]] = [
      ["category": "sofa", "width": 2.0, "height": 0.85, "depth": 0.9, "center": ["x": 0.5, "y": 0.425, "z": 1.0]],
      ["category": "table", "width": 1.2, "height": 0.75, "depth": 0.7, "center": ["x": -0.8, "y": 0.375, "z": -0.5]]
    ]

    return [
      "walls": walls,
      "doors": doors,
      "windows": windows,
      "objects": objects,
      "roomDimensions": [
        "length": 4.2,
        "width": 3.5,
        "height": 2.7,
        "area": 14.7
      ],
      "usdzFilePath": NSNull(),
      "isMock": true
    ]
  }
}

#if canImport(ARKit)
@available(iOS 13.0, *)
private class ARMeasureViewController: UIViewController {
  var onScanCompleted: (([String: Any]) -> Void)?
  var onScanCancelled: (() -> Void)?

  private let sceneView = ARSCNView()
  private let instructionLabel = UILabel()
  private let valueLabel = UILabel()
  private let doneButton = UIButton(type: .system)
  private let defaultHeightButton = UIButton(type: .system)
  private let undoButton = UIButton(type: .system)

  private var pendingPoint: SCNVector3?
  private var measuredValues: [Double] = []
  private var renderedNodes: [SCNNode] = []

  private let steps = [
    "Tap both ends of the room length.",
    "Tap both ends of the room width.",
    "Tap floor and ceiling for height, or use standard 8 ft height."
  ]

  override func viewDidLoad() {
    super.viewDidLoad()
    configureScene()
    configureOverlay()
    updateLabels()
  }

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)

    let configuration = ARWorldTrackingConfiguration()
    configuration.planeDetection = [.horizontal, .vertical]
    sceneView.session.run(configuration)
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    sceneView.session.pause()
  }

  func cancelMeasurement() {
    dismiss(animated: true) { [weak self] in
      self?.onScanCancelled?()
    }
  }

  private func configureScene() {
    view.backgroundColor = .black
    sceneView.translatesAutoresizingMaskIntoConstraints = false
    sceneView.automaticallyUpdatesLighting = true
    view.addSubview(sceneView)

    NSLayoutConstraint.activate([
      sceneView.topAnchor.constraint(equalTo: view.topAnchor),
      sceneView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      sceneView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      sceneView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])

    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    sceneView.addGestureRecognizer(tap)
  }

  private func configureOverlay() {
    let topPanel = UIVisualEffectView(effect: UIBlurEffect(style: .dark))
    topPanel.translatesAutoresizingMaskIntoConstraints = false
    topPanel.layer.cornerRadius = 18
    topPanel.clipsToBounds = true
    view.addSubview(topPanel)

    let stack = UIStackView()
    stack.axis = .vertical
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    topPanel.contentView.addSubview(stack)

    instructionLabel.font = .systemFont(ofSize: 18, weight: .semibold)
    instructionLabel.textColor = .white
    instructionLabel.numberOfLines = 0
    instructionLabel.textAlignment = .center

    valueLabel.font = .systemFont(ofSize: 14, weight: .regular)
    valueLabel.textColor = UIColor.white.withAlphaComponent(0.8)
    valueLabel.numberOfLines = 0
    valueLabel.textAlignment = .center

    stack.addArrangedSubview(instructionLabel)
    stack.addArrangedSubview(valueLabel)

    let buttonRow = UIStackView()
    buttonRow.axis = .horizontal
    buttonRow.distribution = .fillEqually
    buttonRow.spacing = 10
    buttonRow.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(buttonRow)

    let cancelButton = makeButton(title: "Cancel", color: UIColor.white.withAlphaComponent(0.18))
    cancelButton.addTarget(self, action: #selector(handleCancel), for: .touchUpInside)

    undoButton.setTitle("Undo", for: .normal)
    undoButton.addTarget(self, action: #selector(handleUndo), for: .touchUpInside)
    styleButton(undoButton, color: UIColor.white.withAlphaComponent(0.18))

    defaultHeightButton.setTitle("Use 8 ft", for: .normal)
    defaultHeightButton.addTarget(self, action: #selector(handleDefaultHeight), for: .touchUpInside)
    styleButton(defaultHeightButton, color: UIColor.white.withAlphaComponent(0.18))

    doneButton.setTitle("Done", for: .normal)
    doneButton.addTarget(self, action: #selector(handleDone), for: .touchUpInside)
    styleButton(doneButton, color: UIColor(red: 1.0, green: 0.42, blue: 0.0, alpha: 1.0))

    buttonRow.addArrangedSubview(cancelButton)
    buttonRow.addArrangedSubview(undoButton)
    buttonRow.addArrangedSubview(defaultHeightButton)
    buttonRow.addArrangedSubview(doneButton)

    NSLayoutConstraint.activate([
      topPanel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
      topPanel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
      topPanel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),

      stack.topAnchor.constraint(equalTo: topPanel.contentView.topAnchor, constant: 16),
      stack.leadingAnchor.constraint(equalTo: topPanel.contentView.leadingAnchor, constant: 16),
      stack.trailingAnchor.constraint(equalTo: topPanel.contentView.trailingAnchor, constant: -16),
      stack.bottomAnchor.constraint(equalTo: topPanel.contentView.bottomAnchor, constant: -16),

      buttonRow.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
      buttonRow.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -18),
      buttonRow.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -18),
      buttonRow.heightAnchor.constraint(equalToConstant: 48)
    ])
  }

  private func makeButton(title: String, color: UIColor) -> UIButton {
    let button = UIButton(type: .system)
    button.setTitle(title, for: .normal)
    styleButton(button, color: color)
    return button
  }

  private func styleButton(_ button: UIButton, color: UIColor) {
    button.backgroundColor = color
    button.tintColor = .white
    button.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
    button.layer.cornerRadius = 12
    button.clipsToBounds = true
  }

  private func updateLabels() {
    let stepIndex = min(measuredValues.count, steps.count - 1)
    instructionLabel.text = steps[stepIndex]

    let length = measuredValues.indices.contains(0) ? formatMeters(measuredValues[0]) : "not set"
    let width = measuredValues.indices.contains(1) ? formatMeters(measuredValues[1]) : "not set"
    let height = measuredValues.indices.contains(2) ? formatMeters(measuredValues[2]) : "not set"
    valueLabel.text = "Length: \(length)\nWidth: \(width)\nHeight: \(height)"

    defaultHeightButton.isHidden = measuredValues.count != 2 || pendingPoint != nil
    doneButton.isEnabled = measuredValues.count >= 3
    doneButton.alpha = doneButton.isEnabled ? 1.0 : 0.45
    undoButton.isEnabled = pendingPoint != nil || !measuredValues.isEmpty
    undoButton.alpha = undoButton.isEnabled ? 1.0 : 0.45
  }

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    let location = recognizer.location(in: sceneView)
    guard let point = worldPoint(from: location) else {
      instructionLabel.text = "Move the phone slowly, then tap a visible floor or wall point."
      return
    }

    addMarker(at: point)

    guard let start = pendingPoint else {
      pendingPoint = point
      updateLabels()
      return
    }

    let distance = vectorDistance(start, point)
    guard distance > 0.05 else {
      pendingPoint = nil
      removeLastMarker()
      removeLastMarker()
      instructionLabel.text = "Those points are too close. Try again."
      updateLabels()
      return
    }

    measuredValues.append(distance)
    addLine(from: start, to: point)
    pendingPoint = nil
    updateLabels()
  }

  @objc private func handleDefaultHeight() {
    guard measuredValues.count == 2 else { return }
    measuredValues.append(2.4384)
    updateLabels()
  }

  @objc private func handleUndo() {
    if pendingPoint != nil {
      pendingPoint = nil
      removeLastMarker()
    } else if !measuredValues.isEmpty {
      measuredValues.removeLast()
      removeLastLineAndMarkers()
    }
    updateLabels()
  }

  @objc private func handleCancel() {
    cancelMeasurement()
  }

  @objc private func handleDone() {
    guard measuredValues.count >= 3 else { return }
    let scanData = buildScanData()
    dismiss(animated: true) { [weak self] in
      self?.onScanCompleted?(scanData)
    }
  }

  private func worldPoint(from location: CGPoint) -> SCNVector3? {
    let hitTypes: ARHitTestResult.ResultType = [
      .featurePoint,
      .estimatedHorizontalPlane,
      .estimatedVerticalPlane
    ]
    guard let result = sceneView.hitTest(location, types: hitTypes).first else {
      return nil
    }

    let transform = result.worldTransform
    return SCNVector3(
      transform.columns.3.x,
      transform.columns.3.y,
      transform.columns.3.z
    )
  }

  private func addMarker(at point: SCNVector3) {
    let sphere = SCNSphere(radius: 0.025)
    sphere.firstMaterial?.diffuse.contents = UIColor(red: 1.0, green: 0.42, blue: 0.0, alpha: 1.0)
    let node = SCNNode(geometry: sphere)
    node.position = point
    sceneView.scene.rootNode.addChildNode(node)
    renderedNodes.append(node)
  }

  private func addLine(from start: SCNVector3, to end: SCNVector3) {
    let source = SCNGeometrySource(vertices: [start, end])
    let indices: [Int32] = [0, 1]
    let indexData = indices.withUnsafeBufferPointer { Data(buffer: $0) }
    let element = SCNGeometryElement(
      data: indexData,
      primitiveType: .line,
      primitiveCount: 1,
      bytesPerIndex: MemoryLayout<Int32>.size
    )
    let geometry = SCNGeometry(sources: [source], elements: [element])
    geometry.firstMaterial?.diffuse.contents = UIColor(red: 0.0, green: 0.78, blue: 1.0, alpha: 1.0)

    let node = SCNNode(geometry: geometry)
    sceneView.scene.rootNode.addChildNode(node)
    renderedNodes.append(node)
  }

  private func removeLastMarker() {
    guard let node = renderedNodes.popLast() else { return }
    node.removeFromParentNode()
  }

  private func removeLastLineAndMarkers() {
    for _ in 0..<3 {
      guard let node = renderedNodes.popLast() else { return }
      node.removeFromParentNode()
    }
  }

  private func vectorDistance(_ start: SCNVector3, _ end: SCNVector3) -> Double {
    let dx = Double(end.x - start.x)
    let dy = Double(end.y - start.y)
    let dz = Double(end.z - start.z)
    return sqrt(dx * dx + dy * dy + dz * dz)
  }

  private func formatMeters(_ meters: Double) -> String {
    String(format: "%.2f m", meters)
  }

  private func buildScanData() -> [String: Any] {
    let length = max(measuredValues[0], 0.1)
    let width = max(measuredValues[1], 0.1)
    let height = max(measuredValues[2], 0.1)
    let halfLength = length / 2
    let halfWidth = width / 2

    let walls: [[String: Any]] = [
      ["id": "ar_wall_1", "width": length, "height": height, "angle": 0.0, "center": ["x": 0.0, "y": height / 2, "z": -halfWidth]],
      ["id": "ar_wall_2", "width": width, "height": height, "angle": Double.pi / 2, "center": ["x": halfLength, "y": height / 2, "z": 0.0]],
      ["id": "ar_wall_3", "width": length, "height": height, "angle": Double.pi, "center": ["x": 0.0, "y": height / 2, "z": halfWidth]],
      ["id": "ar_wall_4", "width": width, "height": height, "angle": Double.pi / 2, "center": ["x": -halfLength, "y": height / 2, "z": 0.0]]
    ]

    return [
      "walls": walls,
      "doors": [],
      "windows": [],
      "objects": [],
      "roomDimensions": [
        "length": length,
        "width": width,
        "height": height,
        "area": length * width
      ],
      "usdzFilePath": NSNull(),
      "isMock": false,
      "scanMode": "ar_measure"
    ]
  }
}
#endif
