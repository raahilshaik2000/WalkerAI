import Foundation
import SafariServices
import UIKit
import React

@objc(WalkerInAppBrowser)
class WalkerInAppBrowser: NSObject, SFSafariViewControllerDelegate {
  private static var currentSafariVC: SFSafariViewController?
  private static var activeResolve: RCTPromiseResolveBlock?

  @objc static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc func openURL(
    _ urlString: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      guard let url = URL(string: urlString) else {
        reject("invalid_url", "The provided URL is invalid.", nil)
        return
      }

      guard let rootVC = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows })
        .first(where: { $0.isKeyWindow })?.rootViewController else {
        reject("no_root_vc", "Could not find root view controller.", nil)
        return
      }

      var topVC = rootVC
      while let presented = topVC.presentedViewController {
        topVC = presented
      }

      let config = SFSafariViewController.Configuration()
      config.entersReaderIfAvailable = false
      config.barCollapsingEnabled = true

      let safariVC = SFSafariViewController(url: url, configuration: config)
      safariVC.delegate = self
      safariVC.preferredControlTintColor = UIColor(red: 1.0, green: 0.42, blue: 0.0, alpha: 1.0)
      safariVC.dismissButtonStyle = .close

      WalkerInAppBrowser.activeResolve = resolve
      WalkerInAppBrowser.currentSafariVC = safariVC
      topVC.present(safariVC, animated: true, completion: nil)
    }
  }

  @objc static func dismissCurrent(withURL url: URL? = nil) {
    DispatchQueue.main.async {
      if let safariVC = currentSafariVC {
        safariVC.dismiss(animated: true) {
          activeResolve?(["status": "success", "url": url?.absoluteString ?? ""])
          activeResolve = nil
          currentSafariVC = nil
        }
      } else if let resolve = activeResolve {
        resolve(["status": "success", "url": url?.absoluteString ?? ""])
        activeResolve = nil
      }
    }
  }

  @objc func close(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    WalkerInAppBrowser.dismissCurrent(withURL: nil)
    resolve(["status": "closed"])
  }

  func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
    WalkerInAppBrowser.activeResolve?(["status": "closed"])
    WalkerInAppBrowser.activeResolve = nil
    WalkerInAppBrowser.currentSafariVC = nil
  }
}
