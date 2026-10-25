import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models.dart';
import '../state.dart';
import '../theme.dart';

/// Curriculum workspace — coverage overview, live queue banner and the
/// expandable unit/topic tree with batch generation. Mirrors
/// public/fair-curriculum.mjs (summary, queue banner, tree).
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
        loading: () => const Center(child: CircularProgressIndicator(color: FairColors.accent)),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: _MessageCard(
                icon: Icons.cloud_off_outlined,
                title: 'Curriculum data is unavailable',
                detail: '$error',
                actionLabel: 'Retry',
                onAction: () => ref.invalidate(curriculumProvider),
              ),
            ),
          ),
        ),
        data: (data) {
          _seedExpansion(data);
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(28, 26, 28, 44),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: FairDimens.contentMax),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Kicker('COVERAGE & REVIEW'),
                              const SizedBox(height: 6),
                              Text('Curriculum workspace', style: Theme.of(context).textTheme.headlineMedium),
                              const SizedBox(height: 4),
                              const Text('Track topic coverage and queue lesson generation, unit by unit.',
                                  style: TextStyle(fontSize: 13, color: FairColors.muted)),
                            ],
                          ),
                        ),
                        const SizedBox(width: 16),
                        OutlinedButton.icon(
                          icon: const Icon(Icons.bolt_rounded, size: 16),
                          label: const Text('Generate pending'),
                          onPressed:
                              _busy.contains('all') ? null : () => unawaited(_generate(const {'all': true, 'onlyPending': true}, 'all')),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    _SummaryBar(data: data, inQueue: active.length),
                    if (active.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _QueueBanner(active: active),
                    ],
                    const SizedBox(height: 24),
                    if (data.trees.isEmpty)
                      const _MessageCard(
                        icon: Icons.account_tree_outlined,
                        title: 'No curriculum trees found',
                        detail: 'Add a curriculum source under curriculum/ to plan generation.',
                      )
                    else
                      for (final tree in data.trees) ...[
                        Kicker(tree.title, color: FairColors.muted),
                        const SizedBox(height: 10),
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

/// Four-metric coverage read-out across the whole curriculum.
class _SummaryBar extends StatelessWidget {
  const _SummaryBar({required this.data, required this.inQueue});

  final CurriculumData data;
  final int inQueue;

  @override
  Widget build(BuildContext context) {
    final drafts = data.coverage.where((e) => e.jobs.firstOrNull?.status == 'completed').length;
    final approved = data.coverage.where((e) => e.state == 'approved').length;
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: IntrinsicHeight(
        child: Row(
          children: [
            Expanded(child: _Metric(value: '${data.coverage.length}', label: 'TOPICS')),
            const VerticalDivider(width: 24, color: FairColors.line),
            Expanded(child: _Metric(value: '$drafts', label: 'DRAFTS')),
            const VerticalDivider(width: 24, color: FairColors.line),
            Expanded(child: _Metric(value: '$approved', label: 'APPROVED')),
            const VerticalDivider(width: 24, color: FairColors.line),
            Expanded(child: _Metric(value: '$inQueue', label: 'IN QUEUE')),
          ],
        ),
      ),
    );
  }
}

class _Metric extends StatelessWidget {
  const _Metric({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value,
            style: const TextStyle(
                fontSize: 26, fontWeight: FontWeight.w700, color: FairColors.ink, fontFeatures: [FontFeature.tabularFigures()])),
        const SizedBox(height: 3),
        Kicker(label, color: FairColors.muted),
      ],
    );
  }
}

/// Warning-tinted card shown while generation is running or queued.
class _QueueBanner extends StatelessWidget {
  const _QueueBanner({required this.active});

  final List<Job> active;

  @override
  Widget build(BuildContext context) {
    final running = active.where((j) => j.status == 'running').firstOrNull;
    final queued = active.where((j) => j.status == 'queued').length;
    final text = running != null
        ? 'Now generating: ${running.title}'
            '${running.message.isNotEmpty ? ' — ${running.message}' : ''}'
            '${queued > 0 ? ' $queued more in queue.' : ''}'
        : '$queued topic${queued == 1 ? '' : 's'} queued, starting…';
    return Container(
      decoration: fairCard(color: FairColors.warningBg),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          const Icon(Icons.bolt_rounded, size: 18, color: FairColors.warning),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5, color: FairColors.inkSoft, height: 1.4)),
          ),
        ],
      ),
    );
  }
}

/// One curriculum unit: tappable header (title, strand, approval counter,
/// Generate unit action) plus the expanded topic rows.
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
                  padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
                  child: Row(
                    children: [
                      Icon(expanded ? Icons.expand_more : Icons.chevron_right, size: 18, color: FairColors.muted),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(unit.title, style: Theme.of(context).textTheme.titleMedium),
                            if (unit.strand.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(unit.strand, style: const TextStyle(fontSize: 11.5, color: FairColors.muted)),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text('$approved/${unit.topics.length} approved',
                          style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: FairColors.muted,
                              fontFeatures: [FontFeature.tabularFigures()])),
                      const SizedBox(width: 10),
                      _SmallAction(label: 'Generate unit', onPressed: generating ? null : onGenerateUnit),
                    ],
                  ),
                ),
              ),
            ),
            if (expanded) ...[
              const Divider(height: 1),
              if (unit.topics.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(16),
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
                  if (i < unit.topics.length - 1) const Divider(height: 1, indent: 16, endIndent: 14),
                ],
            ],
          ],
        ),
      ),
    );
  }
}

/// One topic row: objective codes, title + truncated summary, coverage
/// StatusChip and the Generate/Regenerate action.
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
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 11, 14, 11),
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
                    child: Text(topic.codes.join(' · ').toUpperCase(),
                        style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, letterSpacing: 1.1, color: FairColors.accent)),
                  ),
                Text(topic.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: FairColors.ink)),
                if (topic.summary.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(topic.summary,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11.5, color: FairColors.muted, height: 1.4)),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Padding(padding: const EdgeInsets.only(top: 2), child: StatusChip(state)),
          const SizedBox(width: 8),
          _SmallAction(label: state == 'none' ? 'Generate' : 'Regenerate', onPressed: locked ? null : onGenerate),
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

/// Shared empty / error card.
class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.icon, required this.title, required this.detail, this.actionLabel, this.onAction});

  final IconData icon;
  final String title;
  final String detail;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: fairCard(),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 30, color: FairColors.muted),
          const SizedBox(height: 12),
          Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Text(detail, style: const TextStyle(fontSize: 12.5, color: FairColors.muted, height: 1.45), textAlign: TextAlign.center),
          if (onAction != null) ...[
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onAction, child: Text(actionLabel ?? 'Retry')),
          ],
        ],
      ),
    );
  }
}
