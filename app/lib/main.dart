import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'screens/create_screen.dart';
import 'screens/curriculum_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/job_screen.dart';
import 'screens/review_screen.dart';
import 'shell.dart';
import 'theme.dart';

void main() => runApp(const ProviderScope(child: StudioApp()));

final _router = GoRouter(
  initialLocation: '/',
  routes: [
    ShellRoute(
      builder: (context, state, child) => StudioShell(child: child),
      routes: [
        GoRoute(path: '/', builder: (context, state) => const DashboardScreen()),
        GoRoute(path: '/create', builder: (context, state) => const CreateScreen()),
        GoRoute(path: '/jobs/:id', builder: (context, state) => JobScreen(jobId: state.pathParameters['id']!)),
        GoRoute(path: '/review', builder: (context, state) => const ReviewScreen()),
        GoRoute(path: '/curriculum', builder: (context, state) => const CurriculumScreen()),
      ],
    ),
  ],
);

class StudioApp extends StatelessWidget {
  const StudioApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Video Studio',
      debugShowCheckedModeBanner: false,
      theme: fairTheme(),
      routerConfig: _router,
    );
  }
}
