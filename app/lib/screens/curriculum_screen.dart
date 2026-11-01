import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models.dart';
import '../state.dart';
import '../theme.dart';

/// Curriculum workspace — coverage metrics, the live generation banner and
/// the expandable unit/topic tree with batch generation. Mirrors
/// public/curriculum.mjs (summary, queue banner, tree).
class CurriculumScreen extends ConsumerStatefulWidget {
  const CurriculumScreen({super.key});

  @override
  ConsumerState<CurriculumScreen> createState() => _CurriculumScreenState();
}

class _CurriculumScreenState extends ConsumerState<CurriculumScreen> {
  /// Expanded unit ids — kept in screen state so provider refreshes do not
  /// collapse the tree.
  final Set<String> _expanded = <String>{};
  final Set<String> _busy = <String>{};
  bool _seeded = false;

  void _seedExpansion(CurriculumData data) {
    if (_seeded) return;
    _seeded = true;
    final first = data.trees.firstOrNull?.units.firstOrNull;
    if (first != null) _expanded.add(first.id);
  }

  Future<void> _generate(Map<String, dynamic> payload, String key) async {
    if (_busy.contains(key)) return;
    setState(() => _busy.add(key));
    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await ref.read(apiProvider).batch(payload);
      ref.invalidate(curriculumProvider);
      unawaited(ref.read(jobsProvider.notifier).refresh());
      messenger.showSnackBar(
        SnackBar(
          content: Text(result.count > 0
              ? '${result.count} topic${result.count == 1 ? '' : 's'} queued'
                  '${result.errors.isEmpty ? '' : ' · ${result.errors.length} skipped'}'
              : 'Nothing queued${result.errors.isEmpty ? '' : ': ${result.errors.join('; ')}'}'),
        ),
      );
    } catch (error) {
      messenger.showSnackBar(SnackBar(backgroundColor: FairColors.error, content: Text('$error')));
    } finally {
      if (mounted) setState(() => _busy.remove(key));
    }
  }

  void _toggleUnit(String unitId) {
    setState(() {
      if (!_expanded.remove(unitId)) _expanded.add(unitId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final curriculum = ref.watch(curriculumProvider);
    final jobs = ref.watch(jobsProvider).asData?.value ?? const <Job>[];
    final active = jobs.where((j) => j.isActive).toList();

    return SafeArea(
      child: curriculum.when(
        loading: () => const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 26,
                height: 26,
                child: CircularProgressIndicator(strokeWidth: 2.4, color: FairColors.accent),
              ),
              SizedBox(height: 14),
              Text('Loading curriculum…', style: TextStyle(fontSize: 12.5, color: FairColors.muted)),
            ],
          ),
        ),
        error: (error, _) => EmptyState(
          icon: Icons.cloud_off_outlined,
          title: 'Curriculum unavailable',
          body: '$error',
          action: OutlinedButton.icon(
            onPressed: () => ref.invalidate(curriculumProvider),
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry'),
          ),
        ),
        data: (data) {
          _seedExpansion(data);
          final title = data.trees.length == 1 ? data.trees.first.title : 'Curriculum';
          return SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 36),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: FairDimens.contentMax),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Kicker('CURRICULUM'),
                              const SizedBox(height: 10),
                              Text(title, style: display(26)),
                              const SizedBox(height: 7),
                              const Text(
                                'Track topic coverage and queue lesson generation, unit by unit.',
                                style: TextStyle(fontSize: 13.5, color: FairColors.muted, height: 1.45),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 24),
                        Padding(
                          padding: const EdgeInsets.only(top: 26),
                          child: Row(
                            children: [
                              OutlinedButton.icon(
                                onPressed: () {
                                  ref.invalidate(curriculumProvider);
                                  unawaited(ref.read(jobsProvider.notifier).refresh());
                                },
                                icon: const Icon(Icons.refresh, size: 16),
                                label: const Text('Refresh'),
                              ),
                              const SizedBox(width: 10),
                              OutlinedButton.icon(
                                icon: const Icon(Icons.bolt_rounded, size: 16),
                                label: const Text('Generate pending'),
                                onPressed: _busy.contains('all')
                                    ? null
                                    : () => unawaited(
                                        _generate(const {'all': true, 'onlyPending': true}, 'all')),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 30),
                    _MetricStrip(data: data, generating: active.length),
                    if (active.isNotEmpty) ...[
                      const SizedBox(height: FairDimens.gap),
                      _QueueBanner(active: active),
                    ],
                    const SizedBox(height: 34),
                    if (data.trees.isEmpty)
                      const EmptyState(
                        icon: Icons.account_tree_outlined,
                        title: 'No curriculum trees',
                        body: 'Add a curriculum source under curriculum/ to plan generation.',
                      )
                    else
                      for (final tree in data.trees) ...[
                        if (data.trees.length > 1) ...[
                          Kicker(tree.title, color: FairColors.muted),
                          const SizedBox(height: 12),
                        ],
                        for (final unit in tree.units)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: _UnitCard(
                              unit: unit,
                              data: data,
                              expanded: _expanded.contains(unit.id),
                              generating: _busy.contains(unit.id),
                              busyTopics: _busy,
                              onToggle: () => _toggleUnit(unit.id),
                              onGenerateUnit: () => unawaited(_generate({'unitId': unit.id}, unit.id)),
                              onGenerateTopic: (topicId) => unawaited(_generate({
                                    'topicIds': [topicId]
                                  }, topicId)),
                            ),
                          ),
                        const SizedBox(height: 12),
                      ],
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Four-tile coverage read-out across the whole curriculum; collapses to a
/// 2×2 grid on narrow widths.
class _MetricStrip extends StatelessWidget {
  const _MetricStrip({required this.data, required this.generating});

  final CurriculumData data;
  final int generating;

  @override
  Widget build(BuildContext context) {
    final drafts = data.coverage.where((e) => e.jobs.firstOrNull?.status == 'completed').length;
    final approved = data.coverage.where((e) => e.state == 'approved').length;
    final tiles = [
      _MetricTile(label: 'TOPICS', value: '${data.coverage.length}'),
      _MetricTile(label: 'DRAFTS', value: '$drafts'),
      _MetricTile(label: 'APPROVED', value: '$approved'),
      _MetricTile(label: 'GENERATING', value: '$generating', highlight: generating > 0),
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

/// Single metric tile — Kicker label over a display numeral.
class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value, this.highlight = false});

  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Kicker(label, color: FairColors.muted),
          const SizedBox(height: 10),
          Text(
            value,
            style: display(28, highlight ? FairColors.amber : FairColors.ink),
          ),
        ],
      ),
    );
  }
}

/// Amber banner shown while generation is running or queued — mono status
/// line over a MeterBar tracking the running job's progress.
class _QueueBanner extends StatelessWidget {
  const _QueueBanner({required this.active});

  final List<Job> active;

  @override
  Widget build(BuildContext context) {
    final running = active.where((j) => j.status == 'running').firstOrNull;
    final queued = active.where((j) => j.status == 'queued').length;
    final message = running != null
        ? 'Now generating: ${running.title}'
            '${running.message.isNotEmpty ? ' — ${running.message}' : ''}'
            '${queued > 0 ? ' $queued more in queue.' : ''}'
        : '$queued topic${queued == 1 ? '' : 's'} queued, starting…';
    final progress = running == null ? 0.0 : running.progress.clamp(0, 100) / 100;
    return Container(
      decoration: fairCard(color: FairColors.amberSoft),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 15),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.bolt_rounded, size: 16, color: FairColors.amber),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  message,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: mono(11.5, FairColors.inkSoft),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          MeterBar(value: progress, color: FairColors.amber),
        ],
      ),
    );
  }
}

/// One curriculum unit: tappable header (title, strand, approval counter,
/// Generate unit action, disclosure chevron) plus the expanded topic rows.
class _UnitCard extends StatelessWidget {
  const _UnitCard({
    required this.unit,
    required this.data,
    required this.expanded,
    required this.generating,
    required this.busyTopics,
    required this.onToggle,
    required this.onGenerateUnit,
    required this.onGenerateTopic,
  });

  final CurriculumUnit unit;
  final CurriculumData data;
  final bool expanded;
  final bool generating;
  final Set<String> busyTopics;
  final VoidCallback onToggle;
  final VoidCallback onGenerateUnit;
  final void Function(String topicId) onGenerateTopic;

  @override
  Widget build(BuildContext context) {
    final approved = unit.topics.where((t) => data.forTopic(t.id)?.state == 'approved').length;
    return Container(
      decoration: fairCard(),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(FairDimens.radius),
        child: Column(
          children: [
            Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: onToggle,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(18, 14, 14, 14),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(unit.title, style: Theme.of(context).textTheme.titleMedium),
                            if (unit.strand.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 3),
                                child: Text(unit.strand, style: mono(10.5, FairColors.muted)),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text('$approved/${unit.topics.length} approved', style: mono(10.5, FairColors.muted)),
                      const SizedBox(width: 12),
                      _SmallAction(label: 'Generate unit', onPressed: generating ? null : onGenerateUnit),
                      const SizedBox(width: 4),
                      Icon(
                        expanded ? Icons.expand_more : Icons.chevron_right,
                        size: 18,
                        color: FairColors.muted,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            if (expanded) ...[
              const Divider(height: 1),
              if (unit.topics.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(18),
                  child: Text('No topics in this unit.', style: TextStyle(fontSize: 12, color: FairColors.muted)),
                )
              else
                for (var i = 0; i < unit.topics.length; i++) ...[
                  _TopicRow(
                    topic: unit.topics[i],
                    entry: data.forTopic(unit.topics[i].id),
                    busy: busyTopics.contains(unit.topics[i].id),
                    onGenerate: () => onGenerateTopic(unit.topics[i].id),
                  ),
                  if (i < unit.topics.length - 1) const Divider(height: 1, indent: 18, endIndent: 14),
                ],
            ],
          ],
        ),
      ),
    );
  }
}

/// One topic row: objective codes, title + truncated summary, coverage
/// StatusChip, the Generate/Regenerate action and an "open draft" deep link
/// to the latest job when coverage has one.
class _TopicRow extends StatelessWidget {
  const _TopicRow({required this.topic, required this.entry, required this.busy, required this.onGenerate});

  final CurriculumTopic topic;
  final CoverageEntry? entry;
  final bool busy;
  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    final state = entry?.state ?? 'none';
    final locked = busy || state == 'queued' || state == 'running';
    final jobId = entry?.jobs.firstOrNull?.id;
    final hasJob = jobId != null && jobId.isNotEmpty && jobId != 'null';
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 12, 14, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (topic.codes.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 3),
                    child: Text(
                      topic.codes.join(' · ').toUpperCase(),
                      style: mono(9.5, FairColors.muted).copyWith(letterSpacing: 1.1),
                    ),
                  ),
                Text(
                  topic.title,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: FairColors.ink),
                ),
                if (topic.summary.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      topic.summary,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11.5, color: FairColors.muted, height: 1.4),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Padding(padding: const EdgeInsets.only(top: 2), child: StatusChip(state)),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _SmallAction(label: state == 'none' ? 'Generate' : 'Regenerate', onPressed: locked ? null : onGenerate),
              if (hasJob)
                TextButton(
                  onPressed: () => context.go('/jobs/$jobId'),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    minimumSize: const Size(0, 24),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    textStyle: mono(10, FairColors.accent, FontWeight.w600),
                  ),
                  child: const Text('open draft'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Compact OutlinedButton used for the batch actions in headers and rows.
class _SmallAction extends StatelessWidget {
  const _SmallAction({required this.label, this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onPressed,
      style: OutlinedButton.styleFrom(
        foregroundColor: FairColors.accent,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        minimumSize: const Size(0, 32),
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        textStyle: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600),
      ),
      child: Text(label),
    );
  }
}
