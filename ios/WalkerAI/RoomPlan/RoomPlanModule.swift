import Foundation
import React

#if canImport(RoomPlan)
import RoomPlan
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
    resolve(["supported": false, "reason": "Room scanning requires a device with a LiDAR scanner. Simulators are not supported."])
    return
    #else
    if #available(iOS 16.0, *) {
      #if canImport(RoomPlan)
      let supported = RoomCaptureSession.isSupported
      resolve([
        "supported": supported,
        "reason": supported ? nil : "This device does not have a LiDAR scanner. Room scanning requires iPhone 12 Pro or newer."
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

        rootVC.present(captureVC, animated: true)
        resolve(["status": "scanning"])
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
        .rootViewController?.presentedViewController as? RoomCaptureViewController else {
          resolve(["status": "no_active_scan"])
          return
      }
      rootVC.finishScan()
      resolve(["status": "stopped"])
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
