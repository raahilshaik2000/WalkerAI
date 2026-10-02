import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = (scene as? UIWindowScene) else { return }

    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let win = UIWindow(windowScene: windowScene)
    self.window = win
    appDelegate.window = win

    factory.startReactNative(
      withModuleName: "WalkerAI",
      in: win
    )

    win.makeKeyAndVisible()

    // Handle deep links passed on launch via Scene connectionOptions
    if let urlContext = connectionOptions.urlContexts.first {
      _ = appDelegate.application(
        UIApplication.shared,
        open: urlContext.url,
        options: [:]
      )
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }
    _ = appDelegate.application(
      UIApplication.shared,
      open: url,
      options: [:]
    )
  }
}
