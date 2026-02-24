library notifyx;

import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'src/api_client.dart';
import 'src/state_manager.dart';
import 'src/models.dart';

export 'src/models.dart';

class NotifyX {
  final String appId;
  final String baseUrl;
  final String apiKey;
  final bool debug;

  late final NotifyXApiClient _apiClient;
  late final NotifyXStateManager _stateManager;

  NotifyX({
    required this.appId,
    required this.baseUrl,
    required this.apiKey,
    this.debug = false,
  }) {
    if (appId.trim().isEmpty ||
        baseUrl.trim().isEmpty ||
        apiKey.trim().isEmpty) {
      throw ArgumentError('NotifyX requires baseUrl, apiKey, and appId');
    }
    _apiClient = NotifyXApiClient(baseUrl: baseUrl, apiKey: apiKey);
    _stateManager = NotifyXStateManager(appId);
  }

  void _log(String message, [Object? data]) {
    if (debug) {
      if (kDebugMode) {
        print('[NotifyX SDK] $message ${data ?? ''}');
      }
    }
  }

  /// Retrieves the current saved state.
  Future<Map<String, dynamic>?> getState() async {
    return _stateManager.getState();
  }

  /// Clears the local SDK state.
  Future<void> clearState() async {
    await _stateManager.clearState();
    _log('SDK state cleared.');
  }

  String? _toOptionalTrimmedString(Object? value) {
    if (value is! String) return null;
    final trimmed = value.trim();
    return trimmed.isEmpty ? null : trimmed;
  }

  String? resolveNotificationActionUrl(NotificationActionPayload? payload) {
    final data = payload?.data;
    if (data == null) return null;

    final actionId = _toOptionalTrimmedString(payload?.actionId);
    if (actionId != null) {
      final actionSpecificUrl =
          _toOptionalTrimmedString(data['actionUrl_$actionId']);
      if (actionSpecificUrl != null) return actionSpecificUrl;
    }

    final defaultActionUrl = _toOptionalTrimmedString(data['actionUrl']);
    if (defaultActionUrl != null) return defaultActionUrl;

    final fallbackPrimary =
        _toOptionalTrimmedString(data['actionUrl_open_link_primary']);
    if (fallbackPrimary != null) return fallbackPrimary;

    final rawActions = _toOptionalTrimmedString(data['actions']);
    if (rawActions == null) return null;

    try {
      final parsed = jsonDecode(rawActions);
      if (parsed is! List) return null;

      for (final item in parsed) {
        if (item is! Map) continue;
        final action = Map<String, dynamic>.from(item);

        if (actionId != null) {
          final parsedActionId = _toOptionalTrimmedString(action['action']);
          final parsedActionUrl = _toOptionalTrimmedString(action['url']);
          if (parsedActionId == actionId && parsedActionUrl != null) {
            return parsedActionUrl;
          }
        }

        final firstUrl = _toOptionalTrimmedString(action['url']);
        if (firstUrl != null) return firstUrl;
      }
    } catch (_) {
      // Ignore malformed actions payload.
    }

    return null;
  }

  Future<bool> openNotificationAction(
    NotificationActionPayload? payload,
    Future<void> Function(String url) openUrl,
  ) async {
    final url = resolveNotificationActionUrl(payload);
    if (url == null) return false;

    await openUrl(url);
    return true;
  }

  /// Registers a user and a device in a single flow if the host app already has the pushToken.
  /// If [pushToken] is null, this will still register the user but not the device.
  Future<Map<String, dynamic>> init({
    required String externalUserId,
    String? language,
    String? timezone,
    String? pushToken,
    String? platform,
    String? provider,
  }) async {
    _log('Initializing NotifyX SDK...');

    final user = await registerUser(
      externalUserId: externalUserId,
      language: language,
      timezone: timezone,
    );

    NotifyXDevice? device;
    if (pushToken != null && platform != null && provider != null) {
      device = await registerDevice(
        userId: user.id,
        pushToken: pushToken,
        platform: platform,
        provider: provider,
      );
    }

    final state = {
      'userId': user.id,
      'externalUserId': externalUserId,
      if (device != null) 'deviceId': device.id,
      'initializedAt': DateTime.now().toIso8601String(),
    };

    await _stateManager.saveState(state);
    _log('SDK initialized ✅ — state saved', state);

    return {'user': user, if (device != null) 'device': device};
  }

  /// Registers a user.
  Future<NotifyXUser> registerUser({
    required String externalUserId,
    String? language,
    String? timezone,
  }) async {
    _log('Registering user: $externalUserId');
    final response = await _apiClient.post(
      '/api/v1/users',
      body: {
        'appId': appId,
        'externalUserId': externalUserId,
        'language': language ?? 'en',
        'timezone': timezone ?? 'UTC',
      },
    );
    return NotifyXUser.fromJson(response['data']);
  }

  /// Registers a device for the user.
  /// [platform] should be one of 'android', 'ios', 'huawei', 'web'.
  /// [provider] should be one of 'fcm', 'apns', 'hms', 'web'.
  Future<NotifyXDevice> registerDevice({
    required String userId,
    required String pushToken,
    required String platform,
    required String provider,
  }) async {
    _log('Registering device ($provider) for user $userId');
    final response = await _apiClient.post(
      '/api/v1/users/device',
      body: {
        'userId': userId,
        'pushToken': pushToken,
        'platform': platform,
        'provider': provider,
      },
    );

    final device = NotifyXDevice.fromJson(response['data']);

    // Update state to include deviceId if we have one
    final currentState = await _stateManager.getState() ?? {};
    currentState['deviceId'] = device.id;
    await _stateManager.saveState(currentState);

    return device;
  }

  /// Sends a test notification to the currently registered device.
  Future<dynamic> sendTestNotification({
    String? title,
    String? subtitle,
    String? body,
    String? image,
    String? icon,
    String? actionUrl,
    List<Map<String, dynamic>>? actions,
    Map<String, dynamic>? data,
  }) async {
    final state = await _stateManager.getState();
    if (state == null || state['deviceId'] == null) {
      throw Exception(
        'No registered device found. Call init or registerDevice first.',
      );
    }

    final payload = <String, dynamic>{
      'appId': appId,
      'deviceId': state['deviceId'],
      'title': title ?? 'NotifyX test',
      'body': body ?? 'Your Flutter SDK push is working ✅',
      'actionUrl': actionUrl ?? 'https://example.com',
      'data': data ?? {'source': 'notifyx-flutter-sdk'},
    };

    if (subtitle != null) payload['subtitle'] = subtitle;
    if (image != null) payload['image'] = image;
    if (icon != null) payload['icon'] = icon;
    if (actions != null) payload['actions'] = actions;

    _log('Sending test notification...');
    final response = await _apiClient.post(
      '/api/v1/notifications/test',
      body: payload,
    );
    _log('Test notification queued', response['data']);
    return response['data'];
  }
}
