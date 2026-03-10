import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate {
  private var pendingApnsResult: FlutterResult?
  private var cachedApnsToken: String?
  private var apnsChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    UNUserNotificationCenter.current().delegate = self

    GeneratedPluginRegistrant.register(with: self)
    setupApnsChannel()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  private func setupApnsChannel() {
    guard let registrar = registrar(forPlugin: "NotifyXApnsBridge") else {
      return
    }

    let channel = FlutterMethodChannel(
      name: "notifyx/apns",
      binaryMessenger: registrar.messenger()
    )

    channel.setMethodCallHandler { [weak self] call, result in
      guard let self else {
        result(
          FlutterError(
            code: "app_delegate_missing",
            message: "AppDelegate deallocated before APNs token request completed.",
            details: nil
          )
        )
        return
      }

      switch call.method {
      case "getApnsToken":
        self.getApnsToken(result: result)
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    apnsChannel = channel
  }

  private func getApnsToken(result: @escaping FlutterResult) {
    if pendingApnsResult != nil {
      result(
        FlutterError(
          code: "apns_request_in_progress",
          message: "APNs token request already in progress.",
          details: nil
        )
      )
      return
    }

    pendingApnsResult = result

    UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
      guard let self else { return }

      switch settings.authorizationStatus {
      case .authorized, .provisional, .ephemeral:
        if settings.alertSetting == .disabled {
          self.resolvePendingApns(
            withError: FlutterError(
              code: "apns_alerts_disabled",
              message: "Notifications are authorized but alerts are disabled. Enable Banners/Alerts in iOS Settings.",
              details: nil
            )
          )
          return
        }

        if let token = self.cachedApnsToken {
          self.resolvePendingApns(withToken: token)
          return
        }

        DispatchQueue.main.async {
          UIApplication.shared.registerForRemoteNotifications()
        }

      case .notDetermined:
        self.requestAuthorizationAndRegisterForApns()

      case .denied:
        self.resolvePendingApns(
          withError: FlutterError(
            code: "apns_permission_denied",
            message: "Notification permission denied on iOS. Enable notifications in Settings and retry.",
            details: nil
          )
        )

      @unknown default:
        self.resolvePendingApns(
          withError: FlutterError(
            code: "apns_permission_unknown",
            message: "Unable to determine iOS notification authorization status.",
            details: nil
          )
        )
      }
    }
  }

  private func requestAuthorizationAndRegisterForApns() {
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) {
      [weak self] granted, error in
      guard let self else { return }

      if let error {
        self.resolvePendingApns(
          withError: FlutterError(
            code: "apns_permission_error",
            message: "Failed to request iOS notification permission.",
            details: error.localizedDescription
          )
        )
        return
      }

      if !granted {
        self.resolvePendingApns(
          withError: FlutterError(
            code: "apns_permission_denied",
            message: "Notification permission denied on iOS.",
            details: nil
          )
        )
        return
      }

      DispatchQueue.main.async {
        UIApplication.shared.registerForRemoteNotifications()
      }
    }
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
    cachedApnsToken = token
    resolvePendingApns(withToken: token)
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    resolvePendingApns(
      withError: FlutterError(
        code: "apns_registration_failed",
        message: "Failed to register for APNs.",
        details: error.localizedDescription
      )
    )
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

  private func resolvePendingApns(withToken token: String) {
    guard let result = pendingApnsResult else { return }
    pendingApnsResult = nil
    result(token)
  }

  private func resolvePendingApns(withError error: FlutterError) {
    guard let result = pendingApnsResult else { return }
    pendingApnsResult = nil
    result(error)
  }

  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound, .badge])
  }
}
