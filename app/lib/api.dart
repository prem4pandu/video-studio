import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/http.dart' as http;

import 'models.dart';

/// Thin REST client for fair-server (src/server.mjs).
///
/// The server is localhost-only and rejects cross-origin browser requests.
/// On native/desktop targets the client talks to FAIR_API (default
/// http://localhost:4310). On web it must be served by the studio server itself so
/// requests stay same-origin — hence Uri.base.origin.
class StudioApi {
  StudioApi({String? baseUrl})
      : base = baseUrl ??
            (kIsWeb ? Uri.base.origin : const String.fromEnvironment('FAIR_API', defaultValue: 'http://localhost:4310'));

  final String base;
  final http.Client _client = http.Client();

  Uri _uri(String path) => Uri.parse('$base$path');

  Future<Map<String, dynamic>> _json(http.Response res) async {
    Object? data;
    try {
      data = jsonDecode(utf8.decode(res.bodyBytes));
    } catch (_) {/* fall through */}
    if (res.statusCode >= 400) {
      final err = data is Map ? data['error'] : null;
      throw StudioApiException(res.statusCode, err is String ? err : (err is Map ? '${err['message'] ?? err}' : 'Request failed (HTTP ${res.statusCode})'));
    }
    return data is Map<String, dynamic> ? data : <String, dynamic>{};
  }

  Future<Map<String, dynamic>> _get(String path) async => _json(await _client.get(_uri(path)));

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) async =>
      _json(await _client.post(_uri(path), headers: {'content-type': 'application/json'}, body: jsonEncode(body)));

  // ---- Config ----
  Future<StudioConfig> config() async => StudioConfig(raw: await _get('/api/config'));

  // ---- Jobs ----
  Future<List<Job>> jobs() async {
    final data = await _get('/api/jobs');
    return (data['jobs'] as List? ?? const []).whereType<Map>().map(Job.fromJson).toList();
  }

  Future<Job> job(String id) async {
    final data = await _get('/api/jobs/${Uri.encodeComponent(id)}');
    return Job.fromJson(data['job'] as Map);
  }

  Future<Job> createJob(LessonBrief brief) async {
    final data = await _post('/api/jobs', brief.toJson());
    return Job.fromJson(data['job'] as Map);
  }

  Future<Job> jobAction(String id, String action) async {
    final data = await _post('/api/jobs/${Uri.encodeComponent(id)}/$action', const {});
    return Job.fromJson(data['job'] as Map);
  }

  Future<Job> review(String id, {required String decision, String note = '', String reviewer = 'educator'}) async {
    final data = await _post('/api/jobs/${Uri.encodeComponent(id)}/review', {'decision': decision, 'note': note, 'reviewer': reviewer});
    return Job.fromJson(data['job'] as Map);
  }

  /// Raw JSON artifact (prompts.json etc.).
  Future<Map<String, dynamic>> artifactJson(String artifactUrl) async => _get(artifactUrl);

  /// Absolute URL for a binary artifact (video, captions, transcript).
  String artifactUrl(String? path) => path == null ? '' : _uri(path).toString();

  // ---- Curriculum ----
  Future<CurriculumData> curriculum() async {
    final data = await _get('/api/curriculum');
    return CurriculumData(
      trees: (data['trees'] as List? ?? const []).whereType<Map>().map(CurriculumTree.fromJson).toList(),
      coverage: (data['coverage'] as List? ?? const []).whereType<Map>().map(CoverageEntry.fromJson).toList(),
    );
  }

  Future<BatchResult> batch(Map<String, dynamic> payload) async {
    final data = await _post('/api/batch', payload);
    return BatchResult(
      count: (data['count'] as num?)?.toInt() ?? 0,
      errors: (data['errors'] as List? ?? const []).whereType<Map>().map((e) => '${e['error'] ?? e}').toList(),
    );
  }

  void dispose() => _client.close();

  static String artifactLabel(String kind) => switch (kind) {
        'video' => 'Download video',
        'captions' => 'Captions',
        'transcript' => 'Transcript',
        'lesson' => 'Lesson plan',
        'prompts' => 'Generation prompts',
        'composition' => 'Composition source',
        'renderPlan' => 'Render plan',
        'footage' => 'Footage provenance',
        'report' => 'Quality report',
        'manifest' => 'Manifest',
        _ => kind,
      };
}

class BatchResult {
  const BatchResult({required this.count, required this.errors});
  final int count;
  final List<String> errors;
}

class StudioApiException implements Exception {
  const StudioApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => message;
}
