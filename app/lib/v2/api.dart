import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class V2Api {
  V2Api({String? baseUrl, http.Client? client})
    : base =
          baseUrl ??
          (kIsWeb
              ? Uri.base.origin
              : const String.fromEnvironment(
                  'FAIR_API',
                  defaultValue: 'http://localhost:4310',
                )),
      _client = client ?? http.Client();
  final String base;
  final http.Client _client;

  Future<Map<String, dynamic>> _request(
    String path, {
    Map<String, dynamic>? body,
    String? key,
  }) async {
    final uri = Uri.parse('$base$path');
    final headers = <String, String>{'content-type': 'application/json'};
    if (key != null) headers['Idempotency-Key'] = key;
    final response =
        await (body == null
                ? _client.get(uri)
                : _client.post(uri, headers: headers, body: jsonEncode(body)))
            .timeout(const Duration(seconds: 30));
    Object? data;
    try {
      data = jsonDecode(utf8.decode(response.bodyBytes));
    } catch (_) {
      /* Handle a non-JSON server failure below. */
    }
    if (response.statusCode >= 400) {
      final error = data is Map ? data['error'] : null;
      throw V2ApiException(
        error is Map
            ? '${error['message'] ?? 'Request failed'}'
            : error is String
            ? error
            : 'Studio request failed (HTTP ${response.statusCode}).',
      );
    }
    if (data is! Map<String, dynamic>) {
      throw const V2ApiException('The studio returned an invalid response.');
    }
    return data;
  }

  Future<Map<String, dynamic>> config() => _request('/api/v2/config');
  Future<List<V2Job>> jobs() async =>
      ((await _request('/api/v2/jobs'))['jobs'] as List? ?? [])
          .whereType<Map>()
          .map(V2Job.fromJson)
          .toList();
  Future<V2Job> job(String id) async => V2Job.fromJson(
    (await _request('/api/v2/jobs/${Uri.encodeComponent(id)}'))['job'] as Map,
  );
  Future<V2Job> create(Map<String, dynamic> brief, String key) async =>
      V2Job.fromJson(
        (await _request('/api/v2/jobs', body: brief, key: key))['job'] as Map,
      );
  Future<V2Job> action(String id, String action) async {
    if (!{'retry', 'cancel'}.contains(action)) {
      throw ArgumentError.value(action, 'action');
    }
    return V2Job.fromJson(
      (await _request(
            '/api/v2/jobs/${Uri.encodeComponent(id)}/$action',
            body: {},
          ))['job']
          as Map,
    );
  }

  Future<V2Job> review(String id, String decision, String note) async =>
      V2Job.fromJson(
        (await _request(
              '/api/v2/jobs/${Uri.encodeComponent(id)}/review',
              body: {'decision': decision, 'note': note},
            ))['job']
            as Map,
      );

  Uri artifact(String path) {
    final origin = Uri.parse(base);
    final uri = origin.resolve(path);
    if (uri.origin != origin.origin || !uri.path.startsWith('/api/v2/jobs/')) {
      throw const V2ApiException('The artifact URL is not from this studio.');
    }
    return uri;
  }

  void dispose() => _client.close();
}

class V2ApiException implements Exception {
  const V2ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

String v2RequestKey() {
  final random = Random.secure();
  final bytes = List.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final h = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

class V2Job {
  V2Job.fromJson(Map data) : raw = Map<String, dynamic>.from(data);
  final Map<String, dynamic> raw;
  String get id => '${raw['id'] ?? ''}';
  String get status => '${raw['status'] ?? 'unknown'}';
  String get stage => '${raw['stage'] ?? 'queued'}';
  String get message => '${raw['message'] ?? ''}';
  String? get error => raw['error'] is String ? raw['error'] as String : null;
  Map<String, dynamic> get brief =>
      Map<String, dynamic>.from(raw['brief'] as Map? ?? {});
  Map<String, dynamic>? get report => raw['report'] is Map
      ? Map<String, dynamic>.from(raw['report'] as Map)
      : null;
  Map<String, dynamic>? get review => raw['review'] is Map
      ? Map<String, dynamic>.from(raw['review'] as Map)
      : null;
  Map<String, String> get artifacts => (raw['artifacts'] as Map? ?? {}).map(
    (key, value) => MapEntry('$key', '$value'),
  );
  List<Map<String, dynamic>> get events => (raw['events'] as List? ?? [])
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .toList();
  bool get active => status == 'queued' || status == 'running';
  bool get completed => status == 'completed';
  bool get retryable => status == 'failed' || status == 'interrupted';
  double get progress =>
      ((raw['progress'] as num?)?.toDouble() ?? 0).clamp(0, 100);
  String get title =>
      '${raw['plan'] is Map ? (raw['plan'] as Map)['title'] ?? brief['prompt'] ?? 'Untitled production' : brief['prompt'] ?? 'Untitled production'}';
  String get label => switch (status) {
    'queued' => 'Queued',
    'running' => 'Generating',
    'completed' => switch (review?['decision']) {
      'approved' => 'Approved',
      'needs-changes' => 'Needs changes',
      'rejected' => 'Rejected',
      _ => 'Ready for review',
    },
    'failed' => 'Needs attention',
    'interrupted' => 'Stopped',
    _ => 'Unknown',
  };
}
