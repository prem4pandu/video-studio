import 'dart:convert';

import 'package:fair_studio/v2/api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('create sends the same idempotency key on an explicit retry', () async {
    final keys = <String?>[];
    var requests = 0;
    final api = V2Api(
      baseUrl: 'http://localhost:4310',
      client: MockClient((request) async {
        expect(request.url.path, '/api/v2/jobs');
        expect(jsonDecode(request.body)['prompt'], 'Explain moon phases');
        keys.add(request.headers['Idempotency-Key']);
        requests++;
        if (requests == 1) {
          return http.Response(
            '{"error":{"message":"Temporary failure"}}',
            503,
          );
        }
        return http.Response(
          '{"job":{"id":"job-1","status":"queued","brief":{"prompt":"Explain moon phases"}}}',
          202,
        );
      }),
    );
    addTearDown(api.dispose);
    final key = v2RequestKey();
    await expectLater(
      api.create({'prompt': 'Explain moon phases'}, key),
      throwsA(isA<V2ApiException>()),
    );
    final job = await api.create({'prompt': 'Explain moon phases'}, key);
    expect(job.active, isTrue);
    expect(keys, [key, key]);
  });

  test('artifact links cannot escape to another origin or route', () {
    final api = V2Api(baseUrl: 'http://localhost:4310');
    addTearDown(api.dispose);
    expect(api.artifact('/api/v2/jobs/test/artifacts/video').host, 'localhost');
    expect(
      () =>
          api.artifact('https://example.com/api/v2/jobs/test/artifacts/video'),
      throwsA(isA<V2ApiException>()),
    );
    expect(() => api.artifact('/api/config'), throwsA(isA<V2ApiException>()));
  });

  test(
    'completed production is still awaiting review until explicitly approved',
    () {
      final job = V2Job.fromJson({
        'id': '1',
        'status': 'completed',
        'report': {'passed': true},
      });
      expect(job.active, isFalse);
      expect(job.label, 'Ready for review');
      final approved = V2Job.fromJson({
        'id': '1',
        'status': 'completed',
        'review': {'decision': 'approved'},
      });
      expect(approved.label, 'Approved');
      expect(V2Job.fromJson({'status': 'failed'}).retryable, isTrue);
      expect(V2Job.fromJson({'status': 'interrupted'}).retryable, isTrue);
      expect(V2Job.fromJson({'status': 'running'}).retryable, isFalse);
    },
  );

  test(
    'completed production labels preserve rejected and needs-changes reviews',
    () {
      for (final entry in {
        'needs-changes': 'Needs changes',
        'rejected': 'Rejected',
      }.entries) {
        final job = V2Job.fromJson({
          'status': 'completed',
          'review': {'decision': entry.key},
        });
        expect(job.label, entry.value);
        expect(job.completed, isTrue);
        expect(job.active, isFalse);
      }
    },
  );

  test('request keys are unique valid version 4 UUIDs', () {
    final values = List.generate(50, (_) => v2RequestKey());
    expect(values.toSet().length, 50);
    for (final value in values) {
      expect(
        RegExp(
          r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(value),
        isTrue,
      );
    }
  });

  test('unknown status does not enable generation controls', () {
    final job = V2Job.fromJson({'status': 'unknown', 'progress': 123});
    expect(job.active, isFalse);
    expect(job.retryable, isFalse);
    expect(job.completed, isFalse);
    expect(job.progress, 100);
  });
}
