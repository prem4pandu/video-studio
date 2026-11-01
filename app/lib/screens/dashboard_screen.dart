import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../models.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/stage_timeline.dart';

/// Production dashboard — the studio home.
///
/// Queue health at a glance (metric strip), the live generation queue with
/// per-stage progress, and the lesson library. Everything is fed by
/// [jobsProvider], which keeps polling while work is in flight.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobs = ref.watch(jobsProvider);
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 250),
      child: jobs.when(
        loading: () => const _LoadingState(key: ValueKey('loading')),
        error: (error, _) => _ErrorState(
          key: const ValueKey('error'),
          error: error,
          onRetry: () => ref.read(jobsProvider.notifier).refresh(),
        ),
        data: (list) => _DashboardView(key: const ValueKey('data'), jobs: list),
      ),
    );
  }
}

/// Scrollable dashboard body once the job list has loaded.
class _DashboardView extends StatelessWidget {
  const _DashboardView({super.key, required this.jobs});
  final List<Job> jobs;

  static DateTime _stamp(Job job) =>
      job.updatedAt ?? job.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0);

  static String _versionLabel(Job job) => switch (job.generationVersion) {
        'open-source' => 'Open source',
        'quality' => 'Quality film',
        _ => 'Classic',
      };

  @override
  Widget build(BuildContext context) {
    final active = jobs.where((j) => j.isActive).toList();
    final awaiting = jobs.where((j) => j.isReady && j.review == null).length;
    final approved = jobs.where((j) => j.review?.decision == 'approved').length;
    final recent = [...jobs]..sort((a, b) => _stamp(b).compareTo(_stamp(a)));

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 36),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: FairDimens.contentMax),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _Header(),
              const SizedBox(height: 28),
              if (jobs.isEmpty)
                const _EmptyState()
              else ...[
                _MetricStrip(
                  total: jobs.length,
                  generating: active.length,
                  awaiting: awaiting,
                  approved: approved,
                ),
                if (active.isNotEmpty) ...[
                  const SizedBox(height: 32),
                  _SectionHeader(
                    kicker: 'LIVE QUEUE',
                    title: 'Now generating',
                    trailing: '${active.length} in flight',
                  ),
                  const SizedBox(height: 14),
                  for (final job in active) ...[
                    _ActiveJobCard(job: job, versionLabel: _versionLabel(job)),
                    const SizedBox(height: FairDimens.gap),
                  ],
                ],
                const SizedBox(height: 32),
                const _SectionHeader(kicker: 'LIBRARY', title: 'Recent lessons'),
                const SizedBox(height: 14),
                _LibraryList(jobs: recent.take(10).toList()),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Kicker + display headline on the left, primary action on the right.
class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Kicker('WORKSPACE'),
              const SizedBox(height: 10),
              Text('Lesson library', style: display(26)),
            ],
          ),
        ),
        const SizedBox(width: 24),
        FilledButton.icon(
          onPressed: () => context.go('/create'),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('New lesson'),
        ),
      ],
    );
  }
}

/// Small-caps label above a section title, with optional right-hand note.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.kicker, required this.title, this.trailing});
  final String kicker;
  final String title;
  final String? trailing;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Kicker(kicker),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(
              child: Text(title, style: Theme.of(context).textTheme.titleLarge),
            ),
            if (trailing != null)
              Text(trailing!,
                  style: const TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: FairColors.muted)),
          ],
        ),
      ],
    );
  }
}

/// Strip of four metric tiles; collapses to a 2×2 grid on narrow widths.
class _MetricStrip extends StatelessWidget {
  const _MetricStrip({
    required this.total,
    required this.generating,
    required this.awaiting,
    required this.approved,
  });
  final int total;
  final int generating;
  final int awaiting;
  final int approved;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      _MetricTile(
        label: 'Drafts awaiting review',
        value: awaiting,
        caption: 'educator decision pending',
        highlight: awaiting > 0,
        onTap: () => context.go('/review'),
      ),
      _MetricTile(
        label: 'Generating',
        value: generating,
        caption: 'jobs in flight',
      ),
      _MetricTile(
        label: 'Approved',
        value: approved,
        caption: 'cleared to share',
      ),
      _MetricTile(
        label: 'Total lessons',
        value: total,
        caption: 'briefs, drafts and exports',
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 700) {
          return Column(
            children: [
              Row(children: [
                Expanded(child: tiles[0]),
                const SizedBox(width: FairDimens.gap),
                Expanded(child: tiles[1]),
              ]),
              const SizedBox(height: FairDimens.gap),
              Row(children: [
                Expanded(child: tiles[2]),
                const SizedBox(width: FairDimens.gap),
                Expanded(child: tiles[3]),
              ]),
            ],
          );
        }
        return Row(
          children: [
            for (var i = 0; i < tiles.length; i++) ...[
              if (i > 0) const SizedBox(width: FairDimens.gap),
              Expanded(child: tiles[i]),
            ],
          ],
        );
      },
    );
  }
}

/// Compact stat tile — kicker label, display numeral, muted caption.
/// [highlight] switches the numeral to amber (used for the awaiting-review
/// count); [onTap] makes the tile a target.
class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
    required this.caption,
    this.highlight = false,
    this.onTap,
  });
  final String label;
  final int value;
  final String caption;
  final bool highlight;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final numeralColor = highlight ? FairColors.amber : FairColors.ink;
    return Container(
      decoration: fairCard(),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(FairDimens.radius),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: onTap,
            hoverColor: FairColors.surfaceRaised,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 15),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Kicker(label, color: FairColors.muted)),
                      if (onTap != null) ...[
                        const SizedBox(width: 8),
                        const Icon(Icons.arrow_forward,
                            size: 14, color: FairColors.muted),
                      ],
                    ],
                  ),
                  const SizedBox(height: 12),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 200),
                    child: Text(
                      '$value',
                      key: ValueKey(value),
                      style: display(24, numeralColor),
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    caption,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 11.5, color: FairColors.muted),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A live job in the "Now generating" queue — stage timeline + progress.
class _ActiveJobCard extends StatelessWidget {
  const _ActiveJobCard({required this.job, required this.versionLabel});
  final Job job;
  final String versionLabel;

  @override
  Widget build(BuildContext context) {
    final pct = job.isReady ? 100 : job.progress.clamp(0, 100);
    return Container(
      decoration: fairCard(),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(FairDimens.radius),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: () => context.go('/jobs/${job.id}'),
            hoverColor: FairColors.surfaceRaised,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(22, 18, 22, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          job.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(versionLabel,
                          style: mono(10.5, FairColors.muted)),
                      const SizedBox(width: 10),
                      StatusChip(job.status),
                    ],
                  ),
                  const SizedBox(height: 14),
                  StageTimeline(job: job, compact: true),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          job.isReady
                              ? 'Ready for review'
                              : (job.message.isNotEmpty
                                  ? job.message
                                  : 'Working…'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 12, color: FairColors.inkSoft),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text('$pct%',
                          style: mono(11.5, FairColors.ink, FontWeight.w700)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  MeterBar(
                    value: pct / 100,
                    color: job.status == 'failed'
                        ? FairColors.error
                        : job.isReady
                            ? FairColors.accent
                            : FairColors.amber,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One flat panel holding the dense lesson rows, separated by dividers.
class _LibraryList extends StatelessWidget {
  const _LibraryList({required this.jobs});
  final List<Job> jobs;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: fairCard(),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(FairDimens.radius),
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            children: [
              for (var i = 0; i < jobs.length; i++) ...[
                if (i > 0) const Divider(height: 1),
                _LibraryRow(job: jobs[i]),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// A dense, table-like library row — title left, right-aligned mono metadata,
/// status chip and chevron. Hover lifts the row to `surfaceRaised`.
class _LibraryRow extends StatelessWidget {
  const _LibraryRow({required this.job});
  final Job job;

  /// Target runtime from the brief, formatted `m:ss` — null when absent.
  static String? _targetDuration(Job job) {
    final t = job.brief['targetSeconds'];
    if (t is! num || t <= 0) return null;
    final seconds = t.round();
    return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final decision = job.review?.decision;
    final chip = (decision != null && decision.isNotEmpty) ? decision : job.status;
    final date = job.updatedAt ?? job.createdAt;
    final dateLabel =
        date == null ? null : DateFormat.MMMd().format(date.toLocal());
    final meta = [
      _DashboardView._versionLabel(job),
      ?dateLabel,
      ?_targetDuration(job),
    ].join(' · ');

    return InkWell(
      onTap: () => context.go('/jobs/${job.id}'),
      hoverColor: FairColors.surfaceRaised,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        child: Row(
          children: [
            Expanded(
              child: Text(
                job.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: FairColors.ink),
              ),
            ),
            const SizedBox(width: 16),
            Text(
              meta,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: mono(10.5, FairColors.muted),
            ),
            const SizedBox(width: 14),
            StatusChip(chip),
            const SizedBox(width: 6),
            const Icon(Icons.chevron_right, size: 18, color: FairColors.muted),
          ],
        ),
      ),
    );
  }
}

/// Friendly first-run state shown when the job store is empty.
class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: fairCard(),
      child: EmptyState(
        icon: Icons.movie_creation_outlined,
        title: 'No lessons yet',
        body:
            'Describe a lesson and the studio will plan, narrate, animate and '
            'render a draft for review.',
        action: FilledButton.icon(
          onPressed: () => context.go('/create'),
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Create the first lesson'),
        ),
      ),
    );
  }
}

/// Loading placeholder — a console panel with a live progress trace rather
/// than a bare spinner.
class _LoadingState extends StatelessWidget {
  const _LoadingState({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 420,
        margin: const EdgeInsets.symmetric(horizontal: 24),
        padding: const EdgeInsets.fromLTRB(24, 22, 24, 24),
        decoration: fairCard(),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Kicker('WORKSPACE'),
            const SizedBox(height: 14),
            Text('Loading lesson library…',
                style: display(18, FairColors.ink, FontWeight.w600)),
            const SizedBox(height: 6),
            const Text('Fetching jobs from the studio.',
                style: TextStyle(fontSize: 12, color: FairColors.muted)),
            const SizedBox(height: 18),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: const LinearProgressIndicator(minHeight: 4),
            ),
          ],
        ),
      ),
    );
  }
}

/// Server-unreachable state with a manual retry.
class _ErrorState extends StatelessWidget {
  const _ErrorState({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: EmptyState(
        icon: Icons.cloud_off_outlined,
        title: 'Studio unreachable',
        body: '$error',
        action: FilledButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh, size: 17),
          label: const Text('Try again'),
        ),
      ),
    );
  }
}
