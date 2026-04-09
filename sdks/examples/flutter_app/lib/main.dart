import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:notifyx/notifyx.dart';
import 'package:url_launcher/url_launcher.dart';

const String _appId = '6feb573a-cff9-4759-84fb-3394ac538068';
const String _apiKey = 'nk_live_XxMcjTOgU4viSIQ0-rlIczDG3ZhWC6Ca';
const String _baseUrl = 'https://iu8nuqgn5i0v.share.zrok.io';
const String _manualPushToken = '';
const String _manualProvider = 'fcm';
bool _firebaseReady = false;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (Platform.isAndroid) {
    try {
      await Firebase.initializeApp();
      _firebaseReady = true;
    } catch (e) {
      debugPrint(
        'Firebase init failed on Android (check google-services.json): $e',
      );
    }
  }

  runApp(const NotifyXExampleApp());
}

class NotifyXExampleApp extends StatelessWidget {
  const NotifyXExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NotifyX SDK Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6366F1)),
        useMaterial3: true,
      ),
      home: const DemoHomePage(),
    );
  }
}

class _PushTokenResult {
  final String? token;
  final String? provider;
  final String? errorMessage;

  const _PushTokenResult.success({required this.token, required this.provider})
    : errorMessage = null;

  const _PushTokenResult.error(this.errorMessage)
    : token = null,
      provider = null;

  bool get hasToken => token != null && provider != null;
}

class DemoHomePage extends StatefulWidget {
  const DemoHomePage({super.key});

  @override
  State<DemoHomePage> createState() => _DemoHomePageState();
}

class _DemoHomePageState extends State<DemoHomePage> {
  late final NotifyX _notifyX;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _notificationOpenedSub;

  String _status = 'Not initialized';
  Map<String, dynamic>? _sdkState;

  @override
  void initState() {
    super.initState();
    _notifyX = NotifyX(
      appId: _appId,
      baseUrl: _baseUrl,
      apiKey: _apiKey,
      debug: true,
    );
    unawaited(_initializePage());
  }

  @override
  void dispose() {
    _tokenRefreshSub?.cancel();
    _notificationOpenedSub?.cancel();
    super.dispose();
  }

  Future<void> _initializePage() async {
    await _loadState();
    if (Platform.isIOS) {
      await _setupApnsNotificationOpenHandler();
      return;
    }

    if (Platform.isAndroid) {
      final firebaseInitialized = await _ensureFirebaseInitialized();
      if (!firebaseInitialized) {
        return;
      }

      await _setupNotificationOpenHandlers();
      _setupTokenRefreshHandler();
    }
  }

  Future<bool> _ensureFirebaseInitialized() async {
    if (!Platform.isAndroid) {
      return false;
    }

    if (_firebaseReady || Firebase.apps.isNotEmpty) {
      _firebaseReady = true;
      return true;
    }

    try {
      await Firebase.initializeApp();
      _firebaseReady = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  Future<void> _loadState() async {
    final state = await _notifyX.getState();
    if (!mounted) return;

    setState(() {
      _sdkState = state;
      _status = state != null
          ? 'Initialized (User: ${state['externalUserId']})'
          : 'Not initialized';
    });
  }

  void _setStatus(String status) {
    if (!mounted) return;
    setState(() => _status = status);
  }

  String _platformValue() {
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return Platform.operatingSystem;
  }

  Future<void> _openFromActionPayload(
    NotificationActionPayload payload,
    String source,
  ) async {
    final opened = await _notifyX.openNotificationAction(payload, (url) async {
      final uri = Uri.tryParse(url);
      if (uri == null) {
        throw Exception('Invalid URL: $url');
      }

      final launched = await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );
      if (!launched) {
        throw Exception('Could not launch URL: $url');
      }
    });

    if (!opened) {
      _setStatus('Notification opened from $source, but no actionUrl found.');
      return;
    }

    _setStatus('Notification opened link from $source.');
  }

  Future<void> _openFromRemoteMessage(
    RemoteMessage remoteMessage,
    String source,
  ) async {
    await _openFromActionPayload(
      NotificationActionPayload(
        data: Map<String, dynamic>.from(remoteMessage.data),
      ),
      source,
    );
  }

  Future<void> _setupApnsNotificationOpenHandler() async {
    if (!Platform.isIOS) {
      return;
    }

    await _notifyX.configureApnsNotificationOpenHandler((payload) async {
      await _openFromActionPayload(payload, 'ios_apns');
    });
  }

  Future<void> _setupNotificationOpenHandlers() async {
    if (!Platform.isAndroid) {
      return;
    }

    try {
      final initialMessage = await FirebaseMessaging.instance
          .getInitialMessage();
      if (initialMessage != null) {
        await _openFromRemoteMessage(initialMessage, 'cold_start');
      }
    } catch (_) {
      // Ignore startup notification parsing failures in example app.
    }

    _notificationOpenedSub = FirebaseMessaging.onMessageOpenedApp.listen((
      remoteMessage,
    ) {
      unawaited(_openFromRemoteMessage(remoteMessage, 'background'));
    });
  }

  void _setupTokenRefreshHandler() {
    if (!Platform.isAndroid) {
      return;
    }

    _tokenRefreshSub = FirebaseMessaging.instance.onTokenRefresh.listen((
      token,
    ) {
      unawaited(_registerRefreshedToken(token));
    });
  }

  Future<void> _registerRefreshedToken(String token) async {
    final normalized = token.trim();
    if (normalized.isEmpty) {
      return;
    }

    debugPrint('FCM token refreshed: $normalized');

    try {
      final state = await _notifyX.getState();
      final userId = state?['userId']?.toString();
      if (userId == null || userId.isEmpty) {
        return;
      }

      await _notifyX.registerDevice(
        userId: userId,
        pushToken: normalized,
        platform: _platformValue(),
        provider: 'fcm',
      );
      await _loadState();
      _setStatus('FCM token refreshed and device registered.');
    } catch (e) {
      _setStatus(
        'FCM token refresh received but device registration failed: $e',
      );
    }
  }

  Future<String> _fetchFcmToken() async {
    await FirebaseMessaging.instance.setAutoInitEnabled(true);

    Object? lastError;
    const retryDelaysMs = [0, 1500, 3000, 5000];

    for (final delayMs in retryDelaysMs) {
      if (delayMs > 0) {
        await Future<void>.delayed(Duration(milliseconds: delayMs));
      }

      try {
        final token = await FirebaseMessaging.instance.getToken();
        final normalized = token?.trim();
        if (normalized != null && normalized.isNotEmpty) {
          return normalized;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError != null) {
      throw Exception(lastError.toString());
    }

    throw Exception('FCM token was empty after retries.');
  }

  Future<String> _fetchApnsToken() async {
    return _notifyX.getApnsToken();
  }

  Future<_PushTokenResult> _getPushTokenAndProvider() async {
    try {
      final manualToken = _manualPushToken.trim();
      if (manualToken.isNotEmpty) {
        return _PushTokenResult.success(
          token: manualToken,
          provider: _manualProvider,
        );
      }

      if (Platform.isIOS) {
        final token = await _fetchApnsToken();
        debugPrint('APNS token fetched: $token');
        return _PushTokenResult.success(token: token, provider: 'apns');
      }

      if (Platform.isAndroid) {
        final firebaseInitialized = await _ensureFirebaseInitialized();
        if (!firebaseInitialized) {
          return _PushTokenResult.error(
            'FCM setup is not ready on Android. Verify google-services.json and Firebase Cloud Messaging configuration, then rebuild the app.',
          );
        }

        final settings = await FirebaseMessaging.instance.requestPermission(
          alert: true,
          badge: true,
          sound: true,
          provisional: false,
        );

        if (Platform.isIOS) {
          final hasAlerts = settings.alert == AppleNotificationSetting.enabled;
          if (settings.authorizationStatus != AuthorizationStatus.authorized ||
              !hasAlerts) {
            return _PushTokenResult.error(
              'iOS notifications are not fully enabled for alerts. Open iOS Settings > Notifications > NotifyX Demo and enable Allow Notifications + Banners + Sounds, then retry.',
            );
          }
        } else {
          final enabled =
              settings.authorizationStatus == AuthorizationStatus.authorized ||
              settings.authorizationStatus == AuthorizationStatus.provisional;
          if (!enabled) {
            return const _PushTokenResult.error(
              'Notification permission denied on Android.',
            );
          }
        }

        final token = await _fetchFcmToken();
        if (token.isEmpty) {
          return const _PushTokenResult.error('Failed to fetch FCM token.');
        }

        debugPrint('FCM token fetched: $token');
        return _PushTokenResult.success(token: token, provider: 'fcm');
      }

      return _PushTokenResult.error(
        'Unsupported platform: ${Platform.operatingSystem}',
      );
    } catch (error) {
      final message = error.toString();
      if (Platform.isAndroid && message.contains('SERVICE_NOT_AVAILABLE')) {
        return const _PushTokenResult.error(
          'FCM unavailable (SERVICE_NOT_AVAILABLE). Use a Play Store emulator or a real device with Google Play Services + internet, then retry.',
        );
      }

      if (Platform.isAndroid) {
        return _PushTokenResult.error(
          'Android FCM setup error: $message. Verify google-services.json and Firebase Cloud Messaging setup.',
        );
      }

      if (Platform.isIOS) {
        return _PushTokenResult.error(
          'iOS APNs setup error: $message. Verify Push Notifications capability, valid provisioning profile, and APNs key/certificate in Apple Developer account.',
        );
      }

      return _PushTokenResult.error('Failed to get push token: $message');
    }
  }

  Future<void> _handleInit() async {
    _setStatus('Initializing...');

    try {
      final tokenResult = await _getPushTokenAndProvider();
      final externalUserId =
          'demo-user-${DateTime.now().millisecondsSinceEpoch}';

      if (!tokenResult.hasToken) {
        await _notifyX.init(externalUserId: externalUserId);
        await _loadState();
        _setStatus('SDK initialized (user only). ${tokenResult.errorMessage}');
        return;
      }

      await _notifyX.init(
        externalUserId: externalUserId,
        pushToken: tokenResult.token,
        platform: _platformValue(),
        provider: tokenResult.provider,
      );

      await _loadState();
      _setStatus('Success! Init complete with device registration.');
    } catch (error) {
      _setStatus('Init failed: $error');
    }
  }

  Future<void> _handleTestPush() async {
    _setStatus('Sending test push to provider...');
    try {
      final result = await _notifyX.sendTestNotification(
        title: 'Hello from Flutter!',
        body: 'This push notification was triggered by the Flutter SDK.',
        image: 'https://picsum.photos/900/420',
        actionUrl: 'https://google.com',
        actions: [
          {
            'action': 'open_link_primary',
            'title': 'Open Offer',
            'url': 'https://google.com/search?q=offer',
          },
          {
            'action': 'open_link_secondary',
            'title': 'Open Help',
            'url': 'https://google.com/search?q=help',
          },
        ],
      );
      final provider =
          result is Map<String, dynamic> && result['provider'] != null
          ? ' (${result['provider']})'
          : '';
      _setStatus('Test push sent successfully$provider.');
    } catch (error) {
      _setStatus('Failed to send test push: $error');
    }
  }

  Future<void> _handleClearState() async {
    await _notifyX.clearState();
    await _loadState();
    _setStatus('State cleared. Need to re-initialize.');
  }

  @override
  Widget build(BuildContext context) {
    final hasDevice = _sdkState?['deviceId'] != null;

    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
      appBar: AppBar(
        title: const Text('NotifyX Demo'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                decoration: BoxDecoration(
                  color: const Color(0xFFE5E7EB),
                  borderRadius: BorderRadius.circular(8),
                ),
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Status:\n$_status',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF1F2937),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              if (_sdkState != null) ...[
                Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF1F2937),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    'Current SDK State:\n${_sdkState.toString()}',
                    style: const TextStyle(color: Color(0xFF10B981)),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              ElevatedButton(
                onPressed: _handleInit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF6366F1),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('Initialize SDK (Registers User & Device)'),
              ),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: hasDevice ? _handleTestPush : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF6366F1),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('Send Test Notification'),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _handleClearState,
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFF6366F1)),
                  foregroundColor: const Color(0xFF6366F1),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text('Clear Local State'),
              ),
              const SizedBox(height: 24),
              const Text(
                'Note: Android uses FCM and iOS uses APNS in this demo. Notification taps resolve CTA/default URLs and open them externally.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
