import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme.dart';
import 'api.dart';
import 'widgets.dart';

class V2StudioScreen extends StatefulWidget {
  const V2StudioScreen({super.key, this.api});
  final V2Api? api;
  @override
  State<V2StudioScreen> createState() => _V2StudioScreenState();
}

class _V2StudioScreenState extends State<V2StudioScreen> {
  late final V2Api _api;
  final _prompt = TextEditingController();
  final _form = GlobalKey<FormState>();
  Timer? _poll;
  Map<String, dynamic>? _config;
  List<V2Job> _jobs = [];
  String? _error;
  String? _submitError;
  String? _key;
  String _mode = 'auto', _format = 'landscape', _style = 'auto';
  int _duration = 60;
  bool _busy = false, _loading = true, _refreshing = false;

  @override
  void initState() {
    super.initState();
    _api = widget.api ?? V2Api();
    _prompt.addListener(_changed);
    unawaited(_refresh());
  }

  void _changed() {
    _key = null;
  }

  @override
  void dispose() {
    _poll?.cancel();
    _prompt.dispose();
    _api.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      final results = await Future.wait([_api.config(), _api.jobs()]);
      if (!mounted) return;
      setState(() {
        _config = results[0] as Map<String, dynamic>;
        _jobs = results[1] as List<V2Job>;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
    } finally {
      _refreshing = false;
      if (mounted) {
        _poll?.cancel();
        _poll = Timer(
          Duration(seconds: _jobs.any((j) => j.active) ? 3 : 10),
          () => unawaited(_refresh()),
        );
      }
    }
  }

  Future<void> _create() async {
    if (_busy || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _submitError = null;
    });
    _key ??= v2RequestKey();
    try {
      final job = await _api.create({
        'prompt': _prompt.text.trim(),
        'mode': _mode,
        'format': _format,
        'durationSeconds': _duration,
        'style': _style,
      }, _key!);
      if (mounted) context.go('/studio-v2/jobs/${job.id}');
    } catch (e) {
      if (mounted) setState(() => _submitError = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _example(String text, String mode, String format) {
    setState(() {
      _prompt.text = text;
      _mode = mode;
      _format = format;
      _key = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final ready = _config?['ready'] == true;
    return V2Page(
      children: [
        Text('Create something worth watching.', style: display(32)),
        const SizedBox(height: 10),
        const Text(
          'Turn an idea into a narrated video. Make a lesson, explain a thought, or tell a story.',
          style: TextStyle(
            fontSize: 16,
            height: 1.6,
            color: FairColors.inkSoft,
          ),
        ),
        const SizedBox(height: 32),
        if (_error != null) ...[
          V2Notice(
            message: _error!,
            error: true,
            action: TextButton(
              onPressed: _refresh,
              child: const Text('Reconnect'),
            ),
          ),
          const SizedBox(height: 16),
        ],
        V2Panel(
          child: Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextFormField(
                  controller: _prompt,
                  enabled: !_busy,
                  minLines: 4,
                  maxLines: 8,
                  maxLength: 2000,
                  style: const TextStyle(
                    fontSize: 20,
                    height: 1.6,
                    color: FairColors.ink,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'What is your video about?',
                    alignLabelWithHint: true,
                    hintText: 'Explain why the moon changes shape, with a clear animated model and a memorable ending.',
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    filled: false,
                    contentPadding: EdgeInsets.zero,
                  ),
                  validator: (v) => (v?.trim().length ?? 0) < 12
                      ? 'Add a little more detail (at least 12 characters).'
                      : null,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 14,
                  runSpacing: 14,
                  children: [
                    _choice('Format', _format, const {
                      'landscape': 'Landscape · 16:9',
                      'portrait': 'Portrait · 9:16',
                    }, (v) => _format = v),
                    _choice('Length', '$_duration', const {
                      '30': 'About 30 seconds',
                      '60': 'About 1 minute',
                      '90': 'About 90 seconds',
                    }, (v) => _duration = int.parse(v)),
                  ],
                ),
                const SizedBox(height: 10),
                V2Disclosure(
                  title: 'Creative direction',
                  subtitle: 'Choose a content type and visual style',
                  children: [
                    Wrap(
                      spacing: 14,
                      runSpacing: 14,
                      children: [
                        _choice('Content', _mode, const {
                          'auto': 'Choose for me',
                          'learning': 'Learning video',
                          'social': 'Social explainer',
                          'story': 'Animated story',
                        }, (v) => _mode = v),
                        _choice('Style', _style, const {
                          'auto': 'Choose for me',
                          'editorial': 'Editorial',
                          'playful': 'Playful',
                          'bold': 'Bold',
                        }, (v) => _style = v),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                if (_submitError != null) ...[
                  V2Notice(message: _submitError!, error: true),
                  const SizedBox(height: 14),
                ],
                Wrap(
                  spacing: 20,
                  runSpacing: 12,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    FilledButton.icon(
                      onPressed: ready && !_busy ? _create : null,
                      icon: _busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.arrow_forward, size: 20),
                      label: Text(
                        _busy ? 'Starting production…' : 'Generate video',
                      ),
                    ),
                    Text(
                      _loading
                          ? 'Checking availability…'
                          : ready
                          ? 'Made locally. Ready for your review.'
                          : 'Some services need attention',
                      style: const TextStyle(
                        fontSize: 13,
                        color: FairColors.inkSoft,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            _idea(
              Icons.school_outlined,
              'Teach fractions',
              'Teach equivalent fractions to a 9-year-old using one bar split into equal parts. Include a question and an answer.',
              'learning',
              'landscape',
            ),
            _idea(
              Icons.ondemand_video,
              'A science short',
              'Create an engaging social video explaining why the moon changes shape. Open with a surprising question and end with a clear takeaway.',
              'social',
              'portrait',
            ),
            _idea(
              Icons.auto_stories_outlined,
              'Tell a story',
              'Tell a short animated story about a little seed that learns patience while becoming a plant. Make the ending hopeful.',
              'story',
              'portrait',
            ),
          ],
        ),
        const SizedBox(height: 42),
        Row(
          children: [
            Expanded(child: Text('Your videos', style: display(23))),
            IconButton(
              onPressed: _refresh,
              tooltip: 'Refresh productions',
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (_loading)
          const LinearProgressIndicator()
        else if (_jobs.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.video_library_outlined,
                  size: 32,
                  color: FairColors.inkSoft,
                ),
                const SizedBox(height: 16),
                Text('A blank canvas for your next idea.', style: display(20)),
                const SizedBox(height: 8),
                const Text(
                  'Your videos will appear here as you create them.',
                  style: TextStyle(color: FairColors.inkSoft),
                ),
              ],
            ),
          )
        else
          LayoutBuilder(
            builder: (context, box) {
              final columns = box.maxWidth >= 900
                  ? 3
                  : box.maxWidth >= 560
                  ? 2
                  : 1;
              final width = (box.maxWidth - (columns - 1) * 20) / columns;
              return Wrap(
                spacing: 20,
                runSpacing: 28,
                children: _jobs
                    .map(
                      (job) => SizedBox(
                        width: width,
                        child: V2JobTile(
                          job: job,
                          thumbnail: job.artifacts['thumbnail'] == null
                              ? null
                              : _api
                                    .artifact(job.artifacts['thumbnail']!)
                                    .toString(),
                          onTap: () => context.go('/studio-v2/jobs/${job.id}'),
                        ),
                      ),
                    )
                    .toList(),
              );
            },
          ),
        const SizedBox(height: 38),
        V2Disclosure(
          title: ready ? 'Studio ready' : 'Studio availability',
          subtitle: 'Services and publishing guidance',
          children: [
            ...(_config?['capabilities'] as Map? ?? {}).entries.map((e) {
              final c = e.value is Map ? e.value as Map : {};
              return Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Text(
                  '${e.key}: ${c['available'] == true ? 'Ready' : 'Unavailable'} — ${c['detail'] ?? ''}',
                  style: const TextStyle(
                    color: FairColors.inkSoft,
                    height: 1.6,
                  ),
                ),
              );
            }),
            for (final limitation in _config?['limitations'] as List? ?? [])
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  '$limitation',
                  style: const TextStyle(
                    color: FairColors.inkSoft,
                    height: 1.6,
                  ),
                ),
              ),
            const Text(
              'Review every export before publishing. Views and earnings are never guaranteed.',
              style: TextStyle(color: FairColors.inkSoft, height: 1.6),
            ),
          ],
        ),
      ],
    );
  }

  Widget _choice(
    String label,
    String value,
    Map<String, String> items,
    void Function(String) assign,
  ) => SizedBox(
    width: 200,
    child: DropdownButtonFormField<String>(
      initialValue: value,
      key: ValueKey('$label-$value'),
      decoration: InputDecoration(labelText: label),
      isExpanded: true,
      items: items.entries
          .map(
            (e) => DropdownMenuItem(
              value: e.key,
              child: Text(e.value, style: const TextStyle(fontSize: 13)),
            ),
          )
          .toList(),
      onChanged: _busy
          ? null
          : (v) {
              if (v != null) {
                setState(() {
                  assign(v);
                  _key = null;
                });
              }
            },
    ),
  );
  Widget _idea(
    IconData icon,
    String title,
    String prompt,
    String mode,
    String format,
  ) => OutlinedButton.icon(
    onPressed: _busy ? null : () => _example(prompt, mode, format),
    icon: Icon(icon, size: 18),
    label: Text(title),
  );
}
