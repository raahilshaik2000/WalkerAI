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
  private var finalRoomData: CapturedRoomData?
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

  // MARK: - Setup

  #if canImport(RoomPlan)
  private func setupRoomCaptureView() {
    roomCaptureView = RoomCaptureView(frame: view.bounds)
    roomCaptureView.captureSession.delegate = self
    roomCaptureView.delegate = self
    roomCaptureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(roomCaptureView)
  }

  private func startSession() {
    captureSessionConfig = RoomCaptureSession.Configuration()
    roomCaptureView.captureSession.run(configuration: captureSessionConfig)
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
    roomCaptureView.captureSession.stop()
    #endif
  }

  @objc private func cancelTapped() {
    #if canImport(RoomPlan)
    roomCaptureView.captureSession.stop()
    #endif
    dismiss(animated: true) { [weak self] in
      self?.onScanCancelled?()
    }
  }

  func finishScan() {
    #if canImport(RoomPlan)
    roomCaptureView.captureSession.stop()
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
        "center": [
          "x": Double(obj.transform.columns.3.x),
          "y": Double(obj.transform.columns.3.y),
          "z": Double(obj.transform.columns.3.z)
        ]
      ])
    }

    // Calculate room dimensions from wall extents
    let allX = room.walls.map { Double($0.transform.columns.3.x) }
    let allZ = room.walls.map { Double($0.transform.columns.3.z) }
    let roomLength = (allX.max() ?? 0) - (allX.min() ?? 0) + Double(room.walls.first?.dimensions.x ?? 0)
    let roomWidth = (allZ.max() ?? 0) - (allZ.min() ?? 0) + Double(room.walls.first?.dimensions.x ?? 0)
    let roomHeight = Double(room.walls.first?.dimensions.y ?? 2.7)

    // Export USDZ
    var usdzPath: String? = nil
    let tempDir = FileManager.default.temporaryDirectory
    let usdzURL = tempDir.appendingPathComponent("room_scan_\(Int(Date().timeIntervalSince1970)).usdz")
    do {
      try room.export(to: usdzURL, exportOptions: .model)
      usdzPath = usdzURL.path
    } catch {
      print("USDZ export failed: \(error)")
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
      "isMock": false
    ]
  }
  #endif
}

// MARK: - RoomCaptureSession Delegate

#if canImport(RoomPlan)
@available(iOS 16.0, *)
extension RoomCaptureViewController: RoomCaptureSessionDelegate {
  func captureSession(_ session: RoomCaptureSession, didEndWith data: CapturedRoomData, error: (any Error)?) {
    if let error = error {
      dismiss(animated: true) { [weak self] in
        self?.onScanError?(error.localizedDescription)
      }
      return
    }

    // Use the data stored from captureView delegate, or the one passed here
    let roomData = finalRoomData ?? data

    // Build CapturedRoom from CapturedRoomData using RoomBuilder
    Task { [weak self] in
      guard let self = self else { return }
      let builder = RoomBuilder(options: [.beautifyObjects])
      do {
        let room = try await builder.capturedRoom(from: roomData)
        let serialized = self.serializeCapturedRoom(room)
        await MainActor.run {
          self.dismiss(animated: true) {
            self.onScanCompleted?(serialized)
          }
        }
      } catch {
        await MainActor.run {
          self.dismiss(animated: true) {
            self.onScanError?(error.localizedDescription)
          }
        }
      }
    }
  }
}

// MARK: - RoomCaptureView Delegate

@available(iOS 16.0, *)
extension RoomCaptureViewController: RoomCaptureViewDelegate {
  func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: (any Error)?) -> Bool {
    // Store the captured room data for processing in didEndWith
    finalRoomData = roomDataForProcessing
    // Return false to skip Apple's built-in post-processing screen
    return false
  }
}
#endif
