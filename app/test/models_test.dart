import 'package:flutter_test/flutter_test.dart';

import 'package:fair_studio/models.dart';

void main() {
  group('CoverageEntry', () {
    // The /api/curriculum coverage stub uses { jobId, status, review: string }
    // — a different shape than /api/jobs entries ({ id, review: {decision} }).
    test('parses jobId and a bare review decision string', () {
      final entry = CoverageEntry.fromJson({
        'topicId': 's5-pv-rounding',
        'unitId': 's5-place-value',
        'jobs': [
          {'jobId': 'abc-123', 'status': 'completed', 'review': 'approved', 'createdAt': '2026-10-26T01:00:00Z'},
        ],
      });
      expect(entry.jobs.single.id, 'abc-123');
      expect(entry.jobs.single.review?.decision, 'approved');
      expect(entry.state, 'approved');
    });

    test('completed job without review reports completed', () {
      final entry = CoverageEntry.fromJson({
        'topicId': 't', 'unitId': 'u',
        'jobs': [
          {'jobId': 'j1', 'status': 'completed', 'review': null},
        ],
      });
      expect(entry.state, 'completed');
    });

    test('empty jobs reports none', () {
      final entry = CoverageEntry.fromJson({'topicId': 't', 'unitId': 'u', 'jobs': const []});
      expect(entry.state, 'none');
    });
  });

  group('LessonBrief', () {
    test('clone produces an independent copy', () {
      final brief = LessonBrief(text: 'Teach rounding', provider: 'lmstudio', targetSeconds: 240);
      final copy = brief.clone();
      copy.text = 'Changed';
      expect(brief.text, 'Teach rounding');
      expect(copy.provider, 'lmstudio');
      expect(copy.targetSeconds, 240);
      expect(identical(brief, copy), isFalse);
    });
  });
}
