import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api.dart';
import 'models.dart';

final apiProvider = Provider<StudioApi>((ref) {
  final api = StudioApi();
  ref.onDispose(api.dispose);
  return api;
});

final configProvider = FutureProvider<StudioConfig>((ref) => ref.watch(apiProvider).config());

/// Polls the job list. Keeps a 2.5s cadence while anything is generating so
/// dashboards and rails stay live; rests when the queue is idle.
final jobsProvider = NotifierProvider<JobsNotifier, AsyncValue<List<Job>>>(JobsNotifier.new);

class JobsNotifier extends Notifier<AsyncValue<List<Job>>> {
  Timer? _poll;

  @override
  AsyncValue<List<Job>> build() {
    ref.onDispose(() => _poll?.cancel());
    unawaited(refresh());
    return const AsyncValue.loading();
  }

  Future<void> refresh() async {
    try {
      final jobs = await ref.read(apiProvider).jobs();
      state = AsyncValue.data(jobs);
      _schedule(jobs.any((j) => j.isActive));
    } catch (error, stack) {
      state = AsyncValue.error(error, stack);
      _schedule(true); // keep retrying while the server may be down
    }
  }

  void _schedule(bool active) {
    _poll?.cancel();
    _poll = Timer(Duration(milliseconds: active ? 2000 : 8000), () => unawaited(refresh()));
  }
}

/// Live single-job stream for the monitor screen — polls every 2s until the
/// job reaches a terminal state. Auto-dispose stops polling on screen exit.
final jobProvider = StreamProvider.autoDispose.family<Job, String>((ref, id) async* {
  final api = ref.watch(apiProvider);
  while (true) {
    try {
      final job = await api.job(id);
      yield job;
      if (!job.isActive) break;
    } on StudioApiException catch (e) {
      if (e.statusCode == 404) rethrow; // job is gone — surface the error
      // transient failure: keep polling on the same interval
    }
    await Future<void>.delayed(const Duration(seconds: 2));
  }
});

final curriculumProvider = FutureProvider<CurriculumData>((ref) => ref.watch(apiProvider).curriculum());

/// The guided create flow's in-progress brief — survives step navigation.
final draftProvider = NotifierProvider<DraftNotifier, LessonBrief>(DraftNotifier.new);

class DraftNotifier extends Notifier<LessonBrief> {
  @override
  LessonBrief build() => LessonBrief(text: '');
  void reset() => state = LessonBrief(text: '');
  void update(void Function(LessonBrief) mutate) {
    final next = state.clone();
    mutate(next);
    state = next;
  }
}

/// Ordered pipeline stages. 'footage' is conditional on the open-source
/// version opting into Wan footage.
const pipelineCatalog = <String, ({String label, String description, String output, bool manual})>{
  'plan': (label: 'Teaching plan', description: 'Turns the brief into focused objectives, examples, questions, and scene directions.', output: 'Lesson structure', manual: false),
  'review': (label: 'Pedagogy critique', description: 'Checks factual accuracy, teaching coverage, answers, pacing, and likely misconceptions.', output: 'Reviewed lesson plan', manual: false),
  'narration': (label: 'Narration', description: 'Records each approved scene and measures the spoken duration used by the timeline.', output: 'Audio and transcript', manual: false),
  'footage': (label: 'Generate footage', description: 'Creates a short cinematic establishing shot while exact teaching graphics stay deterministic.', output: 'Wan footage', manual: false),
  'composition': (label: 'Purposeful animation', description: 'Synchronizes teaching visuals, captions, gestures, and protected learner thinking time.', output: 'Timed composition', manual: false),
  'render': (label: 'Render', description: 'Combines scenes, narration, captions, and transitions into the final lesson video.', output: 'MP4 export', manual: false),
  'audio': (label: 'Sound mix', description: 'Mixes the music bed, teaching sounds, and narration under the voice.', output: 'Mixed audio', manual: false),
  'verify': (label: 'Quality gates', description: 'Measures the export, checks audio and captions, and verifies objective coverage.', output: 'Quality report', manual: false),
  'educator': (label: 'Educator review', description: 'A teacher checks subject accuracy, suitability, pacing, and curriculum fit before sharing.', output: 'Human decision', manual: true),
};

typedef PipelineStep = ({String id, String label, String description, String output, bool manual});

List<PipelineStep> pipelineStepsFor({required String generationVersion, bool footage = false, bool audio = false, bool includeEducator = false}) {
  final ids = generationVersion == 'open-source'
      ? ['plan', 'review', 'narration', if (footage) 'footage', 'composition', 'render', if (audio) 'audio', 'verify']
      : ['plan', 'review', 'narration', 'composition', 'render', if (audio) 'audio', 'verify'];
  return [
    for (final id in ids)
      (
        id: id,
        label: pipelineCatalog[id]!.label,
        description: pipelineCatalog[id]!.description,
        output: pipelineCatalog[id]!.output,
        manual: false,
      ),
    if (includeEducator)
      (id: 'educator', label: pipelineCatalog['educator']!.label, description: pipelineCatalog['educator']!.description, output: pipelineCatalog['educator']!.output, manual: true),
  ];
}
