import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class NotifyXStateManager {
  final String storageKeyPrefix;

  NotifyXStateManager(String appId)
    : storageKeyPrefix = 'notifyx:flutter:$appId';

  Future<void> saveState(Map<String, dynamic> state) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(storageKeyPrefix, jsonEncode(state));
  }

  Future<Map<String, dynamic>?> getState() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(storageKeyPrefix);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (e) {
      return null;
    }
  }

  Future<void> clearState() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(storageKeyPrefix);
  }
}
