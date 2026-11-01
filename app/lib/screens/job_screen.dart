import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../api.dart';
import '../models.dart';
import '../state.dart';
import '../theme.dart';
import '../widgets/stage_timeline.dart';

/// Production monitor — the flagship screen of the studio.
///
/// Top to bottom: live production progress (animated bar + pulsing, ticking
/// stage timeline), the review gate with video preview and educator decision
/// controls, a lesson inspector (teaching plan / narration script / prompts),
/// quality gates, and the raw generation activity log.
///
/// Polls [jobProvider] every 2s while the job is active. Retry / cancel /
/// review actions refresh [jobsProvider] and re-arm the single-job stream so
/// the monitor updates immediately.
class JobScreen extends ConsumerStatefulWidget {
  const JobScreen({super.key, required this.jobId});
  final String jobId;

  @override
  ConsumerState<JobScreen> createState() => _JobScreenState();
}

class _JobScreenState extends ConsumerState<JobScreen> {
  final TextEditingController _noteController = TextEditingController();
  int _inspectorTab = 0;
  Future<Map<String, dynamic>>? _promptsFuture;
  bool _actionBusy = false;
  bool _reviewBusy = false;

  @override
  void didUpdateWidget(JobScreen old) {
    super.didUpdateWidget(old);
    if (old.jobId != widget.jobId) {
      _inspectorTab = 0;
      _promptsFuture = null;
      _noteController.clear();
    }
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  // ---- Actions ------------------------------------------------------------

  Future<void> _runJobAction(String action) async {
    if (_actionBusy) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _actionBusy = true);
    try {
      await ref.read(apiProvider).jobAction(widget.jobId, action);
      await ref.read(jobsProvider.notifier).refresh();
      ref.invalidate(jobProvider(widget.jobId));
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text('$error')));
    } finally {
      if (mounted) setState(() => _actionBusy = false);
    }
  }

  Future<void> _submitReview(String decision) async {
    if (_reviewBusy) return;
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _reviewBusy = true);
    try {
      await ref.read(apiProvider).review(widget.jobId, decision: decision, note: _noteController.text.trim());
      await ref.read(jobsProvider.notifier).refresh();
      ref.invalidate(jobProvider(widget.jobId));
      messenger.showSnackBar(const SnackBar(content: Text('Review saved')));
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text('$error')));
    } finally {
      if (mounted) setState(() => _reviewBusy = false);
    }
  }

  void _open(String url) => unawaited(launchUrl(Uri.parse(url)));

  void _selectTab(int index, Job job) {
    setState(() => _inspectorTab = index);
    if (index == 2) _ensurePrompts(job);
  }

  void _ensurePrompts(Job job) {
    if (_promptsFuture != null) return;
    final path = job.artifacts['prompts'];
    if (path == null || path.isEmpty) return;
    _promptsFuture = ref.read(apiProvider).artifactJson(path);
  }

  // ---- Build --------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final jobAsync = ref.watch(jobProvider(widget.jobId));
    return jobAsync.when(
      data: (job) => _buildMonitor(context, job),
      loading: () => _buildLoading(context),
      error: (error, _) => _buildError(context, error),
    );
  }

  Widget _buildMonitor(BuildContext context, Job job) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(28, 18, 28, 40),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1100),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => context.go('/'),
                    icon: const Icon(Icons.arrow_back, size: 15),
                    label: const Text('Dashboard'),
                    style: TextButton.styleFrom(foregroundColor: FairColors.muted),
                  ),
                ),
                const SizedBox(height: 6),
                _buildHeader(context, job),
                const SizedBox(height: 18),
                _buildProgressCard(context, job),
                if (job.isReady) ...[
                  const SizedBox(height: FairDimens.gap),
                  _buildReviewCard(context, job),
                ],
                if (job.lesson != null) ...[
                  const SizedBox(height: FairDimens.gap),
                  _buildInspectorCard(context, job),
                ],
                if (job.report != null) ...[
                  const SizedBox(height: FairDimens.gap),
                  _buildQualityCard(context, job),
                ],
                const SizedBox(height: FairDimens.gap),
                _buildActivityCard(context, job),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLoading(BuildContext context) {
    return const Center(
      child: SizedBox(
        width: 240,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.all(Radius.circular(2)),
              child: LinearProgressIndicator(minHeight: 3),
            ),
            SizedBox(height: 14),
            Text('Loading production monitor…',
                style: TextStyle(fontSize: 12.5, color: FairColors.muted, letterSpacing: 0.2)),
          ],
        ),
      ),
    );
  }

  Widget _buildError(BuildContext context, Object error) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: EmptyState(
          icon: Icons.cloud_off_outlined,
          title: 'Could not load this job',
          body: '$error',
          action: Wrap(
            spacing: 10,
            runSpacing: 8,
            children: [
              OutlinedButton(onPressed: () => context.go('/'), child: const Text('Dashboard')),
              FilledButton(onPressed: () => ref.invalidate(jobProvider(widget.jobId)), child: const Text('Retry')),
            ],
          ),
        ),
      ),
    );
  }

  // ---- Header -------------------------------------------------------------

  Widget _buildHeader(BuildContext context, Job job) {
    final briefText = job.brief['text'];
    final excerpt = briefText is String && briefText.trim().isNotEmpty && briefText.trim() != job.title
        ? _excerpt(briefText)
        : null;
    final status = job.isReady && job.review != null ? job.review!.decision : job.status;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Kicker('PRODUCTION MONITOR'),
        const SizedBox(height: 8),
        Text(job.title, style: display(26), maxLines: 3, overflow: TextOverflow.ellipsis),
        if (excerpt != null) ...[
          const SizedBox(height: 6),
          Text(excerpt,
              style: const TextStyle(fontSize: 13, color: FairColors.muted, height: 1.5),
              maxLines: 3,
              overflow: TextOverflow.ellipsis),
        ],
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            _metaChip(Icons.precision_manufacturing_outlined,
                job.generationVersion == 'open-source' ? 'Open-source pipeline' : 'Classic pipeline'),
            StatusChip(status),
            if (job.createdAt != null)
              _metaChip(Icons.schedule_outlined, DateFormat('d MMM y · HH:mm').format(job.createdAt!.toLocal())),
            if (job.attempts > 1) _metaChip(Icons.replay_outlined, 'Attempt ${job.attempts}'),
          ],
        ),
      ],
    );
  }

  // ---- Production progress ------------------------------------------------

  Widget _buildProgressCard(BuildContext context, Job job) {
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Kicker('PRODUCTION PIPELINE'),
          const SizedBox(height: 12),
          JobProgressBar(job: job),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 14),
          StageTimeline(job: job),
          if (job.error != null && job.error!.isNotEmpty) ...[
            const SizedBox(height: 14),
            _NoticeBox(
              icon: Icons.error_outline,
              color: FairColors.error,
              bg: FairColors.errorBg,
              lines: [job.error!],
            ),
          ],
          if (job.canRetry || job.isActive) ...[
            const SizedBox(height: 16),
            Wrap(
              spacing: 10,
              runSpacing: 8,
              children: [
                if (job.canRetry)
                  FilledButton.icon(
                    onPressed: _actionBusy ? null : () => _runJobAction('retry'),
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('Try again'),
                  ),
                if (job.isActive)
                  OutlinedButton.icon(
                    onPressed: _actionBusy ? null : () => _runJobAction('cancel'),
                    icon: const Icon(Icons.stop_circle_outlined, size: 18),
                    label: Text(_actionBusy ? 'Working…' : 'Stop generation'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: FairColors.error,
                      side: BorderSide(color: FairColors.error.withValues(alpha: 0.4)),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  // ---- Review gate ----------------------------------------------------------

  Widget _buildReviewCard(BuildContext context, Job job) {
    final api = ref.read(apiProvider);
    final videoPath = job.artifacts['video'];
    final hasVideo = videoPath != null && videoPath.isNotEmpty;
    final otherArtifacts = [
      for (final e in job.artifacts.entries)
        if (e.key != 'video' && e.value.isNotEmpty) e,
    ];
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Kicker('REVIEW GATE'),
          const SizedBox(height: 8),
          Text('Watch the export, then decide', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          const Text('Nothing leaves the studio until an educator approves it.',
              style: TextStyle(fontSize: 12.5, color: FairColors.muted)),
          const SizedBox(height: 16),
          if (hasVideo)
            _VideoPanel(url: api.artifactUrl(videoPath))
          else
            const _NoticeBox(
              icon: Icons.videocam_off_outlined,
              color: FairColors.amber,
              bg: FairColors.amberSoft,
              lines: ['No video artifact was produced — check the quality report and generation activity below.'],
            ),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (hasVideo)
                FilledButton.icon(
                  onPressed: () => _open(api.artifactUrl(videoPath)),
                  icon: const Icon(Icons.download_outlined, size: 17),
                  label: const Text('Download video'),
                ),
              for (final artifact in otherArtifacts)
                OutlinedButton.icon(
                  onPressed: () => _open(api.artifactUrl(artifact.value)),
                  icon: const Icon(Icons.description_outlined, size: 15),
                  label: Text(StudioApi.artifactLabel(artifact.key), style: mono(11, FairColors.inkSoft)),
                ),
            ],
          ),
          const SizedBox(height: 16),
          const Divider(height: 1),
          const SizedBox(height: 14),
          if (job.review != null) ...[
            _reviewLine(job.review!),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _noteController,
            minLines: 1,
            maxLines: 3,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              hintText: job.review == null ? 'Review note — what should change? (optional)' : 'Add a note to update the decision',
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 10,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: _reviewBusy ? null : () => _submitReview('approved'),
                icon: const Icon(Icons.check, size: 17),
                label: const Text('Approve'),
              ),
              OutlinedButton.icon(
                onPressed: _reviewBusy ? null : () => _submitReview('needs-changes'),
                icon: const Icon(Icons.edit_note, size: 18),
                label: const Text('Needs changes'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: FairColors.amber,
                  side: const BorderSide(color: FairColors.amber),
                ),
              ),
              OutlinedButton.icon(
                onPressed: _reviewBusy ? null : () => _submitReview('rejected'),
                icon: const Icon(Icons.close, size: 17),
                label: const Text('Reject'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: FairColors.error,
                  side: const BorderSide(color: FairColors.error),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _reviewLine(Review review) {
    final at = review.at;
    final parts = <String>[
      if (review.note.isNotEmpty) '“${review.note}”',
      [
        if (review.reviewer.isNotEmpty) review.reviewer,
        if (at != null) DateFormat('d MMM · HH:mm').format(at.toLocal()),
      ].join(' · '),
    ].where((s) => s.isNotEmpty).join(' — ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: fairWell(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StatusChip(review.decision),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(parts.isEmpty ? 'Decision recorded' : parts,
                  style: const TextStyle(fontSize: 12, color: FairColors.inkSoft, height: 1.45)),
            ),
          ),
        ],
      ),
    );
  }

  // ---- Inspector ------------------------------------------------------------

  Widget _buildInspectorCard(BuildContext context, Job job) {
    final lesson = job.lesson!;
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Kicker('LESSON INSPECTOR'),
          const SizedBox(height: 12),
          _SegmentedTabs(
            labels: const ['Teaching plan', 'Narration script', 'Prompts'],
            selected: _inspectorTab,
            onSelect: (i) => _selectTab(i, job),
          ),
          const SizedBox(height: 16),
          switch (_inspectorTab) {
            0 => _PlanTab(lesson: lesson),
            1 => _ScriptTab(lesson: lesson),
            _ => _buildPromptsTab(context, job),
          },
        ],
      ),
    );
  }

  Widget _buildPromptsTab(BuildContext context, Job job) {
    final path = job.artifacts['prompts'];
    if (!job.isReady || path == null || path.isEmpty) {
      final briefText = job.brief['text'];
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _NoticeBox(
            icon: Icons.hourglass_top_outlined,
            color: FairColors.amber,
            bg: FairColors.amberSoft,
            lines: ['Prompts appear after export completes.'],
          ),
          if (briefText is String && briefText.trim().isNotEmpty) ...[
            _sectionLabel('SOURCE BRIEF'),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: fairWell(),
              child: Text(briefText.trim(), style: const TextStyle(fontSize: 12.5, color: FairColors.muted, height: 1.5)),
            ),
          ],
        ],
      );
    }
    _promptsFuture ??= ref.read(apiProvider).artifactJson(path);
    return FutureBuilder<Map<String, dynamic>>(
      future: _promptsFuture,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return _NoticeBox(
            icon: Icons.error_outline,
            color: FairColors.error,
            bg: FairColors.errorBg,
            lines: ['Could not load the generation prompts — ${snapshot.error}'],
          );
        }
        if (!snapshot.hasData) {
          return const Padding(
            padding: EdgeInsets.all(28),
            child: Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: FairColors.accent))),
          );
        }
        final prompts = (snapshot.data!['prompts'] as List? ?? const []).whereType<Map>().toList();
        if (prompts.isEmpty) {
          return const Text('No prompts were recorded for this job.', style: TextStyle(fontSize: 12.5, color: FairColors.muted));
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [for (final prompt in prompts) _promptCard(prompt)],
        );
      },
    );
  }

  Widget _promptCard(Map prompt) {
    final file = '${prompt['file'] ?? 'prompt'}';
    final text = '${prompt['text'] ?? ''}';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: fairWell(),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        shape: const RoundedRectangleBorder(),
        collapsedShape: const RoundedRectangleBorder(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 12),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        iconColor: FairColors.muted,
        collapsedIconColor: FairColors.muted,
        title: Row(
          children: [
            const Icon(Icons.terminal, size: 14, color: FairColors.accent),
            const SizedBox(width: 7),
            Expanded(
              child: Text(
                file,
                style: mono(11, FairColors.inkSoft, FontWeight.w600),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: SelectableText(
              text.isEmpty ? '(empty prompt)' : text,
              style: mono(11, FairColors.inkSoft, FontWeight.w400),
            ),
          ),
        ],
      ),
    );
  }

  // ---- Quality gates --------------------------------------------------------

  Widget _buildQualityCard(BuildContext context, Job job) {
    final report = job.report!;
    final passed = report.checks.where((c) => c.passed).length;
    final total = report.checks.length;
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Kicker('QUALITY GATES'),
              const Spacer(),
              if (report.passed != null)
                _miniTag(
                  report.passed! ? Icons.verified_outlined : Icons.warning_amber_outlined,
                  report.passed! ? 'Passed' : 'Needs attention',
                  color: report.passed! ? FairColors.success : FairColors.amber,
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            total == 0 ? 'No gate checks were recorded' : '$passed of $total gates passed',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (report.origin != null && report.origin!.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text('Checked by ${report.origin}', style: mono(10.5, FairColors.muted, FontWeight.w400)),
          ],
          if (total > 0) ...[
            const SizedBox(height: 14),
            LayoutBuilder(
              builder: (context, constraints) {
                final twoCol = constraints.maxWidth > 640;
                final width = twoCol ? (constraints.maxWidth - 10) / 2 : constraints.maxWidth;
                return Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [for (final check in report.checks) SizedBox(width: width, child: _gateCard(check))],
                );
              },
            ),
          ],
          if (report.coverage.isNotEmpty) ...[
            _sectionLabel('OBJECTIVE COVERAGE'),
            for (final coverage in report.coverage) _coverageRow(coverage),
          ],
          if (report.warnings.isNotEmpty) ...[
            _sectionLabel('WARNINGS'),
            _NoticeBox(
              icon: Icons.warning_amber_outlined,
              color: FairColors.amber,
              bg: FairColors.amberSoft,
              lines: report.warnings,
            ),
          ],
        ],
      ),
    );
  }

  Widget _gateCard(GateCheck check) {
    final color = check.passed ? FairColors.accent : FairColors.error;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: fairWell(),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(check.passed ? Icons.check_circle : Icons.error, size: 15, color: color),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(check.name, style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
                if (check.detail.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text(check.detail, style: mono(10.5, FairColors.muted, FontWeight.w400)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _coverageRow(ObjectiveCoverage coverage) {
    final met = coverage.explained && coverage.practised;
    final summary = '${coverage.explained ? 'explained' : 'not explained'} · ${coverage.practised ? 'practised' : 'not practised'}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(met ? Icons.check_circle_outline : Icons.radio_button_unchecked,
                size: 14, color: met ? FairColors.accent : FairColors.muted),
          ),
          const SizedBox(width: 8),
          Expanded(child: Text(coverage.text, style: const TextStyle(fontSize: 12.5, color: FairColors.inkSoft, height: 1.4))),
          const SizedBox(width: 8),
          Text(summary, style: mono(9.5, met ? FairColors.accent : FairColors.amber, FontWeight.w600)),
        ],
      ),
    );
  }

  // ---- Generation activity ---------------------------------------------------

  Widget _buildActivityCard(BuildContext context, Job job) {
    final events = job.events;
    return Container(
      decoration: fairCard(),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        shape: const RoundedRectangleBorder(),
        collapsedShape: const RoundedRectangleBorder(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 20),
        childrenPadding: const EdgeInsets.fromLTRB(20, 2, 20, 16),
        iconColor: FairColors.muted,
        collapsedIconColor: FairColors.muted,
        leading: const Icon(Icons.terminal, size: 16, color: FairColors.muted),
        title: const Text('Generation activity', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        subtitle: Text('${events.length} event${events.length == 1 ? '' : 's'} recorded',
            style: mono(10.5, FairColors.muted, FontWeight.w400)),
        children: [
          Container(
            constraints: const BoxConstraints(maxHeight: 320),
            decoration: fairWell(),
            child: events.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(14),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: Text('No events yet.', style: TextStyle(fontSize: 12, color: FairColors.muted)),
                    ),
                  )
                : ListView.builder(
                    reverse: true,
                    shrinkWrap: true,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    itemCount: events.length,
                    itemBuilder: (context, index) => _eventRow(events[events.length - 1 - index]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _eventRow(JobEvent event) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3.5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 46,
            child: Text(
              event.at != null ? DateFormat('HH:mm').format(event.at!.toLocal()) : '--:--',
              style: mono(10.5, FairColors.faint, FontWeight.w400),
            ),
          ),
          SizedBox(
            width: 88,
            child: Text(
              event.stage.toUpperCase(),
              style: mono(9.5, FairColors.accent, FontWeight.w600).copyWith(letterSpacing: 0.6),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Expanded(child: Text(event.message, style: mono(11, FairColors.inkSoft, FontWeight.w400))),
        ],
      ),
    );
  }

  // ---- Shared bits ------------------------------------------------------------

  static String _excerpt(String text) {
    final trimmed = text.trim();
    if (trimmed.length <= 140) return trimmed;
    return '${trimmed.substring(0, 140).trimRight()}…';
  }

  Widget _metaChip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: fairWell(radius: 20),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: FairColors.muted),
          const SizedBox(width: 5),
          Text(label, style: mono(10, FairColors.inkSoft)),
        ],
      ),
    );
  }

  Widget _miniTag(IconData icon, String label, {Color color = FairColors.muted}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 10, color: color),
          const SizedBox(width: 4),
          Text(label, style: mono(9, color, FontWeight.w600).copyWith(letterSpacing: 0.4)),
        ],
      ),
    );
  }
}

/// Padded subsection heading used inside cards.
Widget _sectionLabel(String label) {
  return Padding(
    padding: const EdgeInsets.only(top: 16, bottom: 7),
    child: Kicker(label, color: FairColors.muted),
  );
}

/// Consistent notice surface — icon + colored copy on a soft tinted panel.
class _NoticeBox extends StatelessWidget {
  const _NoticeBox({required this.icon, required this.color, required this.bg, required this.lines});
  final IconData icon;
  final Color color, bg;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(FairDimens.radiusSm),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(icon, size: 15, color: color),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < lines.length; i++)
                  Padding(
                    padding: EdgeInsets.only(bottom: i == lines.length - 1 ? 0 : 3),
                    child: Text(lines[i], style: TextStyle(fontSize: 12, color: color, height: 1.45)),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Segmented control for the inspector — avoids a DefaultTabController so the
/// selected tab can drive lazy loading (prompts) in the parent state.
class _SegmentedTabs extends StatelessWidget {
  const _SegmentedTabs({required this.labels, required this.selected, required this.onSelect});
  final List<String> labels;
  final int selected;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: fairWell(radius: 10),
      child: Row(
        children: [
          for (var i = 0; i < labels.length; i++)
            Expanded(
              child: InkWell(
                onTap: () => onSelect(i),
                borderRadius: BorderRadius.circular(8),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  curve: Curves.easeOut,
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  decoration: BoxDecoration(
                    color: i == selected ? FairColors.surfaceRaised : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: i == selected ? FairColors.strongLine : Colors.transparent),
                  ),
                  child: Text(
                    labels[i],
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: i == selected ? FontWeight.w700 : FontWeight.w500,
                      color: i == selected ? FairColors.ink : FairColors.muted,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Teaching plan tab: concept, objectives, prerequisites, warnings, scenes.
class _PlanTab extends StatelessWidget {
  const _PlanTab({required this.lesson});
  final Lesson lesson;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (lesson.conceptText.isNotEmpty) ...[
          _sectionLabel('CONCEPT'),
          Text(lesson.conceptText, style: const TextStyle(fontSize: 13, color: FairColors.inkSoft, height: 1.55)),
        ],
        if (lesson.objectives.isNotEmpty) ...[
          _sectionLabel('OBJECTIVES'),
          for (final objective in lesson.objectives) _bullet(objective),
        ],
        if (lesson.prerequisites.isNotEmpty) ...[
          _sectionLabel('PREREQUISITES'),
          Text(lesson.prerequisites.join(' · '), style: const TextStyle(fontSize: 12, color: FairColors.muted, height: 1.5)),
        ],
        if (lesson.warnings.isNotEmpty) ...[
          _sectionLabel('WARNINGS'),
          _NoticeBox(
            icon: Icons.warning_amber_outlined,
            color: FairColors.amber,
            bg: FairColors.amberSoft,
            lines: lesson.warnings,
          ),
        ],
        if (lesson.scenes.isNotEmpty) ...[
          _sectionLabel('SCENES (${lesson.scenes.length})'),
          for (var i = 0; i < lesson.scenes.length; i++) _sceneTile(context, i, lesson.scenes[i]),
        ],
      ],
    );
  }

  Widget _bullet(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('•  ', style: TextStyle(color: FairColors.accent, fontWeight: FontWeight.w700, fontSize: 13)),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 12.5, color: FairColors.inkSoft, height: 1.45))),
        ],
      ),
    );
  }

  Widget _sceneTile(BuildContext context, int index, Scene scene) {
    final heading = '${scene.beat.isNotEmpty ? '${scene.beat} · ' : ''}${scene.title.isNotEmpty ? scene.title : 'Scene ${index + 1}'}';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: fairWell(),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        shape: const RoundedRectangleBorder(),
        collapsedShape: const RoundedRectangleBorder(),
        tilePadding: const EdgeInsets.symmetric(horizontal: 12),
        childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
        iconColor: FairColors.muted,
        collapsedIconColor: FairColors.muted,
        leading: _numBadge(index),
        title: Text(heading, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Wrap(
            spacing: 6,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (scene.visualLabel.isNotEmpty)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.image_outlined, size: 11, color: FairColors.muted),
                    const SizedBox(width: 3),
                    Flexible(
                      child: Text(scene.visualLabel,
                          style: const TextStyle(fontSize: 11, color: FairColors.muted), overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              if (scene.pauseSeconds > 0)
                _pauseTag(scene.pauseSeconds),
              if (scene.hasInteraction) _interactionTag(),
            ],
          ),
        ),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              scene.narration.isNotEmpty ? scene.narration : 'No narration recorded for this scene.',
              style: TextStyle(
                fontSize: 12.5,
                height: 1.5,
                color: scene.narration.isNotEmpty ? FairColors.inkSoft : FairColors.muted,
                fontStyle: scene.narration.isNotEmpty ? FontStyle.normal : FontStyle.italic,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _pauseTag(double pauseSeconds) {
    final long = pauseSeconds > 3;
    final color = long ? FairColors.amber : FairColors.muted;
    return _tag(Icons.pause_circle_outline, long ? '>3s pause' : '${pauseSeconds.toStringAsFixed(0)}s pause', color);
  }

  Widget _interactionTag() => _tag(Icons.touch_app_outlined, 'Interaction', FairColors.accent);

  Widget _tag(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 10, color: color),
          const SizedBox(width: 3),
          Text(label, style: mono(9, color, FontWeight.w600)),
        ],
      ),
    );
  }
}

/// Shared numbered-circle badge for scene rows.
Widget _numBadge(int index) {
  return Container(
    width: 26,
    height: 26,
    decoration: const BoxDecoration(color: FairColors.accentSoft, shape: BoxShape.circle),
    child: Center(
      child: Text('${index + 1}', style: mono(11, FairColors.accent, FontWeight.w700)),
    ),
  );
}

/// Narration script tab: every scene as a numbered card.
class _ScriptTab extends StatelessWidget {
  const _ScriptTab({required this.lesson});
  final Lesson lesson;

  @override
  Widget build(BuildContext context) {
    if (lesson.scenes.isEmpty) {
      return const Text('No scenes in the teaching plan yet.', style: TextStyle(fontSize: 12.5, color: FairColors.muted));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < lesson.scenes.length; i++) _scriptCard(i, lesson.scenes[i]),
      ],
    );
  }

  Widget _scriptCard(int index, Scene scene) {
    final heading = '${scene.beat.isNotEmpty ? '${scene.beat} · ' : ''}${scene.title.isNotEmpty ? scene.title : 'Scene ${index + 1}'}';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: fairWell(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _numBadge(index),
              const SizedBox(width: 9),
              Expanded(
                child: Text(heading,
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: FairColors.ink),
                    overflow: TextOverflow.ellipsis),
              ),
            ],
          ),
          const SizedBox(height: 9),
          Text(
            scene.narration.isNotEmpty ? scene.narration : 'No narration recorded for this scene.',
            style: TextStyle(
              fontSize: 12.5,
              height: 1.6,
              color: scene.narration.isNotEmpty ? FairColors.inkSoft : FairColors.muted,
              fontStyle: scene.narration.isNotEmpty ? FontStyle.normal : FontStyle.italic,
            ),
          ),
          if (scene.visualLabel.isNotEmpty) ...[
            const SizedBox(height: 9),
            Row(
              children: [
                const Icon(Icons.crop_original_outlined, size: 12, color: FairColors.muted),
                const SizedBox(width: 5),
                Expanded(
                  child: Text('On screen: ${scene.visualLabel}',
                      style: const TextStyle(fontSize: 11.5, color: FairColors.muted, fontStyle: FontStyle.italic),
                      overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Preview monitor for the exported MP4 — a letterboxed 16:9 stage on the
/// near-black monitor surface. Loads lazily once the job is ready, tap-to-toggle
/// playback, scrubbable progress bar, position/duration readout.
class _VideoPanel extends StatefulWidget {
  const _VideoPanel({required this.url});
  final String url;

  @override
  State<_VideoPanel> createState() => _VideoPanelState();
}

class _VideoPanelState extends State<_VideoPanel> {
  VideoPlayerController? _controller;
  bool _failed = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _start(widget.url);
  }

  void _start(String url) {
    final controller = VideoPlayerController.networkUrl(Uri.parse(url));
    _controller = controller;
    _failed = false;
    _error = null;
    controller.initialize().then((_) {
      if (!mounted || _controller != controller) return;
      setState(() {});
    }).catchError((Object error) {
      if (!mounted || _controller != controller) return;
      setState(() {
        _failed = true;
        _error = '$error';
      });
    });
  }

  @override
  void didUpdateWidget(_VideoPanel old) {
    super.didUpdateWidget(old);
    if (old.url != widget.url) {
      final old2 = _controller;
      _controller = null;
      if (old2 != null) unawaited(old2.dispose());
      _start(widget.url);
    }
  }

  @override
  void dispose() {
    final controller = _controller;
    _controller = null;
    if (controller != null) unawaited(controller.dispose());
    super.dispose();
  }

  static String _fmt(Duration duration) {
    final hours = duration.inHours;
    final minutes = duration.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds = duration.inSeconds.remainder(60).toString().padLeft(2, '0');
    return hours > 0 ? '$hours:$minutes:$seconds' : '$minutes:$seconds';
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final ready = controller != null && controller.value.isInitialized;
    return Container(
      decoration: BoxDecoration(
        color: FairColors.monitor,
        borderRadius: BorderRadius.circular(FairDimens.radius),
        border: Border.all(color: FairColors.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: _failed
          ? _playerMessage(Icons.error_outline, 'Could not load the video preview${_error != null ? '\n$_error' : ''}')
          : !ready
              ? const AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Center(
                    child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white70)),
                  ),
                )
              : ValueListenableBuilder<VideoPlayerValue>(
                  valueListenable: controller,
                  builder: (context, value, _) {
                    final aspect = value.aspectRatio > 0 ? value.aspectRatio : 16 / 9;
                    return Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AspectRatio(
                          aspectRatio: 16 / 9,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              Center(
                                child: AspectRatio(
                                  aspectRatio: aspect,
                                  child: VideoPlayer(controller),
                                ),
                              ),
                              Positioned.fill(
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () => controller.value.isPlaying ? controller.pause() : controller.play(),
                                ),
                              ),
                              if (!value.isPlaying)
                                Center(
                                  child: IgnorePointer(
                                    child: Container(
                                      width: 58,
                                      height: 58,
                                      decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.45), shape: BoxShape.circle),
                                      child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 34),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        _controls(controller, value),
                      ],
                    );
                  },
                ),
    );
  }

  Widget _controls(VideoPlayerController controller, VideoPlayerValue value) {
    return Container(
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: FairColors.line)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      child: Row(
        children: [
          IconButton(
            onPressed: () => value.isPlaying ? controller.pause() : controller.play(),
            icon: Icon(value.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded, color: Colors.white, size: 26),
            visualDensity: VisualDensity.compact,
            splashRadius: 18,
          ),
          Text(
            '${_fmt(value.position)} / ${_fmt(value.duration)}',
            style: mono(10.5, FairColors.inkSoft, FontWeight.w400),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: SizedBox(
              height: 16,
              child: VideoProgressIndicator(
                controller,
                allowScrubbing: true,
                colors: const VideoProgressColors(
                  playedColor: FairColors.accent,
                  bufferedColor: Colors.white30,
                  backgroundColor: Colors.white24,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
        ],
      ),
    );
  }

  Widget _playerMessage(IconData icon, String message) {
    return AspectRatio(
      aspectRatio: 16 / 9,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 26, color: Colors.white54),
              const SizedBox(height: 8),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white60, fontSize: 12, height: 1.4)),
            ],
          ),
        ),
      ),
    );
  }
}
