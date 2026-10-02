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

  // NOTE: Future iOS versions may require UIScene lifecycle. Migrating RN's
  // root window to a SceneDelegate is deferred until Apple enforces it, to
  // avoid destabilizing the current TestFlight build path.

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    // If UIScene lifecycle is not active (e.g. earlier iOS or fallback), initialize window directly
    if #available(iOS 13.0, *) {
      // SceneDelegate will handle window creation and factory.startReactNative via scene willConnectTo
    } else {
      window = UIWindow(frame: UIScreen.main.bounds)
      factory.startReactNative(
        withModuleName: "WalkerAI",
        in: window,
        launchOptions: launchOptions
      )
    }

    // Wire up notification handling. JS calls into the WalkerPush native
    // module after sign-in to request permission and register for remote
    // notifications. Apple then invokes didRegisterForRemoteNotifications-
    // WithDeviceToken below; we post a notification that the JS-side
    // event emitter listens for and forwards to the push library.
    UNUserNotificationCenter.current().delegate = self

    return true
  }

  // MARK: - UISceneSession Lifecycle

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }

  // MARK: - Deep Linking & Custom URL Schemes

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    NSLog("[DeepLink] Received URL: \(url.absoluteString)")
    if url.scheme == "walkerai" {
      WalkerInAppBrowser.dismissCurrent(withURL: url)
    }
    return RCTLinkingManager.application(app, open: url, options: options)
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
