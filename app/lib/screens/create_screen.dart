import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models.dart';
import '../state.dart';
import '../theme.dart';

/// Guided lesson-video wizard — four decisions (brief, production,
/// presentation, review) wrapped in a calm step-by-step flow.
class CreateScreen extends ConsumerStatefulWidget {
  const CreateScreen({super.key});

  @override
  ConsumerState<CreateScreen> createState() => _CreateScreenState();
}

class _CreateScreenState extends ConsumerState<CreateScreen> {
  static const _steps = ['Brief', 'Production', 'Presentation', 'Review'];

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

  // ---- Submit --------------------------------------------------------------

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() => _submitting = true);
    try {
      final job = await ref.read(apiProvider).createJob(ref.read(draftProvider));
      if (!mounted) return;
      context.go('/jobs/${job.id}');
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Could not start generation — $error'),
          backgroundColor: FairColors.error,
        ),
      );
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

    final textTheme = Theme.of(context).textTheme;
    final isLast = _step == _steps.length - 1;
    final canProceed = _stepValid(_step, config, draft);

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(36, 30, 36, 30),
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 780),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Kicker('NEW LESSON'),
                const SizedBox(height: 8),
                Text('Create a lesson film', style: textTheme.headlineMedium),
                const SizedBox(height: 6),
                const Text('Four decisions. The studio handles the rest.',
                    style: TextStyle(color: FairColors.muted, fontSize: 13.5)),
                const SizedBox(height: 26),
                _stepIndicator(),
                const SizedBox(height: 26),
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 220),
                  transitionBuilder: (child, animation) => FadeTransition(
                    opacity: animation,
                    child: SlideTransition(
                      position: Tween(begin: const Offset(0, 0.025), end: Offset.zero).animate(animation),
                      child: child,
                    ),
                  ),
                  child: KeyedSubtree(
                    key: ValueKey(_step),
                    child: _stepBody(configAsync, config, draft),
                  ),
                ),
                const SizedBox(height: 26),
                _navRow(config, draft, isLast: isLast, canProceed: canProceed),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ---- Header step indicator -----------------------------------------------

  Widget _stepIndicator() {
    return Row(
      children: [
        for (var i = 0; i < _steps.length; i++)
          Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: i < _step ? () => setState(() => _step = i) : null,
              child: MouseRegion(
                cursor: i < _step ? SystemMouseCursors.click : SystemMouseCursors.basic,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      SizedBox(
                        height: 30,
                        child: Row(
                          children: [
                            Expanded(
                              child: Container(
                                height: 2,
                                color: i == 0
                                    ? Colors.transparent
                                    : i <= _step
                                        ? FairColors.accent
                                        : FairColors.line,
                              ),
                            ),
                            _stepDot(i),
                            Expanded(
                              child: Container(
                                height: 2,
                                color: i == _steps.length - 1
                                    ? Colors.transparent
                                    : i < _step
                                        ? FairColors.accent
                                        : FairColors.line,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 7),
                      Text(
                        _steps[i],
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: i == _step ? FontWeight.w700 : FontWeight.w500,
                          color: i <= _step ? FairColors.ink : FairColors.muted,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _stepDot(int i) {
    final done = i < _step;
    final current = i == _step;
    final filled = done || current;
    return Container(
      width: 30,
      height: 30,
      margin: const EdgeInsets.symmetric(horizontal: 6),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: filled ? FairColors.accent : FairColors.surface,
        border: Border.all(color: filled ? FairColors.accent : FairColors.strongLine, width: 1.4),
      ),
      child: Center(
        child: done
            ? const Icon(Icons.check_rounded, size: 15, color: Colors.white)
            : Text(
                '${i + 1}',
                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: current ? Colors.white : FairColors.muted),
              ),
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
      return Container(
        decoration: fairCard(),
        padding: const EdgeInsets.all(28),
        child: Column(
          children: [
            const Icon(Icons.cloud_off_outlined, size: 28, color: FairColors.muted),
            const SizedBox(height: 10),
            Text('Studio offline', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 6),
            const Text('The wizard needs the studio config. Start fair-server and try again.',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: FairColors.muted, height: 1.5)),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: () => ref.invalidate(configProvider),
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Retry'),
            ),
          ],
        ),
      );
    }
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.all(48),
      child: const Center(child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.2))),
    );
  }

  Widget _stepTitle(String title, String subtitle) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 5),
        Text(subtitle, style: const TextStyle(fontSize: 12.5, color: FairColors.muted, height: 1.5)),
      ],
    );
  }

  // ---- Step 1 · Brief --------------------------------------------------------

  Widget _briefStep(LessonBrief draft) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _stepTitle('What will you help someone understand?',
            'Describe the lesson in plain language — the studio plans objectives, scenes and narration.'),
        const SizedBox(height: 18),
        Container(
          decoration: fairCard(),
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _briefCtrl,
            minLines: 5,
            maxLines: 10,
            maxLength: 5000,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: 'e.g. Teach equivalent fractions to Grade 4 learners using a pizza example…',
              alignLabelWithHint: true,
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
        const SizedBox(height: 16),
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
      label: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: FairColors.accentDark)),
      backgroundColor: FairColors.accentSoft,
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      onPressed: () => _fillExample(text),
    );
  }

  Widget _learnersCard() {
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Kicker('LEARNERS · OPTIONAL', color: FairColors.muted),
          const SizedBox(height: 6),
          TextField(
            controller: _audienceCtrl,
            decoration: const InputDecoration(hintText: 'e.g. Grade 5 · mixed ability', isDense: true),
            onChanged: (v) => _update((b) => b.audience = v.trim().isEmpty ? null : v),
          ),
        ],
      ),
    );
  }

  Widget _lengthCard(LessonBrief draft) {
    return Container(
      decoration: fairCard(),
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(child: Kicker('TARGET LENGTH', color: FairColors.muted)),
              Text(_durationLabel(draft.targetSeconds),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: FairColors.accent)),
            ],
          ),
          Slider(
            value: draft.targetSeconds.clamp(60, 600).toDouble(),
            min: 60,
            max: 600,
            divisions: 18,
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
        _stepTitle('How should the studio produce it?',
            'Pick the generation pipeline and the planning service that writes the lesson.'),
        const SizedBox(height: 18),
        const Kicker('GENERATION PIPELINE'),
        const SizedBox(height: 10),
        _cardRow([for (final v in config.generationVersions) _versionCard(config, v, draft)]),
        const SizedBox(height: 20),
        const Kicker('PLANNING PROVIDER'),
        const SizedBox(height: 10),
        _cardRow([for (final p in config.providers) _providerCard(config, p, draft)]),
        const SizedBox(height: 20),
        Container(
          decoration: fairCard(),
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Kicker('MODEL', color: FairColors.muted),
              const SizedBox(height: 6),
              TextField(
                controller: _modelCtrl,
                decoration: const InputDecoration(
                  hintText: 'Model name',
                  helperText: 'Model installed in your planning service',
                  isDense: true,
                ),
                onChanged: (v) => _update((b) => b.model = v.trim().isEmpty ? null : v),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Container(
          decoration: fairCard(),
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

  Widget _selectableCard({
    required bool selected,
    required bool enabled,
    required VoidCallback onTap,
    required Widget child,
  }) {
    return Opacity(
      opacity: enabled ? 1 : 0.66,
      child: MouseRegion(
        cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
        child: GestureDetector(
          onTap: enabled ? onTap : null,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            padding: const EdgeInsets.all(16),
            decoration: fairCard().copyWith(
              color: selected ? FairColors.accentSoft : FairColors.surface,
              border: Border.all(color: selected ? FairColors.accent : FairColors.line, width: selected ? 1.6 : 1),
            ),
            child: child,
          ),
        ),
      ),
    );
  }

  Widget _versionCard(StudioConfig config, NamedOption option, LessonBrief draft) {
    final selected = draft.generationVersion == option.id;
    return _selectableCard(
      selected: selected,
      enabled: option.available,
      onTap: () => _selectVersion(config, option),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(option.name, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
              ),
              if (selected)
                const Icon(Icons.check_circle_rounded, size: 18, color: FairColors.accent)
              else if (!option.available)
                _setupBadge(),
            ],
          ),
          const SizedBox(height: 6),
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
                      child: Text(blocker, style: const TextStyle(fontSize: 11, color: FairColors.warning, height: 1.4)),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _providerCard(StudioConfig config, ProviderOption option, LessonBrief draft) {
    final selected = draft.provider == option.id;
    return _selectableCard(
      selected: selected,
      enabled: option.available,
      onTap: () => _selectProvider(config, option),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(option.name, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
              ),
              if (selected)
                const Icon(Icons.check_circle_rounded, size: 18, color: FairColors.accent)
              else if (!option.available)
                _setupBadge(),
            ],
          ),
          const SizedBox(height: 6),
          Text(option.description, style: const TextStyle(fontSize: 12, color: FairColors.muted, height: 1.45)),
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
    final selectedVoice = voices.where((v) => v.id == draft.voiceProvider).firstOrNull;
    final voiceValue = selectedVoice != null && selectedVoice.available ? selectedVoice.id : null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _stepTitle('How should it look and sound?', 'Pick the on-screen presenter and the voice that reads the lesson.'),
        const SizedBox(height: 18),
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
        DropdownButtonFormField<String>(
          key: ValueKey('voice-${draft.generationVersion}-${voiceValue ?? 'none'}'),
          initialValue: voiceValue,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Narrator voice', isDense: true),
          items: [
            for (final v in voices)
              DropdownMenuItem(
                value: v.id,
                enabled: v.available,
                child: Text(
                  v.available ? v.name : '${v.name} (setup needed)',
                  style: TextStyle(fontSize: 13, color: v.available ? FairColors.ink : FairColors.muted),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
          ],
          onChanged: (id) {
            if (id != null) _update((b) => b.voiceProvider = id);
          },
        ),
        if (selectedVoice != null && selectedVoice.description.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8, left: 2),
            child: Text(selectedVoice.description, style: const TextStyle(fontSize: 11.5, color: FairColors.muted, height: 1.45)),
          ),
        if (voices.isEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 8, left: 2),
            child: Text('No voices are available for this pipeline yet.',
                style: TextStyle(fontSize: 11.5, color: FairColors.warning, height: 1.45)),
          ),
        const SizedBox(height: 20),
        if (openSource)
          _selectField(
            label: 'Footage',
            value: draft.footage,
            options: _footageOptions,
            onChanged: (v) => _update((b) => b.footage = v),
          )
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final intro = _selectField(
                label: 'Intro',
                value: draft.intro,
                options: _introOptions,
                onChanged: (v) => _update((b) => b.intro = v),
              );
              final audio = _selectField(
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

  Widget _avatarTile(AvatarOption avatar, LessonBrief draft) {
    final selected = draft.avatar == avatar.id;
    final color = switch (avatar.id) {
      'mira' => FairColors.accent,
      'leo' => FairColors.amber,
      'orbit' => FairColors.accentDark,
      _ => FairColors.muted,
    };
    return _selectableCard(
      selected: selected,
      enabled: true,
      onTap: () => _update((b) => b.avatar = avatar.id),
      child: Column(
        children: [
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

  Widget _selectField({
    required String label,
    required String value,
    required List<(String, String)> options,
    required ValueChanged<String> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      key: ValueKey('$label-$value'),
      initialValue: options.any((o) => o.$1 == value) ? value : options.first.$1,
      isExpanded: true,
      decoration: InputDecoration(labelText: label, isDense: true),
      items: [for (final o in options) DropdownMenuItem(value: o.$1, child: Text(o.$2, style: const TextStyle(fontSize: 13)))],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
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
        _stepTitle('Review & generate', 'Check every choice, then send the brief to the studio.'),
        const SizedBox(height: 18),
        Container(
          decoration: fairCard(),
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Padding(
                padding: EdgeInsets.only(top: 6, bottom: 4),
                child: Kicker('SUMMARY'),
              ),
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
    return Row(
      children: [
        if (_step > 0)
          OutlinedButton.icon(
            onPressed: () => setState(() => _step -= 1),
            icon: const Icon(Icons.arrow_back_rounded, size: 16),
            label: const Text('Back'),
          ),
        if (_step == 0 && !_briefValid(draft))
          const Expanded(
            child: Text(
              'Describe the lesson in at least 10 characters to continue.',
              style: TextStyle(fontSize: 11.5, color: FairColors.muted),
            ),
          )
        else
          const Spacer(),
        if (!isLast)
          FilledButton(
            onPressed: canProceed ? () => setState(() => _step += 1) : null,
            child: const Text('Next →'),
          )
        else
          FilledButton(
            onPressed: canProceed && !_submitting ? _submit : null,
            child: _submitting
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Generate lesson →'),
          ),
      ],
    );
  }
}
