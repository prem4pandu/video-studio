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
/// decision. Mirrors the review section of public/curriculum.mjs.
class ReviewScreen extends ConsumerWidget {
  const ReviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobs = ref.watch(jobsProvider);
    return SafeArea(
      child: jobs.when(
        loading: () => const Center(child: CircularProgressIndicator(color: FairColors.accent)),
        error: (error, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: _QueueMessage(
                icon: Icons.cloud_off_outlined,
                title: 'The review queue is unavailable',
                detail: '$error',
                actionLabel: 'Retry',
                onAction: () => unawaited(ref.read(jobsProvider.notifier).refresh()),
              ),
            ),
          ),
        ),
        data: (list) {
          final ready = list.where((j) => j.isReady).toList();
          final awaiting = ready.where((j) => j.review == null).toList();
          final reviewed = ready.where((j) => j.review != null).toList();
          final queue = [...awaiting, ...reviewed];
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(28, 26, 28, 44),
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: FairDimens.contentMax),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Kicker('EDUCATOR GATE'),
                    const SizedBox(height: 6),
                    Text('Review queue', style: Theme.of(context).textTheme.headlineMedium),
                    const SizedBox(height: 4),
                    const Text('Every rendered draft waits for a human decision.',
                        style: TextStyle(fontSize: 13, color: FairColors.muted)),
                    const SizedBox(height: 10),
                    Text('${awaiting.length} awaiting review',
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: FairColors.accent)),
                    const SizedBox(height: 20),
                    if (queue.isEmpty)
                      const _QueueMessage(
                        icon: Icons.fact_check_outlined,
                        title: 'Nothing waiting',
                        detail: 'Rendered drafts waiting for review will appear here.',
                      )
                    else
                      for (final job in queue)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: _ReviewCard(key: ValueKey(job.id), job: job),
                        ),
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

/// One rendered draft: title/meta, lazy inline video preview, note field and
/// the three review actions — or the recorded decision banner once reviewed.
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
    final review = job.review;
    final api = ref.read(apiProvider);
    final videoPath = job.artifacts['video'];
    final created = job.createdAt;

    final meta = <String>[
      if (created != null) _date.format(created.toLocal()),
      '${job.generationVersion} generation',
    ].join(' · ');

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

    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.all(18),
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
                    const SizedBox(height: 4),
                    Text(meta, style: const TextStyle(fontSize: 11.5, color: FairColors.muted)),
                  ],
                ),
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
          if (topicLine != null) ...[
            const SizedBox(height: 6),
            Text(topicLine.toUpperCase(),
                style: const TextStyle(fontSize: 9.5, fontWeight: FontWeight.w700, letterSpacing: 1.1, color: FairColors.accent)),
          ],
          const SizedBox(height: 12),
          _InlineVideo(videoUrl: videoPath == null ? null : api.artifactUrl(videoPath)),
          if (review != null) ...[
            const SizedBox(height: 12),
            _DecisionBanner(review: review),
          ] else ...[
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
              children: [
                FilledButton(
                  onPressed: _busy ? null : () => unawaited(_decide('approved')),
                  child: const Text('Approve'),
                ),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(foregroundColor: FairColors.amber),
                  onPressed: _busy ? null : () => unawaited(_decide('needs-changes')),
                  child: const Text('Needs changes'),
                ),
                OutlinedButton(
                  style: OutlinedButton.styleFrom(foregroundColor: FairColors.error),
                  onPressed: _busy ? null : () => unawaited(_decide('rejected')),
                  child: const Text('Reject'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// Recorded review decision, tinted with the decision's StatusChip color.
class _DecisionBanner extends StatelessWidget {
  const _DecisionBanner({required this.review});

  final Review review;

  static final _date = DateFormat('d MMM y, HH:mm');

  @override
  Widget build(BuildContext context) {
    final style = StatusChip.style(review.decision);
    final icon = switch (review.decision) {
      'approved' => Icons.check_circle_outline,
      'needs-changes' => Icons.edit_note_outlined,
      'rejected' => Icons.cancel_outlined,
      _ => Icons.flag_outlined,
    };
    final parts = <String>[
      style.label,
      if (review.note.isNotEmpty) review.note,
      if (review.reviewer.isNotEmpty) review.reviewer,
      if (review.at != null) _date.format(review.at!.toLocal()),
    ];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: style.bg, borderRadius: BorderRadius.circular(FairDimens.radiusSm)),
      child: Row(
        children: [
          Icon(icon, size: 16, color: style.fg),
          const SizedBox(width: 8),
          Expanded(
            child: Text(parts.join(' · '),
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: style.fg, height: 1.4)),
          ),
        ],
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
                  child: CircularProgressIndicator(strokeWidth: 2, color: FairColors.sidebarMuted),
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
          Icon(icon, size: 40, color: FairColors.sidebarMuted),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(fontSize: 12, color: FairColors.sidebarMuted)),
        ],
      ),
    );
  }
}

/// Shared empty / error card for the queue states.
class _QueueMessage extends StatelessWidget {
  const _QueueMessage({required this.icon, required this.title, required this.detail, this.actionLabel, this.onAction});

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
