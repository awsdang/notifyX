import UIKit
import UserNotifications
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  private let apnsTokenKey = "notifyx_apns_token"
  private let apnsErrorKey = "notifyx_apns_error"

  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    configurePushRegistration(application)

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "react_native_notification_test",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    UserDefaults.standard.set(token, forKey: apnsTokenKey)
    UserDefaults.standard.removeObject(forKey: apnsErrorKey)
    print("[NotifyX Demo] APNS token:", token)
  }

  func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    UserDefaults.standard.removeObject(forKey: apnsTokenKey)
    UserDefaults.standard.set(error.localizedDescription, forKey: apnsErrorKey)
    print("[NotifyX Demo] APNS registration failed:", error.localizedDescription)
  }

  private func configurePushRegistration(_ application: UIApplication) {
    let center = UNUserNotificationCenter.current()
    center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
      DispatchQueue.main.async {
        if let error {
          UserDefaults.standard.set(error.localizedDescription, forKey: self.apnsErrorKey)
          return
        }

        if granted {
          application.registerForRemoteNotifications()
        } else {
          UserDefaults.standard.set("Notification permission denied", forKey: self.apnsErrorKey)
        }
      }
    }
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
