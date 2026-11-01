import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../theme.dart';
import 'api.dart';
import 'widgets.dart';

class V2JobScreen extends StatefulWidget {
  const V2JobScreen({super.key, required this.jobId, this.api});
  final V2Api? api;
  final String jobId;
  @override
  State<V2JobScreen> createState() => _V2JobScreenState();
}

class _V2JobScreenState extends State<V2JobScreen> {
  late final V2Api _api;
  final _note = TextEditingController();
  Timer? _poll;
  V2Job? _job;
  String? _error;
  bool _busy = false;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? V2Api();
    unawaited(_load());
  }

  @override
  void didUpdateWidget(V2JobScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.jobId != widget.jobId) {
      _poll?.cancel();
      _job = null;
      _error = null;
      _note.clear();
      unawaited(_load());
    }
  }

  @override
  void dispose() {
    _request++;
    _poll?.cancel();
    _api.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    _poll?.cancel();
    final request = ++_request;
    var again = true;
    try {
      final job = await _api.job(widget.jobId);
      if (!mounted || request != _request) return;
      setState(() {
        _job = job;
        _error = null;
      });
      again = job.active;
    } catch (e) {
      if (mounted && request == _request) setState(() => _error = '$e');
    } finally {
      if (mounted && request == _request && again) {
        _poll = Timer(const Duration(seconds: 3), () => unawaited(_load()));
      }
    }
  }

  Future<void> _action(String name) async {
    if (_busy) return;
    _poll?.cancel();
    _request++;
    setState(() => _busy = true);
    try {
      final job = await _api.action(widget.jobId, name);
      if (mounted) {
        setState(() {
          _job = job;
          _error = null;
        });
      }
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        if (_job?.active == true) {
          _poll?.cancel();
          _poll = Timer(const Duration(seconds: 3), () => unawaited(_load()));
        }
      }
    }
  }

  Future<void> _review(String decision) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final job = await _api.review(widget.jobId, decision, _note.text.trim());
      if (mounted) {
        setState(() => _job = job);
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Review saved')));
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(String path) async {
    try {
      if (!await launchUrl(
        _api.artifact(path),
        mode: LaunchMode.platformDefault,
      )) {
        throw const V2ApiException('Could not open this artifact.');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final job = _job;
    return V2Page(
      children: [
        TextButton.icon(
          onPressed: () => context.go('/studio-v2'),
          icon: const Icon(Icons.arrow_back, size: 17),
          label: const Text('All productions'),
        ),
        const SizedBox(height: 16),
        if (job == null) ...[
          Text('Opening production', style: display(28)),
          const SizedBox(height: 20),
          if (_error == null)
            const LinearProgressIndicator()
          else
            V2Notice(
              message: _error!,
              error: true,
              action: TextButton(onPressed: _load, child: const Text('Retry')),
            ),
        ] else ...[
          Wrap(
            spacing: 18,
            runSpacing: 12,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              V2Badge(
                label: job.label,
                color: job.retryable ? FairColors.amber : FairColors.accent,
              ),
              Text(
                '${job.brief['mode'] ?? 'auto'} / ${job.brief['format'] ?? 'landscape'}',
                style: const TextStyle(fontSize: 12, color: FairColors.inkSoft),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(job.title, style: display(29)),
          const SizedBox(height: 22),
          if (_error != null) ...[
            V2Notice(
              message: _error!,
              error: true,
              action: TextButton(
                onPressed: _load,
                child: const Text('Refresh'),
              ),
            ),
            const SizedBox(height: 16),
          ],
          if (job.active || job.retryable) ...[
            V2Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          job.active
                              ? 'Production in progress'
                              : 'Production paused',
                          style: display(21),
                        ),
                      ),
                      Text(
                        '${job.progress.round()}%',
                        style: const TextStyle(
                          fontSize: 14,
                          color: FairColors.inkSoft,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  LinearProgressIndicator(
                    value: job.progress / 100,
                    minHeight: 6,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    job.message,
                    style: const TextStyle(
                      color: FairColors.inkSoft,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 22),
                  if (job.error != null) ...[
                    const SizedBox(height: 20),
                    V2Notice(message: job.error!, error: true),
                  ],
                  const SizedBox(height: 22),
                  Wrap(
                    spacing: 12,
                    children: [
                      if (job.active)
                        OutlinedButton.icon(
                          onPressed: _busy ? null : () => _action('cancel'),
                          icon: const Icon(
                            Icons.stop_circle_outlined,
                            size: 18,
                          ),
                          label: const Text('Stop generation'),
                        ),
                      if (job.retryable)
                        FilledButton.icon(
                          onPressed: _busy ? null : () => _action('retry'),
                          icon: const Icon(Icons.refresh, size: 18),
                          label: const Text('Retry production'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
          ],
          if (job.completed && job.artifacts['video'] != null) ...[
            _V2Video(
              key: ValueKey(job.artifacts['video']),
              url: _api.artifact(job.artifacts['video']!).toString(),
            ),
            const SizedBox(height: 18),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                FilledButton.icon(
                  onPressed: () => _open(job.artifacts['video']!),
                  icon: const Icon(Icons.open_in_new, size: 18),
                  label: const Text('Download video'),
                ),
                PopupMenuButton<String>(
                  tooltip: 'Download supporting files',
                  onSelected: (path) => _open(path),
                  itemBuilder: (context) => [
                    for (final item in const [
                      ('captions', 'Captions'),
                      ('transcript', 'Transcript'),
                      ('metadata', 'Publishing notes'),
                      ('report', 'Quality report'),
                      ('plan', 'Scene plan'),
                    ])
                      if (job.artifacts[item.$1] != null)
                        PopupMenuItem(
                          value: job.artifacts[item.$1],
                          child: Text(item.$2),
                        ),
                  ],
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 18, vertical: 14),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('Supporting files'),
                        SizedBox(width: 8),
                        Icon(Icons.expand_more, size: 18),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 26),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Review before publishing', style: display(21)),
                  const SizedBox(height: 8),
                  const Text(
                    'Watch the full video and check the narration, facts, visuals, and asset rights before posting. Automated checks do not replace an editorial or educator review.',
                    style: TextStyle(color: FairColors.inkSoft, height: 1.6),
                  ),
                  if (job.review != null) ...[
                    const SizedBox(height: 14),
                    V2Badge(
                      label: 'Review: ${job.review!['decision']}',
                      color: job.review!['decision'] == 'approved'
                          ? FairColors.accent
                          : FairColors.amber,
                    ),
                    if ('${job.review!['note'] ?? ''}'.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Text('${job.review!['note']}'),
                      ),
                  ],
                  const SizedBox(height: 18),
                  TextField(
                    controller: _note,
                    enabled: !_busy,
                    minLines: 2,
                    maxLines: 4,
                    maxLength: 2000,
                    decoration: const InputDecoration(
                      labelText: 'Review notes',
                      hintText: 'What works? What needs a change?',
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 12,
                    runSpacing: 10,
                    children: [
                      FilledButton.icon(
                        onPressed: _busy ? null : () => _review('approved'),
                        icon: const Icon(Icons.check, size: 18),
                        label: const Text('Approve'),
                      ),
                      OutlinedButton(
                        onPressed: _busy
                            ? null
                            : () => _review('needs-changes'),
                        child: const Text('Needs changes'),
                      ),
                      TextButton(
                        onPressed: _busy ? null : () => _review('rejected'),
                        child: const Text('Reject'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
          ],
          if (job.report != null) ...[
            V2Disclosure(
              title: 'Quality checks',
              subtitle: job.report!['passed'] == true
                  ? 'Automated checks passed'
                  : 'Findings to review',
              children: [_quality(job.report!)],
            ),
            const SizedBox(height: 24),
          ],
          V2Disclosure(
            title: 'Production activity',
            children: [
              if (job.events.isEmpty)
                const Text('Waiting for the first production event.'),
              for (final event in job.events.reversed.take(30))
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    '${event['message'] ?? ''}',
                    style: const TextStyle(
                      color: FairColors.inkSoft,
                      height: 1.6,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _quality(Map<String, dynamic> report) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      for (final c in (report['checks'] as List? ?? []).whereType<Map>())
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                c['passed'] == true
                    ? Icons.check_circle_outline
                    : Icons.warning_amber_rounded,
                size: 20,
                color: c['passed'] == true
                    ? FairColors.accent
                    : FairColors.amber,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${c['name'] ?? 'Check'}',
                      style: const TextStyle(
                        color: FairColors.ink,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if ('${c['detail'] ?? ''}'.isNotEmpty)
                      Text(
                        '${c['detail']}',
                        style: const TextStyle(
                          color: FairColors.inkSoft,
                          height: 1.5,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      for (final warning in report['warnings'] as List? ?? [])
        Padding(
          padding: const EdgeInsets.only(top: 10),
          child: V2Notice(message: '$warning'),
        ),
    ],
  );
}

class _V2Video extends StatefulWidget {
  const _V2Video({super.key, required this.url});
  final String url;
  @override
  State<_V2Video> createState() => _V2VideoState();
}

class _V2VideoState extends State<_V2Video> {
  late final VideoPlayerController _controller;
  String? _error;
  @override
  void initState() {
    super.initState();
    _controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    unawaited(_initialize());
  }

  Future<void> _initialize() async {
    try {
      await _controller.initialize();
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = 'Video preview unavailable. Use Download video to watch the export.',
        );
      }
    }
  }

  @override
  void dispose() {
    unawaited(_controller.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return V2Notice(message: _error!, error: true);
    if (!_controller.value.isInitialized) {
      return const SizedBox(
        height: 220,
        child: Center(child: CircularProgressIndicator()),
      );
    }
    return Container(
      decoration: fairCard(color: FairColors.monitor),
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 570),
            child: AspectRatio(
              aspectRatio: _controller.value.aspectRatio,
              child: VideoPlayer(_controller),
            ),
          ),
          const SizedBox(height: 12),
          VideoProgressIndicator(
            _controller,
            allowScrubbing: true,
            colors: const VideoProgressColors(
              playedColor: FairColors.accent,
              bufferedColor: FairColors.strongLine,
              backgroundColor: FairColors.line,
            ),
          ),
          const SizedBox(height: 8),
          ValueListenableBuilder<VideoPlayerValue>(
            valueListenable: _controller,
            builder: (context, value, _) => Row(
              children: [
                IconButton(
                  tooltip: value.isPlaying ? 'Pause video' : 'Play video',
                  onPressed: () {
                    value.isPlaying ? _controller.pause() : _controller.play();
                  },
                  icon: Icon(value.isPlaying ? Icons.pause : Icons.play_arrow),
                ),
                IconButton(
                  tooltip: 'Restart video',
                  onPressed: () => _controller.seekTo(Duration.zero),
                  icon: const Icon(Icons.replay),
                ),
                Text(
                  '${_time(value.position)} / ${_time(value.duration)}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: FairColors.inkSoft,
                  ),
                ),
                const Spacer(),
                IconButton(
                  tooltip: value.volume > 0 ? 'Mute audio' : 'Unmute audio',
                  onPressed: () =>
                      _controller.setVolume(value.volume > 0 ? 0 : 1),
                  icon: Icon(
                    value.volume > 0
                        ? Icons.volume_up_outlined
                        : Icons.volume_off_outlined,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _time(Duration d) =>
      '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
}
