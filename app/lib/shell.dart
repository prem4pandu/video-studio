import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'state.dart';
import 'theme.dart';

/// Persistent app shell: dark rail (brand, destinations, service status)
/// beside the routed content. Mirrors the web studio's sidebar.
class StudioShell extends ConsumerWidget {
  const StudioShell({required this.child, super.key});
  final Widget child;

  static const _destinations = [
    (path: '/', icon: Icons.grid_view_rounded, label: 'Dashboard'),
    (path: '/create', icon: Icons.add_circle_outline, label: 'Create'),
    (path: '/review', icon: Icons.fact_check_outlined, label: 'Review'),
    (path: '/curriculum', icon: Icons.account_tree_outlined, label: 'Curriculum'),
    (path: '/studio-v2', icon: Icons.movie_creation_outlined, label: 'Studio V2'),
  ];

  int _selectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    if (location.startsWith('/studio-v2')) return 4;
    if (location.startsWith('/create')) return 1;
    if (location.startsWith('/review')) return 2;
    if (location.startsWith('/curriculum')) return 3;
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = _selectedIndex(context);
    if (selected == 4) {
      return Scaffold(
        appBar: AppBar(
          toolbarHeight: 72,
          backgroundColor: FairColors.canvas,
          surfaceTintColor: Colors.transparent,
          titleSpacing: MediaQuery.sizeOf(context).width < 600 ? 18 : 32,
          title: TextButton.icon(
            onPressed: () => context.go('/studio-v2'),
            icon: const Icon(Icons.play_circle_outline, size: 25),
            label: const Text('Video Studio', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: FairColors.ink)),
          ),
          actions: [TextButton(onPressed: () => context.go('/'), child: const Text('Classic studio')), const SizedBox(width: 18)],
        ),
        body: SafeArea(child: child),
      );
    }
    final jobs = ref.watch(jobsProvider);
    final generating = jobs.asData?.value.where((j) => j.isActive).length ?? 0;
    final awaiting = jobs.asData?.value.where((j) => j.isReady && j.review == null).length ?? 0;

    return Scaffold(
      body: Row(
        children: [
          Container(
            width: FairDimens.railWidth,
            color: FairColors.sidebar,
            child: SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _Brand(),
                  const SizedBox(height: 8),
                  for (var i = 0; i < _destinations.length; i++)
                    _RailItem(
                      destination: _destinations[i],
                      selected: i == selected,
                      badge: i == 2 && awaiting > 0
                          ? '$awaiting'
                          : i == 0 && generating > 0
                              ? '$generating'
                              : null,
                      onTap: () => context.go(_destinations[i].path),
                    ),
                  const Spacer(),
                  const _ServiceStatus(),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 10, 20, 18),
                    child: Text('LOCAL · NO PAID APIS', style: mono(8.5, FairColors.faint).copyWith(letterSpacing: 1.4)),
                  ),
                ],
              ),
            ),
          ),
          const VerticalDivider(width: 1, color: FairColors.line),
          Expanded(child: child),
        ],
      ),
    );
  }
}

class _Brand extends StatelessWidget {
  const _Brand();
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: FairColors.accentSoft,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: FairColors.accentDark),
            ),
            child: const Center(child: Text('VS', style: TextStyle(fontFamily: 'SpaceGrotesk', color: FairColors.accent, fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 0.5))),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Video Studio', style: display(15, FairColors.sidebarInk, FontWeight.w700)),
              const SizedBox(height: 2),
              Text('LESSON PRODUCTION', style: mono(8, FairColors.sidebarMuted).copyWith(letterSpacing: 1.8)),
            ],
          ),
        ],
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  const _RailItem({required this.destination, required this.selected, required this.onTap, this.badge});
  final ({String path, IconData icon, String label}) destination;
  final bool selected;
  final VoidCallback onTap;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
      child: Material(
        color: selected ? FairColors.accentSoft : Colors.transparent,
        borderRadius: BorderRadius.circular(9),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(9),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            child: Row(
              children: [
                Icon(destination.icon, size: 19, color: selected ? FairColors.accentDark : FairColors.sidebarMuted),
                const SizedBox(width: 11),
                Expanded(
                  child: Text(destination.label,
                      style: TextStyle(fontSize: 13, fontWeight: selected ? FontWeight.w600 : FontWeight.w500, color: selected ? FairColors.accentDark : FairColors.sidebarMuted)),
                ),
                if (badge != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(color: FairColors.accent, borderRadius: BorderRadius.circular(10)),
                    child: Text(badge!, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Live capability read-out from /api/config — honest about what's offline.
class _ServiceStatus extends ConsumerWidget {
  const _ServiceStatus();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(configProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Divider(color: FairColors.sidebarLine, height: 24),
          Text('SERVICES', style: mono(8, FairColors.sidebarMuted).copyWith(letterSpacing: 1.8)),
          const SizedBox(height: 8),
          ...config.when(
            data: (c) => [
              for (final e in c.capabilities.entries)
                _StatusDot(label: _cap(e.key), ok: e.value.available),
            ],
            loading: () => [const _StatusDot(label: 'Checking services', ok: null)],
            error: (_, _) => [const _StatusDot(label: 'Studio offline', ok: false)],
          ),
        ],
      ),
    );
  }

  static String _cap(String name) => switch (name) {
        'planning' => 'Planner',
        'narration' => 'Narration',
        'render' => 'Renderer',
        _ => name,
      };
}

class _StatusDot extends StatelessWidget {
  const _StatusDot({required this.label, required this.ok});
  final String label;
  final bool? ok;
  @override
  Widget build(BuildContext context) {
    final color = ok == null ? FairColors.sidebarMuted : ok! ? FairColors.accent : FairColors.error;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2.5),
      child: Row(
        children: [
          Container(width: 7, height: 7, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Expanded(child: Text(label, style: const TextStyle(color: FairColors.sidebarMuted, fontSize: 11.5))),
        ],
      ),
    );
  }
}
