import Foundation
import React
import UIKit
import UserNotifications

@objc(WalkerPushModule)
class WalkerPushModule: RCTEventEmitter {

  private var hasListeners = false

  override init() {
    super.init()
    // Subscribe to the NSNotifications AppDelegate posts when the OS calls
    // back with the APNs token (or registration failure, or a tapped
    // notification). We re-emit each as an RN event so the JS push service
    // can handle them without needing its own native code.
    NotificationCenter.default.addObserver(
      self, selector: #selector(onTokenReceived(_:)),
      name: Notification.Name("WalkerAPNsTokenReceived"), object: nil
    )
    NotificationCenter.default.addObserver(
      self, selector: #selector(onRegistrationFailed(_:)),
      name: Notification.Name("WalkerAPNsRegistrationFailed"), object: nil
    )
    NotificationCenter.default.addObserver(
      self, selector: #selector(onNotificationTapped(_:)),
      name: Notification.Name("WalkerNotificationTapped"), object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  override static func moduleName() -> String! {
    return "WalkerPushModule"
  }

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return ["apnsTokenReceived", "apnsRegistrationFailed", "notificationTapped"]
  }

  override func startObserving() {
    hasListeners = true
  }

  override func stopObserving() {
    hasListeners = false
  }

  // MARK: - JS API

  /// Asks the user for permission to send notifications. Returns the granted
  /// authorization status. JS should call this before registerForRemoteNotifications.
  @objc func requestPermissions(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let center = UNUserNotificationCenter.current()
    let options: UNAuthorizationOptions = [.alert, .badge, .sound]
    center.requestAuthorization(options: options) { granted, error in
      if let error = error {
        reject("PERMISSION_REQUEST_FAILED", error.localizedDescription, error)
        return
      }
      center.getNotificationSettings { settings in
        let status: String
        switch settings.authorizationStatus {
        case .authorized:    status = "authorized"
        case .provisional:   status = "provisional"
        case .ephemeral:     status = "ephemeral"
        case .denied:        status = "denied"
        case .notDetermined: status = "notDetermined"
        @unknown default:    status = "unknown"
        }
        resolve([
          "granted": granted,
          "status": status,
        ])
      }
    }
  }

  /// Triggers Apple's APNs registration on the main thread. The result comes
  /// back asynchronously as an `apnsTokenReceived` or `apnsRegistrationFailed`
  /// RN event (see AppDelegate callbacks).
  @objc func registerForRemoteNotifications(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      UIApplication.shared.registerForRemoteNotifications()
      resolve(["registered": true])
    }
  }

  /// Reads the current notification permission state without prompting.
  @objc func getPermissionStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      let status: String
      switch settings.authorizationStatus {
      case .authorized:    status = "authorized"
      case .provisional:   status = "provisional"
      case .ephemeral:     status = "ephemeral"
      case .denied:        status = "denied"
      case .notDetermined: status = "notDetermined"
      @unknown default:    status = "unknown"
      }
      resolve(["status": status])
    }
  }

  // MARK: - Internal: re-emit NSNotifications as RN events

  @objc private func onTokenReceived(_ note: Notification) {
    guard hasListeners,
          let token = note.userInfo?["token"] as? String else { return }
    sendEvent(withName: "apnsTokenReceived", body: ["token": token])
  }

  @objc private func onRegistrationFailed(_ note: Notification) {
    guard hasListeners else { return }
    let error = note.userInfo?["error"] as? String ?? "unknown"
    sendEvent(withName: "apnsRegistrationFailed", body: ["error": error])
  }

  @objc private func onNotificationTapped(_ note: Notification) {
    guard hasListeners,
          let data = note.userInfo?["data"] as? [AnyHashable: Any] else { return }
    sendEvent(withName: "notificationTapped", body: ["data": data])
  }
}
