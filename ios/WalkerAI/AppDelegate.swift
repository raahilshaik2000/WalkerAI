import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "WalkerAI",
      in: window,
      launchOptions: launchOptions
    )

    // Wire up notification handling. JS calls into the WalkerPush native
    // module after sign-in to request permission and register for remote
    // notifications. Apple then invokes didRegisterForRemoteNotifications-
    // WithDeviceToken below; we post a notification that the JS-side
    // event emitter listens for and forwards to the push library.
    UNUserNotificationCenter.current().delegate = self

    return true
  }

  // MARK: - APNs Registration

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    // Apple gives us raw bytes; the APNs HTTP/2 endpoint wants the hex form.
    let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    NSLog("[Push] APNs token received: \(token)")
    NotificationCenter.default.post(
      name: Notification.Name("WalkerAPNsTokenReceived"),
      object: nil,
      userInfo: ["token": token]
    )
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    NSLog("[Push] APNs registration failed: \(error.localizedDescription)")
    NotificationCenter.default.post(
      name: Notification.Name("WalkerAPNsRegistrationFailed"),
      object: nil,
      userInfo: ["error": error.localizedDescription]
    )
  }

  // MARK: - UNUserNotificationCenterDelegate

  // Show notifications even when the app is in the foreground.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler:
      @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .badge, .list])
  }

  // Forward notification taps to JS so it can deep-link into the relevant screen.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let userInfo = response.notification.request.content.userInfo
    NotificationCenter.default.post(
      name: Notification.Name("WalkerNotificationTapped"),
      object: nil,
      userInfo: ["data": userInfo]
    )
    completionHandler()
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
