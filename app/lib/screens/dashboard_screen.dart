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
/// Queue health at a glance (stat strip), the live generation queue with
/// per-stage progress, and the recent lesson list. Everything is fed by
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
              const SizedBox(height: 30),
              if (jobs.isEmpty)
                const _EmptyState()
              else ...[
                _StatRow(
                  total: jobs.length,
                  generating: active.length,
                  awaiting: awaiting,
                  approved: approved,
                ),
                if (active.isNotEmpty) ...[
                  const SizedBox(height: 34),
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
                const SizedBox(height: 34),
                const _SectionHeader(kicker: 'LIBRARY', title: 'Recent lessons'),
                const SizedBox(height: 14),
                _RecentList(jobs: recent.take(10).toList()),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Kicker + headline + subtitle on the left, primary action on the right.
class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Kicker('OVERVIEW'),
              const SizedBox(height: 10),
              Text('Production dashboard',
                  style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 7),
              const Text(
                'Every lesson from brief to reviewed export.',
                style: TextStyle(
                    fontSize: 13.5, color: FairColors.muted, height: 1.45),
              ),
            ],
          ),
        ),
        const SizedBox(width: 24),
        Padding(
          padding: const EdgeInsets.only(top: 26),
          child: FilledButton.icon(
            onPressed: () => context.go('/create'),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('New lesson'),
          ),
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

/// Row of four stat cards; collapses to a 2×2 grid on narrow widths.
class _StatRow extends StatelessWidget {
  const _StatRow({
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
    final cards = [
      _StatCard(label: 'Lessons', value: total),
      _StatCard(label: 'Generating', value: generating),
      _StatCard(
        label: 'Awaiting review',
        value: awaiting,
        highlight: awaiting > 0,
        onTap: () => context.go('/review'),
      ),
      _StatCard(label: 'Approved', value: approved),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 700) {
          return Column(
            children: [
              Row(children: [
                Expanded(child: cards[0]),
                const SizedBox(width: FairDimens.gap),
                Expanded(child: cards[1]),
              ]),
              const SizedBox(height: FairDimens.gap),
              Row(children: [
                Expanded(child: cards[2]),
                const SizedBox(width: FairDimens.gap),
                Expanded(child: cards[3]),
              ]),
            ],
          );
        }
        return Row(
          children: [
            for (var i = 0; i < cards.length; i++) ...[
              if (i > 0) const SizedBox(width: FairDimens.gap),
              Expanded(child: cards[i]),
            ],
          ],
        );
      },
    );
  }
}

/// Big-numeral metric card. [highlight] switches the numeral to amber
/// (used for the awaiting-review count); [onTap] makes the card a target.
class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    this.highlight = false,
    this.onTap,
  });
  final String label;
  final int value;
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
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 200),
                        child: Text(
                          '$value',
                          key: ValueKey(value),
                          style: TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w700,
                            letterSpacing: -1,
                            height: 1,
                            color: numeralColor,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                      const Spacer(),
                      if (onTap != null)
                        const Icon(Icons.arrow_forward,
                            size: 15, color: FairColors.muted),
                    ],
                  ),
                  const SizedBox(height: 9),
                  Kicker(label, color: FairColors.muted),
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
    return Container(
      decoration: fairCard(),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(FairDimens.radius),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: () => context.go('/jobs/${job.id}'),
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
                          style: const TextStyle(
                              fontSize: 11, color: FairColors.muted)),
                      const SizedBox(width: 10),
                      StatusChip(job.status),
                    ],
                  ),
                  const SizedBox(height: 14),
                  StageTimeline(job: job, compact: true),
                  const SizedBox(height: 14),
                  JobProgressBar(job: job),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// One rounded card holding the recent-lesson rows, separated by dividers.
class _RecentList extends StatelessWidget {
  const _RecentList({required this.jobs});
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
                _RecentRow(job: jobs[i]),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _RecentRow extends StatelessWidget {
  const _RecentRow({required this.job});
  final Job job;

  @override
  Widget build(BuildContext context) {
    final decision = job.review?.decision;
    final chip = (decision != null && decision.isNotEmpty) ? decision : job.status;
    final date = job.updatedAt ?? job.createdAt;
    final version =
        job.generationVersion == 'open-source' ? 'Open source' : 'Classic';
    final meta =
        '$version${date == null ? '' : ' · ${DateFormat.MMMd().format(date.toLocal())}'}';

    return InkWell(
      onTap: () => context.go('/jobs/${job.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    job.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w600,
                        color: FairColors.ink),
                  ),
                  const SizedBox(height: 4),
                  Text(meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11.5, color: FairColors.muted)),
                ],
              ),
            ),
            const SizedBox(width: 16),
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
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 64),
      child: Column(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: const BoxDecoration(
                color: FairColors.accentSoft, shape: BoxShape.circle),
            child: const Icon(Icons.movie_creation_outlined,
                size: 27, color: FairColors.accent),
          ),
          const SizedBox(height: 18),
          Text('No lessons yet', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: const Text(
              'Write a teaching brief and the pipeline takes it from plan to '
              'narration, render and quality gates — ready for educator review.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 12.5, color: FairColors.muted, height: 1.55),
            ),
          ),
          const SizedBox(height: 22),
          FilledButton.icon(
            onPressed: () => context.go('/create'),
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Create your first lesson'),
          ),
        ],
      ),
    );
  }
}

class _LoadingState extends StatelessWidget {
  const _LoadingState({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 26,
            height: 26,
            child: CircularProgressIndicator(
                strokeWidth: 2.4, color: FairColors.accent),
          ),
          SizedBox(height: 14),
          Text('Loading studio…',
              style: TextStyle(fontSize: 12.5, color: FairColors.muted)),
        ],
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
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 400),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: const BoxDecoration(
                  color: FairColors.errorBg, shape: BoxShape.circle),
              child: const Icon(Icons.cloud_off_outlined,
                  size: 24, color: FairColors.error),
            ),
            const SizedBox(height: 16),
            Text('Studio unreachable',
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(
              '$error',
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 12.5, color: FairColors.muted, height: 1.5),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 17),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
