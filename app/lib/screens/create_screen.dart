import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models.dart';
import '../state.dart';
import '../theme.dart';

/// Guided lesson-video wizard — four decisions (brief, production,
/// presentation, review) laid out like a production console: a vertical step
/// rail on the left, the active step's control surface in the center, and a
/// live PRODUCTION SPEC readout on the right that tracks the draft.
class CreateScreen extends ConsumerStatefulWidget {
  const CreateScreen({super.key});

  @override
  ConsumerState<CreateScreen> createState() => _CreateScreenState();
}

class _CreateScreenState extends ConsumerState<CreateScreen> {
  static const _steps = ['Brief', 'Production', 'Presentation', 'Review'];

  static const _stepMeta = [
    (
      'What will you help someone understand?',
      'Describe the lesson in plain language — the studio plans objectives, scenes and narration.',
    ),
    (
      'How should the studio produce it?',
      'Pick the generation pipeline and the planning service that writes the lesson.',
    ),
    (
      'How should it look and sound?',
      'Pick the on-screen presenter and the voice that reads the lesson.',
    ),
    (
      'Review & generate',
      'Check every choice, then send the brief to the studio.',
    ),
  ];

  static const _placeValueExample =
      'Teach place value to Grade 5 learners. Show how a digit changes value in different positions, use everyday examples, and finish with a short challenge.';
  static const _waterCycleExample =
      'Explain the water cycle to 9-year-olds through the journey of a single raindrop. Include evaporation, condensation, precipitation, and a quick check for understanding.';

  static const _introOptions = [('none', 'No intro'), ('card', 'Title card'), ('sting', 'Animated sting')];
  static const _audioOptions = [('voice', 'Narration only'), ('music', 'Narration + music bed')];
  static const _footageOptions = [('none', 'Deterministic animation only'), ('wan', 'Wan2.2 establishing shot')];

  final _briefCtrl = TextEditingController();
  final _audienceCtrl = TextEditingController();
  final _modelCtrl = TextEditingController();
  final _curriculumCtrl = TextEditingController();

  int _step = 0;
  bool _defaultsApplied = false;
  bool _submitting = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    // The draft survives navigation — restore any in-progress values.
    final draft = ref.read(draftProvider);
    _briefCtrl.text = draft.text;
    _audienceCtrl.text = draft.audience ?? '';
    _modelCtrl.text = draft.model ?? '';
    _curriculumCtrl.text = draft.curriculumSource ?? '';
  }

  @override
  void dispose() {
    _briefCtrl.dispose();
    _audienceCtrl.dispose();
    _modelCtrl.dispose();
    _curriculumCtrl.dispose();
    super.dispose();
  }

  // ---- Draft helpers ------------------------------------------------------

  void _update(void Function(LessonBrief) mutate) => ref.read(draftProvider.notifier).update(mutate);

  void _syncControllers() {
    final draft = ref.read(draftProvider);
    _briefCtrl.text = draft.text;
    _audienceCtrl.text = draft.audience ?? '';
    _modelCtrl.text = draft.model ?? '';
    _curriculumCtrl.text = draft.curriculumSource ?? '';
  }

  /// Applies server-suggested defaults once — only to a fresh draft so a
  /// returning author's in-progress brief is never overwritten.
  void _applyDefaults(StudioConfig config) {
    final existing = ref.read(draftProvider);
    if (existing.text.trim().isNotEmpty) return;
    final d = config.defaults;
    String? str(String key) => d[key] is String && (d[key] as String).isNotEmpty ? d[key] as String : null;
    _update((b) {
      b.provider = str('provider') ?? b.provider;
      b.voiceProvider = str('voiceProvider') ?? b.voiceProvider;
      b.model = str('model') ?? b.model;
      final t = d['targetSeconds'];
      if (t is num) b.targetSeconds = t.toInt().clamp(60, 600);
      b.avatar = str('avatar') ?? b.avatar;
      b.generationVersion = str('generationVersion') ?? b.generationVersion;
      if (b.generationVersion == 'open-source') {
        b.provider = 'local';
        b.model = str('openSourceModel') ?? b.model;
      } else {
        b.footage = 'none';
      }
      _ensureValidVoice(config, b);
      _prefillModel(config, b);
    });
    _syncControllers();
  }

  /// Keeps the chosen voice inside the pipeline's allowed set.
  void _ensureValidVoice(StudioConfig config, LessonBrief b) {
    final voices = _voicesFor(config, b.generationVersion);
    final valid = voices.any((v) => v.id == b.voiceProvider && v.available);
    if (!valid) b.voiceProvider = voices.where((v) => v.available).firstOrNull?.id;
  }

  /// Model prefill: provider's first installed model, else the server default.
  void _prefillModel(StudioConfig config, LessonBrief b) {
    if (b.model?.isNotEmpty == true) return;
    final provider = config.providers.where((p) => p.id == b.provider).firstOrNull;
    if (provider != null && provider.models.isNotEmpty) {
      b.model = provider.models.first;
    } else {
      final fallback = config.defaults['model'];
      if (fallback is String && fallback.isNotEmpty) b.model = fallback;
    }
  }

  List<VoiceOption> _voicesFor(StudioConfig config, String version) => version == 'open-source'
      ? config.voiceOptions.where((v) => v.openSourceAvailable && v.available).toList()
      : config.voiceOptions;

  void _selectVersion(StudioConfig config, NamedOption option) {
    if (!option.available) return;
    _update((b) {
      if (b.generationVersion == option.id) return;
      b.generationVersion = option.id;
      if (option.id == 'open-source') {
        b.provider = 'local';
        final osModel = config.defaults['openSourceModel'];
        if (osModel is String && osModel.isNotEmpty) {
          b.model = osModel;
        } else {
          b.model = null;
          _prefillModel(config, b);
        }
      } else {
        b.footage = 'none';
        b.model = null;
        _prefillModel(config, b);
      }
      _ensureValidVoice(config, b);
    });
    _modelCtrl.text = ref.read(draftProvider).model ?? '';
  }

  void _selectProvider(StudioConfig config, ProviderOption option) {
    if (!option.available) return;
    _update((b) {
      b.provider = option.id;
      b.model = option.models.isNotEmpty ? option.models.first : b.model;
    });
    _modelCtrl.text = ref.read(draftProvider).model ?? '';
  }

  void _fillExample(String text) {
    _briefCtrl.text = text;
    _briefCtrl.selection = TextSelection.collapsed(offset: text.length);
    _update((b) => b.text = text);
  }

  // ---- Validation ----------------------------------------------------------

  bool _briefValid(LessonBrief d) => d.text.trim().length >= 10;

  bool _productionValid(StudioConfig? c, LessonBrief d) {
    if (c == null) return false;
    final version = c.generationVersions.where((v) => v.id == d.generationVersion).firstOrNull;
    final provider = c.providers.where((p) => p.id == d.provider).firstOrNull;
    return (version?.available ?? false) && (provider?.available ?? false);
  }

  bool _presentationValid(StudioConfig? c, LessonBrief d) {
    if (c == null) return false;
    return _voicesFor(c, d.generationVersion).any((v) => v.id == d.voiceProvider && v.available);
  }

  bool _stepValid(int step, StudioConfig? config, LessonBrief draft) => switch (step) {
        0 => _briefValid(draft),
        1 => _productionValid(config, draft),
        2 => _presentationValid(config, draft),
        _ => _briefValid(draft) && _productionValid(config, draft) && _presentationValid(config, draft),
      };

  String? _navHint(StudioConfig? config, LessonBrief draft) {
    if (_stepValid(_step, config, draft)) return null;
    return switch (_step) {
      0 => 'Describe the lesson in at least 10 characters to continue.',
      1 => 'Pick an available pipeline and planning provider to continue.',
      2 => 'Pick an available narrator voice to continue.',
      _ => 'Resolve the flagged choices above to generate.',
    };
  }

  // ---- Submit --------------------------------------------------------------

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      final job = await ref.read(apiProvider).createJob(ref.read(draftProvider));
      if (!mounted) return;
      context.go('/jobs/${job.id}');
    } catch (error) {
      if (!mounted) return;
      setState(() => _submitError = 'Could not start generation — $error');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ---- Build ---------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(draftProvider);
    final configAsync = ref.watch(configProvider);
    final config = configAsync.asData?.value;

    if (!_defaultsApplied && config != null) {
      _defaultsApplied = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _applyDefaults(config);
      });
    }

    final isLast = _step == _steps.length - 1;
    final canProceed = _stepValid(_step, config, draft);

    return SafeArea(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _stepRail(),
          const VerticalDivider(width: 1, thickness: 1, color: FairColors.line),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(28, 24, 28, 36),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1060),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final wide = constraints.maxWidth >= 920;
                      final stepCard = _stepCard(configAsync, config, draft, isLast: isLast, canProceed: canProceed);
                      final spec = _specPanel(config, draft);
                      if (wide) {
                        return Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: stepCard),
                            const SizedBox(width: 20),
                            SizedBox(width: 280, child: spec),
                          ],
                        );
                      }
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [spec, const SizedBox(height: 16), stepCard],
                      );
                    },
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---- Left · vertical step rail --------------------------------------------

  Widget _stepRail() {
    return Container(
      width: 216,
      color: FairColors.canvas,
      padding: const EdgeInsets.fromLTRB(20, 26, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Kicker('NEW LESSON'),
          const SizedBox(height: 10),
          Text('Create a lesson film', style: display(19)),
          const SizedBox(height: 6),
          const Text('Four decisions. The studio handles the rest.',
              style: TextStyle(fontSize: 12, color: FairColors.muted, height: 1.5)),
          const SizedBox(height: 20),
          const Divider(height: 1),
          const SizedBox(height: 16),
          for (var i = 0; i < _steps.length; i++) _railStep(i),
          const Spacer(),
          Text(
            'STEP 0${_step + 1} / 0${_steps.length}',
            style: mono(9, FairColors.faint).copyWith(letterSpacing: 1.8),
          ),
        ],
      ),
    );
  }

  Widget _railStep(int i) {
    final done = i < _step;
    final current = i == _step;
    final last = i == _steps.length - 1;
    final tappable = done;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 18,
            child: Column(
              children: [
                _railDot(done: done, current: current),
                if (!last)
                  Expanded(
                    child: Container(
                      width: 1.5,
                      margin: const EdgeInsets.symmetric(vertical: 5),
                      decoration: BoxDecoration(
                        color: done ? FairColors.accent : FairColors.line,
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: tappable ? () => setState(() => _step = i) : null,
              child: MouseRegion(
                cursor: tappable ? SystemMouseCursors.click : SystemMouseCursors.basic,
                child: Padding(
                  padding: EdgeInsets.only(bottom: last ? 0 : 26),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '0${i + 1}',
                        style: mono(
                          9.5,
                          current
                              ? FairColors.accent
                              : done
                                  ? FairColors.accentDark
                                  : FairColors.faint,
                        ).copyWith(letterSpacing: 1.6),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        _steps[i],
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: current ? FontWeight.w700 : FontWeight.w500,
                          color: current
                              ? FairColors.ink
                              : done
                                  ? FairColors.inkSoft
                                  : FairColors.muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _railDot({required bool done, required bool current}) {
    if (done) {
      return Container(
        width: 18,
        height: 18,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: FairColors.accentSoft,
          border: Border.all(color: FairColors.accentDark, width: 1.3),
        ),
        child: const Center(child: Icon(Icons.check_rounded, size: 11, color: FairColors.accent)),
      );
    }
    if (current) {
      return Container(
        width: 18,
        height: 18,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: FairColors.accentSoft,
          border: Border.all(color: FairColors.accent, width: 1.4),
        ),
        child: Center(
          child: Container(
            width: 7,
            height: 7,
            decoration: const BoxDecoration(color: FairColors.accent, shape: BoxShape.circle),
          ),
        ),
      );
    }
    return Container(
      width: 18,
      height: 18,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: FairColors.strongLine, width: 1.3),
      ),
    );
  }

  // ---- Center · active step card --------------------------------------------

  Widget _stepCard(
    AsyncValue<StudioConfig> configAsync,
    StudioConfig? config,
    LessonBrief draft, {
    required bool isLast,
    required bool canProceed,
  }) {
    final meta = _stepMeta[_step];
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.fromLTRB(26, 22, 26, 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 220),
            transitionBuilder: (child, animation) => FadeTransition(
              opacity: animation,
              child: SlideTransition(
                position: Tween(begin: const Offset(0, 0.02), end: Offset.zero).animate(animation),
                child: child,
              ),
            ),
            child: KeyedSubtree(
              key: ValueKey(_step),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Kicker('STEP 0${_step + 1} · ${_steps[_step]}'),
                  const SizedBox(height: 8),
                  Text(meta.$1, style: display(22)),
                  const SizedBox(height: 6),
                  Text(meta.$2, style: const TextStyle(fontSize: 13, color: FairColors.muted, height: 1.5)),
                  const SizedBox(height: 20),
                  const Divider(height: 1),
                  const SizedBox(height: 20),
                  _stepBody(configAsync, config, draft),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          const Divider(height: 1),
          const SizedBox(height: 16),
          _navRow(config, draft, isLast: isLast, canProceed: canProceed),
        ],
      ),
    );
  }

  // ---- Right · live production spec ------------------------------------------

  Widget _specPanel(StudioConfig? config, LessonBrief draft) {
    final versionName =
        config?.generationVersions.where((v) => v.id == draft.generationVersion).firstOrNull?.name ?? draft.generationVersion;
    final providerName = config?.providers.where((p) => p.id == draft.provider).firstOrNull?.name ?? draft.provider;
    final voiceName =
        config?.voiceOptions.where((v) => v.id == draft.voiceProvider).firstOrNull?.name ?? draft.voiceProvider ?? '—';
    final avatarName = config?.avatars.where((a) => a.id == draft.avatar).firstOrNull?.name ?? draft.avatar;
    final openSource = draft.generationVersion == 'open-source';

    final satisfied = [for (var i = 0; i < _steps.length; i++) if (_stepValid(i, config, draft)) 1].length;
    final fraction = satisfied / _steps.length;

    String optionLabel(List<(String, String)> options, String id) =>
        options.where((o) => o.$1 == id).firstOrNull?.$2 ?? id;

    final rows = <(String, String)>[
      ('PIPELINE', versionName),
      ('PLANNER', providerName),
      ('MODEL', draft.model?.isNotEmpty == true ? draft.model! : 'service default'),
      ('VOICE', voiceName),
      ('TARGET', '${draft.targetSeconds}s · ${_durationLabel(draft.targetSeconds)}'),
      if (openSource)
        ('FOOTAGE', optionLabel(_footageOptions, draft.footage))
      else ...[
        ('INTRO', optionLabel(_introOptions, draft.intro)),
        ('SOUNDTRACK', optionLabel(_audioOptions, draft.audio)),
      ],
      ('PRESENTER', avatarName),
    ];

    return Container(
      decoration: fairCard(color: FairColors.surfaceSoft),
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Expanded(child: Kicker('PRODUCTION SPEC')),
              Container(
                width: 7,
                height: 7,
                decoration: const BoxDecoration(color: FairColors.accent, shape: BoxShape.circle),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (final r in rows) _specRow(r.$1, r.$2),
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 12),
          Row(
            children: [
              const Expanded(child: Kicker('COMPLETION', color: FairColors.muted)),
              Text('${(fraction * 100).round()}%', style: mono(10.5, FairColors.accent, FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 8),
          MeterBar(value: fraction),
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 12),
          const Text(
            'On submit the studio queues a job — plan, critique, narration, render and quality gates run end to end, '
            'then the film lands in Review as a draft.',
            style: TextStyle(fontSize: 11, color: FairColors.muted, height: 1.55),
          ),
        ],
      ),
    );
  }

  Widget _specRow(String key, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4.5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 94,
            child: Text(key, style: mono(9, FairColors.faint).copyWith(letterSpacing: 1.2)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(value, style: mono(11, FairColors.inkSoft), maxLines: 2, overflow: TextOverflow.ellipsis),
          ),
        ],
      ),
    );
  }

  // ---- Step dispatch --------------------------------------------------------

  Widget _stepBody(AsyncValue<StudioConfig> configAsync, StudioConfig? config, LessonBrief draft) {
    return switch (_step) {
      0 => _briefStep(draft),
      1 => _withConfig(configAsync, config, (c) => _productionStep(c, draft)),
      2 => _withConfig(configAsync, config, (c) => _presentationStep(c, draft)),
      _ => _withConfig(configAsync, config, (c) => _reviewStep(c, draft)),
    };
  }

  Widget _withConfig(AsyncValue<StudioConfig> configAsync, StudioConfig? config, Widget Function(StudioConfig) build) {
    if (config != null) return build(config);
    if (configAsync.hasError) {
      return EmptyState(
        icon: Icons.cloud_off_outlined,
        title: 'Studio offline',
        body: 'The wizard needs the studio config. Start the studio server and try again.',
        action: OutlinedButton.icon(
          onPressed: () => ref.invalidate(configProvider),
          icon: const Icon(Icons.refresh, size: 16),
          label: const Text('Retry'),
        ),
      );
    }
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 64),
      child: Center(child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.2))),
    );
  }

  // ---- Shared picker primitives ----------------------------------------------

  /// Bordered option card: accentSoft + accent edge + radio dot when selected.
  Widget _pickerCard({
    required bool selected,
    required bool enabled,
    required VoidCallback onTap,
    required Widget child,
    EdgeInsetsGeometry padding = const EdgeInsets.all(14),
  }) {
    final radius = BorderRadius.circular(FairDimens.radius);
    return Opacity(
      opacity: enabled ? 1 : 0.55,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        decoration: BoxDecoration(
          color: selected ? FairColors.accentSoft : FairColors.surface,
          borderRadius: radius,
          border: Border.all(color: selected ? FairColors.accent : FairColors.line, width: selected ? 1.5 : 1),
        ),
        child: Material(
          type: MaterialType.transparency,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: enabled ? onTap : null,
            mouseCursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
            child: Padding(padding: padding, child: child),
          ),
        ),
      ),
    );
  }

  Widget _radioDot(bool selected, {double size = 16}) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? FairColors.accentSoft : Colors.transparent,
        border: Border.all(color: selected ? FairColors.accent : FairColors.strongLine, width: 1.4),
      ),
      child: selected
          ? Center(
              child: Container(
                width: size * 0.44,
                height: size * 0.44,
                decoration: const BoxDecoration(color: FairColors.accent, shape: BoxShape.circle),
              ),
            )
          : null,
    );
  }

  /// Compact chip-row selector for small (id, label) option lists.
  Widget _optionChips({
    required String label,
    required String value,
    required List<(String, String)> options,
    required ValueChanged<String> onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Kicker(label.toUpperCase(), color: FairColors.muted),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final o in options)
              _optionChip(label: o.$2, selected: value == o.$1, onTap: () => onChanged(o.$1)),
          ],
        ),
      ],
    );
  }

  Widget _optionChip({required String label, required bool selected, required VoidCallback onTap}) {
    final radius = BorderRadius.circular(FairDimens.radiusSm);
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      decoration: BoxDecoration(
        color: selected ? FairColors.accentSoft : FairColors.surface,
        borderRadius: radius,
        border: Border.all(color: selected ? FairColors.accent : FairColors.line, width: selected ? 1.4 : 1),
      ),
      child: Material(
        type: MaterialType.transparency,
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _radioDot(selected, size: 12),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: selected ? FairColors.ink : FairColors.inkSoft,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ---- Step 1 · Brief --------------------------------------------------------

  Widget _briefStep(LessonBrief draft) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: fairWell(),
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
          child: TextField(
            controller: _briefCtrl,
            minLines: 7,
            maxLines: 14,
            maxLength: 5000,
            textCapitalization: TextCapitalization.sentences,
            style: const TextStyle(fontSize: 14, height: 1.55),
            decoration: const InputDecoration(
              hintText: 'e.g. Teach equivalent fractions to Grade 4 learners using a pizza example…',
              alignLabelWithHint: true,
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
            ),
            onChanged: (v) => _update((b) => b.text = v),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            const Text('Try an example:', style: TextStyle(fontSize: 12, color: FairColors.muted)),
            _exampleChip('Place value', _placeValueExample),
            _exampleChip('Water cycle', _waterCycleExample),
          ],
        ),
        const SizedBox(height: 18),
        LayoutBuilder(
          builder: (context, constraints) {
            final narrow = constraints.maxWidth < 560;
            final learners = _learnersCard();
            final length = _lengthCard(draft);
            if (narrow) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [learners, const SizedBox(height: 14), length],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [Expanded(child: learners), const SizedBox(width: 14), Expanded(child: length)],
            );
          },
        ),
      ],
    );
  }

  Widget _exampleChip(String label, String text) {
    return ActionChip(
      label: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: FairColors.accent)),
      backgroundColor: FairColors.accentSoft,
      side: const BorderSide(color: FairColors.accentDark),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      onPressed: () => _fillExample(text),
    );
  }

  Widget _learnersCard() {
    return Container(
      decoration: fairWell(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Kicker('LEARNERS · OPTIONAL', color: FairColors.muted),
          const SizedBox(height: 8),
          TextField(
            controller: _audienceCtrl,
            decoration: const InputDecoration(
              hintText: 'e.g. Grade 5 · mixed ability',
              isDense: true,
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding: EdgeInsets.zero,
            ),
            onChanged: (v) => _update((b) => b.audience = v.trim().isEmpty ? null : v),
          ),
        ],
      ),
    );
  }

  Widget _lengthCard(LessonBrief draft) {
    final seconds = draft.targetSeconds.clamp(60, 600);
    return Container(
      decoration: fairWell(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: Kicker('TARGET LENGTH', color: FairColors.muted)),
              Text('${seconds}s', style: mono(13, FairColors.accent, FontWeight.w700)),
              const SizedBox(width: 6),
              Text('· ${_durationLabel(draft.targetSeconds)}', style: mono(10.5, FairColors.muted)),
            ],
          ),
          Slider(
            value: seconds.toDouble(),
            min: 60,
            max: 600,
            divisions: 18,
            activeColor: FairColors.accent,
            label: _durationLabel(draft.targetSeconds),
            onChanged: (v) => _update((b) => b.targetSeconds = v.round()),
          ),
        ],
      ),
    );
  }

  static String _durationLabel(int seconds) {
    final minutes = seconds / 60;
    final number = seconds % 60 == 0 ? '${minutes.toInt()}' : minutes.toStringAsFixed(1);
    return '$number ${minutes == 1 ? 'minute' : 'minutes'}';
  }

  // ---- Step 2 · Production ---------------------------------------------------

  Widget _productionStep(StudioConfig config, LessonBrief draft) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Kicker('GENERATION PIPELINE'),
        const SizedBox(height: 10),
        _cardRow([for (final v in config.generationVersions) _versionCard(config, v, draft)]),
        const SizedBox(height: 20),
        const Kicker('PLANNING PROVIDER'),
        const SizedBox(height: 10),
        _cardRow([for (final p in config.providers) _providerCard(config, p, draft)]),
        const SizedBox(height: 20),
        const Kicker('MODEL', color: FairColors.muted),
        const SizedBox(height: 8),
        TextField(
          controller: _modelCtrl,
          decoration: const InputDecoration(
            hintText: 'Model name',
            helperText: 'Model installed in your planning service',
            isDense: true,
          ),
          onChanged: (v) => _update((b) => b.model = v.trim().isEmpty ? null : v),
        ),
        const SizedBox(height: 14),
        Container(
          decoration: fairWell(),
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: const EdgeInsets.symmetric(horizontal: 16),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
              title: const Text('Curriculum source (optional)', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
              subtitle: const Text('Paste standards or a syllabus excerpt for alignment checks',
                  style: TextStyle(fontSize: 11.5, color: FairColors.muted)),
              children: [
                TextField(
                  controller: _curriculumCtrl,
                  minLines: 4,
                  maxLines: 10,
                  maxLength: 10000,
                  decoration: const InputDecoration(
                    hintText: 'Paste curriculum text…',
                    helperText: 'Without a source, curriculum alignment stays unverified.',
                    alignLabelWithHint: true,
                  ),
                  onChanged: (v) => _update((b) => b.curriculumSource = v.trim().isEmpty ? null : v),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _cardRow(List<Widget> cards) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 560 || cards.length < 2) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < cards.length; i++) ...[
                if (i > 0) const SizedBox(height: 12),
                cards[i],
              ],
            ],
          );
        }
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (var i = 0; i < cards.length; i++) ...[
                if (i > 0) const SizedBox(width: 12),
                Expanded(child: cards[i]),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _versionCard(StudioConfig config, NamedOption option, LessonBrief draft) {
    final selected = draft.generationVersion == option.id;
    return _pickerCard(
      selected: selected,
      enabled: option.available,
      onTap: () => _selectVersion(config, option),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 2), child: _radioDot(selected)),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        option.name,
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: option.available ? FairColors.ink : FairColors.muted,
                        ),
                      ),
                    ),
                    if (!option.available) _setupBadge(),
                  ],
                ),
                const SizedBox(height: 5),
                Text(option.description, style: const TextStyle(fontSize: 12, color: FairColors.muted, height: 1.45)),
                if (!option.available && option.blockers.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  for (final blocker in option.blockers)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(top: 1),
                            child: Icon(Icons.error_outline_rounded, size: 12, color: FairColors.warning),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(blocker,
                                style: const TextStyle(fontSize: 11, color: FairColors.warning, height: 1.4)),
                          ),
                        ],
                      ),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _providerCard(StudioConfig config, ProviderOption option, LessonBrief draft) {
    final selected = draft.provider == option.id;
    return _pickerCard(
      selected: selected,
      enabled: option.available,
      onTap: () => _selectProvider(config, option),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 2), child: _radioDot(selected)),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        option.name,
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: option.available ? FairColors.ink : FairColors.muted,
                        ),
                      ),
                    ),
                    if (!option.available) _setupBadge(),
                  ],
                ),
                const SizedBox(height: 5),
                Text(option.description, style: const TextStyle(fontSize: 12, color: FairColors.muted, height: 1.45)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _setupBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: FairColors.amberSoft, borderRadius: BorderRadius.circular(12)),
      child: const Text('Setup needed',
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: FairColors.warning, letterSpacing: 0.3)),
    );
  }

  // ---- Step 3 · Presentation ---------------------------------------------------

  Widget _presentationStep(StudioConfig config, LessonBrief draft) {
    final openSource = draft.generationVersion == 'open-source';
    final voices = _voicesFor(config, draft.generationVersion);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Kicker('PRESENTER'),
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) {
            final wide = constraints.maxWidth >= 620;
            final tileWidth = wide ? (constraints.maxWidth - 36) / 4 : (constraints.maxWidth - 12) / 2;
            return Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                for (final avatar in config.avatars)
                  SizedBox(width: tileWidth, child: _avatarTile(avatar, draft)),
              ],
            );
          },
        ),
        const SizedBox(height: 20),
        const Kicker('NARRATOR VOICE'),
        const SizedBox(height: 10),
        for (var i = 0; i < voices.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          _voiceCard(voices[i], draft),
        ],
        if (voices.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 4, left: 2),
            child: Text('No voices are available for this pipeline yet.',
                style: TextStyle(fontSize: 11.5, color: FairColors.warning, height: 1.45)),
          ),
        const SizedBox(height: 20),
        if (openSource)
          _optionChips(
            label: 'Footage',
            value: draft.footage,
            options: _footageOptions,
            onChanged: (v) => _update((b) => b.footage = v),
          )
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final intro = _optionChips(
                label: 'Intro',
                value: draft.intro,
                options: _introOptions,
                onChanged: (v) => _update((b) => b.intro = v),
              );
              final audio = _optionChips(
                label: 'Soundtrack',
                value: draft.audio,
                options: _audioOptions,
                onChanged: (v) => _update((b) => b.audio = v),
              );
              if (constraints.maxWidth < 560) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [intro, const SizedBox(height: 14), audio],
                );
              }
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [Expanded(child: intro), const SizedBox(width: 14), Expanded(child: audio)],
              );
            },
          ),
      ],
    );
  }

  Widget _voiceCard(VoiceOption voice, LessonBrief draft) {
    final selected = draft.voiceProvider == voice.id;
    return _pickerCard(
      selected: selected,
      enabled: voice.available,
      onTap: () => _update((b) => b.voiceProvider = voice.id),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 1), child: _radioDot(selected)),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  voice.available ? voice.name : '${voice.name} (setup needed)',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: voice.available ? FairColors.ink : FairColors.muted,
                  ),
                ),
                if (voice.description.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(voice.description, style: const TextStyle(fontSize: 11.5, color: FairColors.muted, height: 1.45)),
                ],
              ],
            ),
          ),
          if (voice.quality.isNotEmpty) ...[
            const SizedBox(width: 10),
            Text(voice.quality, style: mono(9, FairColors.faint).copyWith(letterSpacing: 1.2)),
          ],
          if (!voice.available) ...[
            const SizedBox(width: 10),
            _setupBadge(),
          ],
        ],
      ),
    );
  }

  Widget _avatarTile(AvatarOption avatar, LessonBrief draft) {
    final selected = draft.avatar == avatar.id;
    final color = switch (avatar.id) {
      'mira' => FairColors.accent,
      'leo' => FairColors.amber,
      'orbit' => FairColors.accentDark,
      _ => FairColors.muted,
    };
    return _pickerCard(
      selected: selected,
      enabled: true,
      onTap: () => _update((b) => b.avatar = avatar.id),
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 14),
      child: Column(
        children: [
          Align(alignment: Alignment.topRight, child: _radioDot(selected, size: 13)),
          const SizedBox(height: 2),
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            child: Center(
              child: avatar.id == 'none'
                  ? const Icon(Icons.person_off_outlined, size: 20, color: Colors.white)
                  : Text(
                      avatar.name.isNotEmpty ? avatar.name[0].toUpperCase() : '?',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: Colors.white),
                    ),
            ),
          ),
          const SizedBox(height: 9),
          Text(avatar.name,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
          const SizedBox(height: 3),
          Text(avatar.description,
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10.5, color: FairColors.muted, height: 1.4)),
        ],
      ),
    );
  }

  // ---- Step 4 · Review ---------------------------------------------------------

  Widget _reviewStep(StudioConfig config, LessonBrief draft) {
    final versionName =
        config.generationVersions.where((v) => v.id == draft.generationVersion).firstOrNull?.name ?? draft.generationVersion;
    final providerName = config.providers.where((p) => p.id == draft.provider).firstOrNull?.name ?? draft.provider;
    final voiceName = config.voiceOptions.where((v) => v.id == draft.voiceProvider).firstOrNull?.name ?? draft.voiceProvider ?? '—';
    final avatarName = config.avatars.where((a) => a.id == draft.avatar).firstOrNull?.name ?? draft.avatar;

    final brief = draft.text.trim();
    final excerpt = brief.length > 160 ? '${brief.substring(0, 160)}…' : brief;

    String optionLabel(List<(String, String)> options, String id) =>
        options.where((o) => o.$1 == id).firstOrNull?.$2 ?? id;

    final rows = <(String, String)>[
      ('Brief', excerpt.isEmpty ? '—' : excerpt),
      ('Learners', draft.audience?.isNotEmpty == true ? draft.audience! : 'Not specified'),
      ('Duration', _durationLabel(draft.targetSeconds)),
      ('Pipeline', versionName),
      ('Provider', providerName),
      ('Model', draft.model?.isNotEmpty == true ? draft.model! : 'Service default'),
      ('Voice', voiceName),
      ('Presenter', avatarName),
      if (draft.generationVersion == 'open-source')
        ('Footage', optionLabel(_footageOptions, draft.footage))
      else ...[
        ('Intro', optionLabel(_introOptions, draft.intro)),
        ('Soundtrack', optionLabel(_audioOptions, draft.audio)),
      ],
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: fairWell(),
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < rows.length; i++)
                Column(
                  children: [
                    _reviewRow(rows[i].$1, rows[i].$2),
                    if (i < rows.length - 1) const Divider(height: 1),
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: FairColors.warningBg,
            borderRadius: BorderRadius.circular(FairDimens.radiusSm),
            border: Border.all(color: FairColors.amber.withValues(alpha: 0.35)),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.fact_check_outlined, size: 16, color: FairColors.warning),
              SizedBox(width: 9),
              Expanded(
                child: Text('Every lesson is a draft — review accuracy before teaching.',
                    style: TextStyle(fontSize: 12, color: FairColors.warning, fontWeight: FontWeight.w600, height: 1.45)),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _reviewRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(label,
                style: const TextStyle(fontSize: 11.5, color: FairColors.muted, fontWeight: FontWeight.w600)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(value, style: const TextStyle(fontSize: 12.5, color: FairColors.ink, height: 1.45)),
          ),
        ],
      ),
    );
  }

  // ---- Bottom navigation -------------------------------------------------------

  Widget _navRow(StudioConfig? config, LessonBrief draft, {required bool isLast, required bool canProceed}) {
    final hint = isLast ? null : _navHint(config, draft);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            if (_step > 0)
              OutlinedButton.icon(
                onPressed: () => setState(() => _step -= 1),
                icon: const Icon(Icons.arrow_back_rounded, size: 16),
                label: const Text('Back'),
              ),
            const Spacer(),
            if (!isLast)
              FilledButton(
                onPressed: canProceed ? () => setState(() => _step += 1) : null,
                child: const Text('Next →'),
              ),
          ],
        ),
        if (hint != null)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(
              children: [
                const Icon(Icons.info_outline_rounded, size: 13, color: FairColors.amber),
                const SizedBox(width: 7),
                Expanded(child: Text(hint, style: const TextStyle(fontSize: 11.5, color: FairColors.amber, height: 1.4))),
              ],
            ),
          ),
        if (isLast) ...[
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: canProceed && !_submitting ? _submit : null,
            style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 15)),
            icon: _submitting
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Icon(Icons.bolt_rounded, size: 18),
            label: Text(_submitting ? 'Queuing job…' : 'Generate lesson'),
          ),
          if (_submitError != null)
            Container(
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
              decoration: BoxDecoration(
                color: FairColors.errorBg,
                borderRadius: BorderRadius.circular(FairDimens.radiusSm),
                border: Border.all(color: FairColors.error.withValues(alpha: 0.4)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.error_outline_rounded, size: 15, color: FairColors.error),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(_submitError!, style: const TextStyle(fontSize: 11.5, color: FairColors.error, height: 1.45)),
                  ),
                ],
              ),
            ),
        ],
      ],
    );
  }
}
