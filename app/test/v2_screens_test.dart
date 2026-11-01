import 'dart:convert';

import 'package:fair_studio/theme.dart';
import 'package:fair_studio/v2/api.dart';
import 'package:fair_studio/v2/job_screen.dart';
import 'package:fair_studio/v2/studio_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  for (final width in [375.0, 768.0, 1440.0]) {
    testWidgets(
      'prompt screen fits ${width}px and disables unavailable generation',
      (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final api = V2Api(
          baseUrl: 'http://localhost:4310',
          client: MockClient(
            (request) async => http.Response(
              jsonEncode(
                request.url.path.endsWith('config')
                    ? {
                        'ready': false,
                        'capabilities': {
                          'render': {
                            'available': false,
                            'detail': 'Install renderer',
                          },
                        },
                      }
                    : {'jobs': []},
              ),
              200,
            ),
          ),
        );
        await tester.pumpWidget(
          MaterialApp(
            theme: fairTheme(),
            home: Scaffold(body: V2StudioScreen(api: api)),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Create something worth watching.'), findsOneWidget);
        final button = tester.widget<FilledButton>(
          find.widgetWithText(FilledButton, 'Generate video'),
        );
        expect(button.onPressed, isNull);
        expect(find.text('Content'), findsNothing);
        await tester.ensureVisible(find.text('Creative direction'));
        await tester.tap(find.text('Creative direction'));
        await tester.pumpAndSettle();
        expect(find.text('Content'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox());
      },
    );
  }

  testWidgets('failed production offers retry and preserves the server error', (
    tester,
  ) async {
    final api = V2Api(
      baseUrl: 'http://localhost:4310',
      client: MockClient(
        (request) async => http.Response(
          jsonEncode({
            'job': {
              'id': 'test',
              'status': 'failed',
              'progress': 40,
              'stage': 'render',
              'message': 'Rendering stopped',
              'error': 'Renderer is unavailable',
              'brief': {'prompt': 'A test production'},
              'events': [],
            },
          }),
          200,
        ),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: fairTheme(),
        home: Scaffold(
          body: V2JobScreen(jobId: 'test', api: api),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Renderer is unavailable'), findsOneWidget);
    expect(find.text('Retry production'), findsOneWidget);
    expect(find.text('Stop generation'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
}
