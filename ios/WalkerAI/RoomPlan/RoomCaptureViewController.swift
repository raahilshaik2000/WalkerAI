import UIKit

#if canImport(RoomPlan)
import RoomPlan
#endif

@available(iOS 16.0, *)
class RoomCaptureViewController: UIViewController {

  var onScanCompleted: (([String: Any]) -> Void)?
  var onScanError: ((String) -> Void)?
  var onScanCancelled: (() -> Void)?

  #if canImport(RoomPlan)
  private var roomCaptureView: RoomCaptureView!
  private var captureSessionConfig: RoomCaptureSession.Configuration!
  private var isScanning = false
  #endif

  // MARK: - Lifecycle

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black

    #if canImport(RoomPlan)
    setupRoomCaptureView()
    #endif
    setupDoneButton()
    setupCancelButton()
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    #if canImport(RoomPlan)
    startSession()
    #endif
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    #if canImport(RoomPlan)
    stopSession()
    #endif
  }

  deinit {
    #if canImport(RoomPlan)
    stopSession()
    #endif
  }

  // MARK: - Setup

  #if canImport(RoomPlan)
  private func setupRoomCaptureView() {
    roomCaptureView = RoomCaptureView(frame: view.bounds)
    roomCaptureView.delegate = self
    roomCaptureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(roomCaptureView)
  }

  private func startSession() {
    guard !isScanning else { return }
    isScanning = true
    captureSessionConfig = RoomCaptureSession.Configuration()
    roomCaptureView.captureSession.run(configuration: captureSessionConfig)
  }

  private func stopSession() {
    guard isScanning else { return }
    isScanning = false
    roomCaptureView?.captureSession.stop()
  }
  #endif

  private func setupDoneButton() {
    let done = UIButton(type: .system)
    done.setTitle("Done", for: .normal)
    done.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
    done.setTitleColor(.black, for: .normal)
    done.backgroundColor = .white
    done.layer.cornerRadius = 25
    done.translatesAutoresizingMaskIntoConstraints = false
    done.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
    view.addSubview(done)

    NSLayoutConstraint.activate([
      done.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      done.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
      done.widthAnchor.constraint(equalToConstant: 120),
      done.heightAnchor.constraint(equalToConstant: 50)
    ])
  }

  private func setupCancelButton() {
    let cancel = UIButton(type: .system)
    cancel.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
    cancel.tintColor = .white
    cancel.translatesAutoresizingMaskIntoConstraints = false
    cancel.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
    view.addSubview(cancel)

    NSLayoutConstraint.activate([
      cancel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 16),
      cancel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      cancel.widthAnchor.constraint(equalToConstant: 36),
      cancel.heightAnchor.constraint(equalToConstant: 36)
    ])
  }

  // MARK: - Actions

  @objc private func doneTapped() {
    #if canImport(RoomPlan)
    stopSession()
    #endif
  }

  @objc private func cancelTapped() {
    #if canImport(RoomPlan)
    stopSession()
    #endif
    dismiss(animated: true) { [weak self] in
      self?.onScanCancelled?()
    }
  }

  func finishScan() {
    #if canImport(RoomPlan)
    stopSession()
    #endif
  }

  // MARK: - Data Serialization

  #if canImport(RoomPlan)
  private func serializeCapturedRoom(_ room: CapturedRoom) -> [String: Any] {
    var walls: [[String: Any]] = []
    for (i, wall) in room.walls.enumerated() {
      walls.append([
        "id": "wall_\(i)",
        "width": Double(wall.dimensions.x),
        "height": Double(wall.dimensions.y),
        "angle": Double(atan2(wall.transform.columns.0.z, wall.transform.columns.0.x)),
        "center": [
          "x": Double(wall.transform.columns.3.x),
          "y": Double(wall.transform.columns.3.y),
          "z": Double(wall.transform.columns.3.z)
        ]
      ])
    }

    var doors: [[String: Any]] = []
    for (i, door) in room.doors.enumerated() {
      doors.append([
        "id": "door_\(i)",
        "width": Double(door.dimensions.x),
        "height": Double(door.dimensions.y),
        "angle": Double(atan2(door.transform.columns.0.z, door.transform.columns.0.x)),
        "center": [
          "x": Double(door.transform.columns.3.x),
          "y": Double(door.transform.columns.3.y),
          "z": Double(door.transform.columns.3.z)
        ]
      ])
    }

    var windows: [[String: Any]] = []
    for (i, window) in room.windows.enumerated() {
      windows.append([
        "id": "window_\(i)",
        "width": Double(window.dimensions.x),
        "height": Double(window.dimensions.y),
        "angle": Double(atan2(window.transform.columns.0.z, window.transform.columns.0.x)),
        "center": [
          "x": Double(window.transform.columns.3.x),
          "y": Double(window.transform.columns.3.y),
          "z": Double(window.transform.columns.3.z)
        ]
      ])
    }

    var objects: [[String: Any]] = []
    for (i, obj) in room.objects.enumerated() {
      objects.append([
        "id": "object_\(i)",
        "category": String(describing: obj.category),
        "width": Double(obj.dimensions.x),
        "height": Double(obj.dimensions.y),
        "depth": Double(obj.dimensions.z),
        "angle": Double(atan2(obj.transform.columns.0.z, obj.transform.columns.0.x)),
        "center": [
          "x": Double(obj.transform.columns.3.x),
          "y": Double(obj.transform.columns.3.y),
          "z": Double(obj.transform.columns.3.z)
        ]
      ])
    }

    // Calculate room dimensions using Oriented Bounding Box (OBB).
    // ARKit/RoomPlan world axes are rotated relative to the physical room if the user
    // starts the scan at an angle. Align to the room's dominant wall orientation
    // (4-fold rotational symmetry) to prevent rotated bounding box inflation.
    var sumX = 0.0
    var sumZ = 0.0
    for wall in room.walls {
      let len = Double(wall.dimensions.x)
      if len >= 0.35 {
        let angle = Double(atan2(wall.transform.columns.0.z, wall.transform.columns.0.x))
        sumX += len * cos(4.0 * angle)
        sumZ += len * sin(4.0 * angle)
      }
    }

    let dominantAngle = (abs(sumX) > 1e-4 || abs(sumZ) > 1e-4) ? (atan2(sumZ, sumX) / 4.0) : 0.0
    let cosDom = cos(-dominantAngle)
    let sinDom = sin(-dominantAngle)

    var minX = Double.infinity
    var maxX = -Double.infinity
    var minZ = Double.infinity
    var maxZ = -Double.infinity

    for wall in room.walls {
      let length = Double(wall.dimensions.x)
      let angle = Double(atan2(wall.transform.columns.0.z, wall.transform.columns.0.x)) - dominantAngle
      let rawCenterX = Double(wall.transform.columns.3.x)
      let rawCenterZ = Double(wall.transform.columns.3.z)

      let centerX = rawCenterX * cosDom - rawCenterZ * sinDom
      let centerZ = rawCenterX * sinDom + rawCenterZ * cosDom
      let halfX = abs(cos(angle)) * length / 2
      let halfZ = abs(sin(angle)) * length / 2

      minX = min(minX, centerX - halfX)
      maxX = max(maxX, centerX + halfX)
      minZ = min(minZ, centerZ - halfZ)
      maxZ = max(maxZ, centerZ + halfZ)
    }

    let hasWallBounds = minX.isFinite && maxX.isFinite && minZ.isFinite && maxZ.isFinite
    let roomLength = hasWallBounds ? max(0, maxX - minX) : 0
    let roomWidth = hasWallBounds ? max(0, maxZ - minZ) : 0
    // Prefer the tallest wall as ceiling height — first wall alone is often wrong.
    var roomHeight = room.walls.map { Double($0.dimensions.y) }.max() ?? 2.7
    if roomHeight <= 0 { roomHeight = 2.7 }

    // Documents survives longer than Caches; customizer needs this file through the wizard.
    var usdzPath: String? = nil
    var usdzExportError: String? = nil
    let docsRoot = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
      ?? FileManager.default.temporaryDirectory
    let scanDir = docsRoot.appendingPathComponent("WalkerRoomScans", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: scanDir, withIntermediateDirectories: true)
      let usdzURL = scanDir.appendingPathComponent("room_\(UUID().uuidString).usdz")
      try room.export(to: usdzURL, exportOptions: .model)
      usdzPath = usdzURL.path
    } catch {
      usdzExportError = error.localizedDescription
      NSLog("[RoomCapture] USDZ export failed: \(error.localizedDescription)")
    }

    let wallCount = room.walls.count
    var qualityWarnings: [String] = []
    if wallCount < 3 {
      qualityWarnings.append("Fewer than 3 walls were captured — rescan slowly around the full room.")
    }
    if roomLength < 1.5 || roomWidth < 1.5 {
      qualityWarnings.append("Room footprint looks too small — walk closer to each wall and rescan.")
    }
    if roomHeight < 2.0 || roomHeight > 4.5 {
      qualityWarnings.append("Ceiling height looks unusual — include the ceiling while scanning.")
    }
    if usdzPath == nil {
      qualityWarnings.append("3D mesh export failed — rescan to unlock the interactive room model.")
    }

    return [
      "walls": walls,
      "doors": doors,
      "windows": windows,
      "objects": objects,
      "roomDimensions": [
        "length": roomLength,
        "width": roomWidth,
        "height": roomHeight,
        "area": roomLength * roomWidth
      ],
      "usdzFilePath": usdzPath as Any,
      "usdzExportError": usdzExportError as Any,
      "scanMode": "roomplan",
      "hasUsdz": usdzPath != nil,
      "scanQuality": [
        "wallCount": wallCount,
        "doorCount": room.doors.count,
        "windowCount": room.windows.count,
        "objectCount": room.objects.count,
        "hasUsdz": usdzPath != nil,
        "warnings": qualityWarnings,
      ],
      "isMock": false
    ]
  }
  #endif
}

// MARK: - RoomCaptureView Delegate

#if canImport(RoomPlan)
@available(iOS 16.0, *)
extension RoomCaptureViewController: RoomCaptureViewDelegate {
  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: (any Error)?) -> Bool {
    if let error = error {
      stopSession()
      dismiss(animated: true) { [weak self] in
        self?.onScanError?(error.localizedDescription)
      }
      return false
    }

    Task { [weak self] in
      guard let self = self else { return }
      let builder = RoomBuilder(options: [.beautifyObjects])
      do {
        let room = try await builder.capturedRoom(from: roomDataForProcessing)
        let serialized = self.serializeCapturedRoom(room)
        await MainActor.run {
          self.stopSession()
          self.dismiss(animated: true) {
            self.onScanCompleted?(serialized)
          }
        }
      } catch {
        await MainActor.run {
          self.stopSession()
          self.dismiss(animated: true) {
            self.onScanError?(error.localizedDescription)
          }
        }
      }
    }
    return false
  }
}
#endif
