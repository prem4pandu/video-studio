import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../models.dart';
import '../state.dart';
import '../theme.dart';

/// Educator review queue — every rendered draft waits here for a human
/// decision. Awaiting jobs get an inline preview, a note field and the three
/// review actions; decided jobs collapse into a dimmer ledger. Mirrors the
/// review section of public/curriculum.mjs.
class ReviewScreen extends ConsumerWidget {
  const ReviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobs = ref.watch(jobsProvider);
    return SafeArea(
      child: jobs.when(
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
              Text('Loading review queue…', style: TextStyle(fontSize: 12.5, color: FairColors.muted)),
            ],
          ),
        ),
        error: (error, _) => EmptyState(
          icon: Icons.cloud_off_outlined,
          title: 'Review queue unavailable',
          body: '$error',
          action: OutlinedButton.icon(
            onPressed: () => unawaited(ref.read(jobsProvider.notifier).refresh()),
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Retry'),
          ),
        ),
        data: (list) => _QueueView(jobs: list),
      ),
    );
  }
}

/// Scrollable queue: header, the awaiting-decision cards, then the decided
/// ledger.
class _QueueView extends StatelessWidget {
  const _QueueView({required this.jobs});

  final List<Job> jobs;

  @override
  Widget build(BuildContext context) {
    final ready = jobs.where((j) => j.isReady).toList();
    final awaiting = ready.where((j) => j.review == null).toList();
    final decided = ready.where((j) => j.review != null).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 36),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: FairDimens.contentMax),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Kicker('REVIEW QUEUE'),
                  const SizedBox(height: 10),
                  Text('Educator review', style: display(26)),
                  const SizedBox(height: 7),
                  const Text(
                    'Every rendered draft waits for a human decision.',
                    style: TextStyle(fontSize: 13.5, color: FairColors.muted, height: 1.45),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    '${awaiting.length} awaiting decision',
                    style: mono(11.5, FairColors.amber, FontWeight.w600),
                  ),
                ],
              ),
              const SizedBox(height: 30),
              if (awaiting.isEmpty && decided.isEmpty)
                const EmptyState(
                  icon: Icons.fact_check_outlined,
                  title: 'Queue is clear',
                  body: 'Rendered drafts wait here for an educator decision.',
                )
              else ...[
                if (awaiting.isNotEmpty) ...[
                  _SectionLabel(kicker: 'AWAITING DECISION', trailing: '${awaiting.length}'),
                  const SizedBox(height: 14),
                  for (final job in awaiting)
                    Padding(
                      padding: const EdgeInsets.only(bottom: FairDimens.gap),
                      child: _ReviewCard(key: ValueKey(job.id), job: job),
                    ),
                ],
                if (decided.isNotEmpty) ...[
                  SizedBox(height: awaiting.isEmpty ? 0 : 20),
                  _SectionLabel(kicker: 'DECIDED', trailing: '${decided.length}'),
                  const SizedBox(height: 14),
                  Container(
                    decoration: fairCard(color: FairColors.surfaceSoft),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(FairDimens.radius),
                      child: Material(
                        type: MaterialType.transparency,
                        child: Column(
                          children: [
                            for (var i = 0; i < decided.length; i++) ...[
                              if (i > 0) const Divider(height: 1),
                              _DecidedRow(job: decided[i]),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Kicker + right-aligned count above a queue section.
class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.kicker, required this.trailing});

  final String kicker;
  final String trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Kicker(kicker, color: FairColors.muted),
        const Spacer(),
        Text(trailing, style: mono(10.5, FairColors.muted)),
      ],
    );
  }
}

/// One rendered draft awaiting a decision: title + StatusChip, mono meta row,
/// letterboxed inline video preview, note field and the three review actions.
class _ReviewCard extends ConsumerStatefulWidget {
  const _ReviewCard({required this.job, super.key});

  final Job job;

  @override
  ConsumerState<_ReviewCard> createState() => _ReviewCardState();
}

class _ReviewCardState extends ConsumerState<_ReviewCard> {
  static final _date = DateFormat('d MMM y, HH:mm');
  final _note = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  static String _decisionLabel(String decision) => switch (decision) {
        'approved' => 'approved',
        'needs-changes' => 'needs changes',
        'rejected' => 'rejected',
        _ => decision,
      };

  Future<void> _decide(String decision) async {
    if (_busy) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(apiProvider).review(widget.job.id, decision: decision, note: _note.text.trim());
      unawaited(ref.read(jobsProvider.notifier).refresh());
      messenger.showSnackBar(SnackBar(content: Text('Decision recorded: ${_decisionLabel(decision)}.')));
    } catch (error) {
      messenger.showSnackBar(SnackBar(backgroundColor: FairColors.error, content: Text('$error')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openVideo(String url) async {
    try {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (_) {
      // No external handler — the inline preview still works.
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final api = ref.read(apiProvider);
    final videoPath = job.artifacts['video'];
    final created = job.createdAt;

    String? topicLine;
    final topic = job.brief['topic'];
    if (topic is Map) {
      final unitId = '${topic['unitId'] ?? ''}';
      final codes = (topic['objectiveCodes'] as List? ?? const [])
          .map((c) => '$c')
          .where((c) => c.isNotEmpty)
          .toList();
      final parts = [
        if (unitId.isNotEmpty) unitId,
        if (codes.isNotEmpty) 'objectives ${codes.join(', ')}',
      ];
      if (parts.isNotEmpty) topicLine = parts.join(' · ');
    }

    final meta = <String>[
      if (created != null) _date.format(created.toLocal()),
      '${job.generationVersion} generation',
      ?topicLine,
    ].join(' · ');

    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.fromLTRB(20, 18, 16, 20),
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
                    Text(job.title, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 6),
                    Text(meta, style: mono(10.5, FairColors.muted)),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: StatusChip(job.status == 'authored-benchmark' ? 'completed' : job.status),
              ),
              if (videoPath != null)
                IconButton(
                  tooltip: 'Open video file',
                  icon: const Icon(Icons.download_outlined, size: 18, color: FairColors.muted),
                  onPressed: () => unawaited(_openVideo(api.artifactUrl(videoPath))),
                ),
              IconButton(
                tooltip: 'Open job detail',
                icon: const Icon(Icons.arrow_outward_rounded, size: 18, color: FairColors.muted),
                onPressed: () => context.go('/jobs/${job.id}'),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _InlineVideo(videoUrl: videoPath == null ? null : api.artifactUrl(videoPath)),
          const SizedBox(height: 14),
          TextField(
            controller: _note,
            maxLength: 2000,
            maxLines: 1,
            decoration: const InputDecoration(
              labelText: 'Review note',
              hintText: 'Add a note for the next revision',
              counterText: '',
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              FilledButton.icon(
                onPressed: _busy ? null : () => unawaited(_decide('approved')),
                icon: const Icon(Icons.check_rounded, size: 17),
                label: const Text('Approve'),
              ),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: FairColors.amber),
                onPressed: _busy ? null : () => unawaited(_decide('needs-changes')),
                icon: const Icon(Icons.edit_note_outlined, size: 17),
                label: const Text('Needs changes'),
              ),
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(foregroundColor: FairColors.error),
                onPressed: _busy ? null : () => unawaited(_decide('rejected')),
                icon: const Icon(Icons.close_rounded, size: 17),
                label: const Text('Reject'),
              ),
              if (_busy)
                const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: FairColors.accent),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Dimmer ledger row for a decided job — StatusChip, title, note excerpt and
/// a mono timestamp. Taps through to the job detail.
class _DecidedRow extends StatelessWidget {
  const _DecidedRow({required this.job});

  final Job job;

  static final _date = DateFormat('d MMM y, HH:mm');

  @override
  Widget build(BuildContext context) {
    final review = job.review!;
    final stamp = review.at ?? job.updatedAt ?? job.createdAt;
    final excerpt =
        review.note.isNotEmpty ? review.note : (review.reviewer.isNotEmpty ? 'by ${review.reviewer}' : '');
    return InkWell(
      onTap: () => context.go('/jobs/${job.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
        child: Row(
          children: [
            StatusChip(review.decision),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    job.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: FairColors.inkSoft),
                  ),
                  if (excerpt.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 3),
                      child: Text(
                        excerpt,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 11.5, color: FairColors.muted, fontStyle: FontStyle.italic),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 14),
            if (stamp != null) Text(_date.format(stamp.toLocal()), style: mono(10, FairColors.muted)),
            const SizedBox(width: 6),
            const Icon(Icons.chevron_right, size: 16, color: FairColors.faint),
          ],
        ),
      ),
    );
  }
}

/// Lazy inline preview: monitor-dark 16:9 frame that only spins up a
/// VideoPlayerController on first tap.
class _InlineVideo extends StatefulWidget {
  const _InlineVideo({this.videoUrl});

  final String? videoUrl;

  @override
  State<_InlineVideo> createState() => _InlineVideoState();
}

class _InlineVideoState extends State<_InlineVideo> {
  VideoPlayerController? _controller;
  bool _loading = false;
  bool _failed = false;

  Future<void> _load() async {
    final url = widget.videoUrl;
    if (url == null || url.isEmpty || _controller != null || _loading) return;
    setState(() {
      _loading = true;
      _failed = false;
    });
    final controller = VideoPlayerController.networkUrl(Uri.parse(url));
    try {
      await controller.initialize();
    } catch (_) {
      await controller.dispose();
      if (mounted) {
        setState(() {
          _loading = false;
          _failed = true;
        });
      }
      return;
    }
    if (!mounted) {
      await controller.dispose();
      return;
    }
    controller.addListener(_onUpdate);
    setState(() {
      _controller = controller;
      _loading = false;
    });
    await controller.play();
  }

  void _onUpdate() {
    if (mounted) setState(() {});
  }

  void _toggle() {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (controller.value.isPlaying) {
      unawaited(controller.pause());
    } else {
      if (controller.value.duration > Duration.zero && controller.value.position >= controller.value.duration) {
        unawaited(controller.seekTo(Duration.zero));
      }
      unawaited(controller.play());
    }
  }

  @override
  void dispose() {
    final controller = _controller;
    if (controller != null) {
      controller.removeListener(_onUpdate);
      unawaited(controller.dispose());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    final url = widget.videoUrl;

    Widget content;
    if (url == null || url.isEmpty) {
      content = const _VideoPlaceholder(icon: Icons.videocam_off_outlined, label: 'No video artifact');
    } else if (_failed) {
      content = InkWell(
        onTap: () => unawaited(_load()),
        child: const _VideoPlaceholder(icon: Icons.error_outline, label: 'Preview unavailable — tap to retry'),
      );
    } else if (controller == null) {
      content = InkWell(
        onTap: () => unawaited(_load()),
        child: _loading
            ? const Center(
                child: SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(strokeWidth: 2, color: FairColors.muted),
                ),
              )
            : const _VideoPlaceholder(icon: Icons.play_circle_outline, label: 'Load preview'),
      );
    } else {
      final initialized = controller.value.isInitialized;
      final playing = initialized && controller.value.isPlaying;
      content = Stack(
        fit: StackFit.expand,
        children: [
          if (initialized)
            Center(child: AspectRatio(aspectRatio: controller.value.aspectRatio, child: VideoPlayer(controller))),
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _toggle,
              child: playing
                  ? const SizedBox.shrink()
                  : Center(
                      child: Container(
                        padding: const EdgeInsets.all(10),
                        decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                        child: const Icon(Icons.play_arrow_rounded, size: 30, color: Colors.white),
                      ),
                    ),
            ),
          ),
          Positioned(
            left: 10,
            right: 10,
            bottom: 6,
            child: VideoProgressIndicator(
              controller,
              allowScrubbing: true,
              colors: const VideoProgressColors(
                playedColor: FairColors.accent,
                bufferedColor: Colors.white24,
                backgroundColor: Colors.white10,
              ),
            ),
          ),
        ],
      );
    }

    return AspectRatio(
      aspectRatio: 16 / 9,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(FairDimens.radiusSm),
        child: ColoredBox(color: FairColors.monitor, child: content),
      ),
    );
  }
}

class _VideoPlaceholder extends StatelessWidget {
  const _VideoPlaceholder({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 40, color: FairColors.muted),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(fontSize: 12, color: FairColors.muted)),
        ],
      ),
    );
  }
}
