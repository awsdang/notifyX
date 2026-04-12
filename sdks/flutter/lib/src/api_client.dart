import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class NotifyXApiClient {
  final String baseUrl;
  final String apiKey;

  NotifyXApiClient({required String baseUrl, required this.apiKey})
    : baseUrl = baseUrl.replaceAll(RegExp(r'/$'), '');

  void _log(String message) {
    if (kDebugMode) {
      debugPrint('[NotifyX API] $message');
    }
  }

  Future<Map<String, dynamic>> post(
    String path, {
    required Map<String, dynamic> body,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    _log('POST $uri body=$body');
    final response = await http.post(
      uri,
      headers: {'Content-Type': 'application/json', 'x-api-key': apiKey},
      body: jsonEncode(body),
    );
    _log('RESPONSE status=${response.statusCode} uri=$uri body=${response.body}');

    Map<String, dynamic> jsonResponse;
    try {
      jsonResponse = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      jsonResponse = {
        'error': true,
        'message': 'Invalid JSON response',
        'data': null,
      };
    }

    if (response.statusCode < 200 ||
        response.statusCode >= 300 ||
        jsonResponse['error'] == true) {
      throw Exception(
        jsonResponse['message'] ??
            'Request failed with status ${response.statusCode}',
      );
    }

    return jsonResponse;
  }
}
