/// Models mirroring the studio server REST contract (src/server.mjs).
/// Every parser is deliberately tolerant — the server owns the schema and
/// older jobs in the store may predate newer fields.
library;

class StudioConfig {
  StudioConfig({required this.raw});
  final Map<String, dynamic> raw;

  List<AvatarOption> get avatars => (raw['avatars'] as List? ?? const [])
      .whereType<Map>()
      .map((e) => AvatarOption(id: '${e['id']}', name: '${e['name'] ?? e['id']}', description: '${e['description'] ?? ''}'))
      .toList();

  List<NamedOption> get generationVersions => (raw['generationVersions'] as List? ?? const [])
      .whereType<Map>()
      .map((e) => NamedOption(
            id: '${e['id']}',
            name: '${e['name'] ?? e['id']}',
            description: '${e['description'] ?? ''}',
            available: e['available'] != false,
            blockers: (e['blockers'] as List? ?? const []).map((b) => '$b').toList(),
          ))
      .toList();

  List<ProviderOption> get providers => (raw['providers'] as List? ?? const [])
      .whereType<Map>()
      .map((e) => ProviderOption(
            id: '${e['id']}',
            name: '${e['name'] ?? e['id']}',
            description: '${e['description'] ?? ''}',
            available: e['available'] == true,
            models: (e['models'] as List? ?? const []).map((m) => m is Map ? '${m['name'] ?? m['id']}' : '$m').toList(),
          ))
      .toList();

  List<VoiceOption> get voiceOptions => (raw['voiceOptions'] as List? ?? const [])
      .whereType<Map>()
      .map((e) => VoiceOption(
            id: '${e['id']}',
            name: '${e['name'] ?? e['id']}',
            description: '${e['description'] ?? ''}',
            quality: '${e['quality'] ?? ''}',
            available: e['available'] == true,
            openSourceAvailable: e['openSourceAvailable'] != false,
            sampleUrl: e['sampleUrl'] as String?,
          ))
      .toList();

  Map<String, dynamic> get defaults => (raw['defaults'] as Map?)?.cast<String, dynamic>() ?? const {};
  Map<String, dynamic> get pricing => (raw['pricing'] as Map?)?.cast<String, dynamic>() ?? const {};

  /// planning / narration / render → {available, detail}
  Map<String, Capability> get capabilities => {
        for (final e in ((raw['capabilities'] as Map?) ?? const {}).entries)
          '${e.key}': Capability(
            available: (e.value as Map?)?['available'] == true,
            detail: '${(e.value as Map?)?['detail'] ?? ''}',
          ),
      };
}

class Capability {
  const Capability({required this.available, required this.detail});
  final bool available;
  final String detail;
}

class AvatarOption {
  const AvatarOption({required this.id, required this.name, required this.description});
  final String id, name, description;
}

class NamedOption {
  const NamedOption({required this.id, required this.name, this.description = '', this.available = true, this.blockers = const []});
  final String id, name, description;
  final bool available;
  final List<String> blockers;
}

class ProviderOption {
  const ProviderOption({required this.id, required this.name, this.description = '', this.available = false, this.models = const []});
  final String id, name, description;
  final bool available;
  final List<String> models;
}

class VoiceOption {
  const VoiceOption({required this.id, required this.name, this.description = '', this.quality = '', this.available = false, this.openSourceAvailable = false, this.sampleUrl});
  final String id, name, description, quality;
  final bool available, openSourceAvailable;
  final String? sampleUrl;
}

/// A brief exactly as POSTed to /api/jobs — field names match normalizeBrief.
class LessonBrief {
  LessonBrief({
    required this.text,
    this.audience,
    this.generationVersion = 'classic',
    this.footage = 'none',
    this.provider = 'local',
    this.voiceProvider,
    this.targetSeconds = 180,
    this.avatar = 'none',
    this.intro = 'none',
    this.audio = 'voice',
    this.model,
    this.curriculumSource,
  });

  String text;
  String? audience;
  String generationVersion;
  String footage;
  String provider;
  String? voiceProvider;
  int targetSeconds;
  String avatar;
  String intro;
  String audio;
  String? model;
  String? curriculumSource;

  Map<String, dynamic> toJson() => {
        'text': text.trim(),
        'generationVersion': generationVersion,
        'provider': provider,
        'targetSeconds': targetSeconds,
        'avatar': avatar,
        if (audience?.isNotEmpty == true) 'audience': audience,
        if (voiceProvider?.isNotEmpty == true) 'voiceProvider': voiceProvider,
        if (model?.isNotEmpty == true) 'model': model,
        if (curriculumSource?.isNotEmpty == true) 'curriculumSource': curriculumSource,
        if (generationVersion == 'open-source') 'footage': footage else ...{'intro': intro, 'audio': audio},
      };
}

class JobEvent {
  const JobEvent({required this.at, required this.stage, required this.message});
  final DateTime? at;
  final String stage, message;
  factory JobEvent.fromJson(Map e) => JobEvent(
        at: DateTime.tryParse('${e['at'] ?? ''}'),
        stage: '${e['stage'] ?? ''}',
        message: '${e['message'] ?? ''}',
      );
}

class Job {
  Job({required this.id, required this.raw});
  final String id;
  final Map<String, dynamic> raw;

  factory Job.fromJson(Map e) => Job(id: '${e['id']}', raw: e.cast<String, dynamic>());

  Map<String, dynamic> get brief => (raw['brief'] as Map?)?.cast<String, dynamic>() ?? const {};
  String get status => '${raw['status'] ?? 'queued'}';
  String get stage => '${raw['stage'] ?? 'plan'}';
  int get progress => (raw['progress'] as num?)?.toInt() ?? 0;
  String get message => '${raw['message'] ?? ''}';
  String? get error => raw['error']?.toString();
  DateTime? get createdAt => DateTime.tryParse('${raw['createdAt'] ?? ''}');
  DateTime? get updatedAt => DateTime.tryParse('${raw['updatedAt'] ?? ''}');
  int get attempts => (raw['attempts'] as num?)?.toInt() ?? 0;

  List<JobEvent> get events => (raw['events'] as List? ?? const [])
      .whereType<Map>()
      .map(JobEvent.fromJson)
      .toList();

  Lesson? get lesson => raw['lesson'] is Map ? Lesson((raw['lesson'] as Map).cast<String, dynamic>()) : null;
  QualityReport? get report => raw['report'] is Map ? QualityReport((raw['report'] as Map).cast<String, dynamic>()) : null;
  Review? get review => raw['review'] is Map ? Review((raw['review'] as Map).cast<String, dynamic>()) : null;

  /// kind → artifact URL path (server-provided, e.g. /api/jobs/:id/artifacts/video)
  Map<String, String> get artifacts => {
        for (final e in ((raw['artifacts'] as Map?) ?? const {}).entries) '${e.key}': '${e.value}',
      };

  bool get isActive => status == 'queued' || status == 'running';
  bool get isReady => status == 'completed' || status == 'authored-benchmark';
  bool get canRetry => status == 'failed' || status == 'interrupted';

  String get title {
    final lessonTitle = lesson?.title;
    if (lessonTitle?.isNotEmpty == true) return lessonTitle!;
    final b = brief['text'];
    return (b is String && b.isNotEmpty) ? b : 'Untitled lesson';
  }

  String get generationVersion => '${brief['generationVersion'] ?? 'classic'}';
  bool get wantsFootage => brief['footage'] == 'wan' || stage == 'footage';
}

class Lesson {
  Lesson(this.raw);
  final Map<String, dynamic> raw;
  String get title => '${raw['title'] ?? ''}';
  String get audience => '${raw['audience'] ?? ''}';
  String? get successStatement => raw['successStatement']?.toString();
  String get conceptText {
    final c = raw['concept'];
    if (c is String) return c;
    if (c is Map) return [c['hook'], c['analogy'], c['arc']].whereType<String>().where((s) => s.isNotEmpty).join(' ');
    return '';
  }

  List<String> get objectives => (raw['objectives'] as List? ?? const [])
      .map((o) => o is Map ? '${o['text'] ?? ''}' : '$o')
      .where((s) => s.isNotEmpty)
      .toList();

  List<String> get prerequisites => (raw['prerequisites'] as List? ?? const []).map((p) => '$p').toList();

  List<String> get warnings => [
        ...((raw['curriculum'] as Map?)?['warnings'] as List? ?? const []),
        ...((raw['quality'] as Map?)?['warnings'] as List? ?? const []),
      ].map((w) => w is Map ? '${w['text'] ?? w}' : '$w').toList();

  List<Scene> get scenes => (raw['scenes'] as List? ?? const [])
      .whereType<Map>()
      .map((e) => Scene(e.cast<String, dynamic>()))
      .toList();
}

class Scene {
  Scene(this.raw);
  final Map<String, dynamic> raw;
  String get id => '${raw['id'] ?? ''}';
  String get beat => '${raw['beat'] ?? ''}';
  String get title => '${raw['title'] ?? beat}';
  String get narration => '${raw['narration'] ?? ''}';
  double get pauseSeconds => (raw['pauseSeconds'] as num?)?.toDouble() ?? 0;
  String get visualLabel => '${(raw['visual'] as Map?)?['label'] ?? ''}';
  List<String> get spokenBeats => (raw['spokenBeats'] as List? ?? const []).map((b) => '$b').toList();
  bool get hasInteraction => raw['interaction'] is Map;
}

class QualityReport {
  QualityReport(this.raw);
  final Map<String, dynamic> raw;
  String? get origin => raw['origin']?.toString();
  bool? get passed => raw['passed'] as bool?;
  List<String> get warnings => (raw['warnings'] as List? ?? const []).map((w) => w is Map ? '${w['text'] ?? w}' : '$w').toList();
  List<GateCheck> get checks => (raw['checks'] as List? ?? const [])
      .whereType<Map>()
      .map((e) => GateCheck(name: '${e['name'] ?? ''}', passed: e['passed'] == true, detail: '${e['detail'] ?? ''}'))
      .toList();
  List<ObjectiveCoverage> get coverage => (raw['coverage'] as List? ?? const [])
      .whereType<Map>()
      .map((e) => ObjectiveCoverage(text: '${e['text'] ?? ''}', explained: e['explained'] == true, practised: e['practised'] == true))
      .toList();
}

class GateCheck {
  const GateCheck({required this.name, required this.passed, this.detail = ''});
  final String name;
  final bool passed;
  final String detail;
}

class ObjectiveCoverage {
  const ObjectiveCoverage({required this.text, required this.explained, required this.practised});
  final String text;
  final bool explained, practised;
}

class Review {
  Review(this.raw);
  final Map<String, dynamic> raw;
  String get decision => '${raw['decision'] ?? ''}';
  String get note => '${raw['note'] ?? ''}';
  String get reviewer => '${raw['reviewer'] ?? ''}';
  DateTime? get at => DateTime.tryParse('${raw['at'] ?? ''}');
}

/// Curriculum tree models.
class CurriculumTree {
  CurriculumTree({required this.title, required this.units});
  final String title;
  final List<CurriculumUnit> units;
  factory CurriculumTree.fromJson(Map e) => CurriculumTree(
        title: '${e['title'] ?? ''}',
        units: (e['units'] as List? ?? const []).whereType<Map>().map((u) => CurriculumUnit.fromJson(u)).toList(),
      );
}

class CurriculumUnit {
  CurriculumUnit({required this.id, required this.title, required this.strand, required this.topics});
  final String id, title, strand;
  final List<CurriculumTopic> topics;
  factory CurriculumUnit.fromJson(Map e) => CurriculumUnit(
        id: '${e['id'] ?? ''}',
        title: '${e['title'] ?? ''}',
        strand: '${e['strand'] ?? ''}',
        topics: (e['topics'] as List? ?? const []).whereType<Map>().map((t) => CurriculumTopic.fromJson(t)).toList(),
      );
}

class CurriculumTopic {
  CurriculumTopic({required this.id, required this.title, required this.summary, required this.codes});
  final String id, title, summary;
  final List<String> codes;
  factory CurriculumTopic.fromJson(Map e) => CurriculumTopic(
        id: '${e['id'] ?? ''}',
        title: '${e['title'] ?? ''}',
        summary: '${e['summary'] ?? ''}',
        codes: (e['objectives'] as List? ?? const []).map((o) => o is Map ? '${o['code'] ?? ''}' : '$o').where((c) => c.isNotEmpty).toList(),
      );
}

/// Coverage entry: { topicId, unitId, jobs: [job summaries] }
class CoverageEntry {
  CoverageEntry({required this.topicId, required this.unitId, required this.jobs});
  final String topicId, unitId;
  final List<Job> jobs;
  factory CoverageEntry.fromJson(Map e) => CoverageEntry(
        topicId: '${e['topicId'] ?? ''}',
        unitId: '${e['unitId'] ?? ''}',
        jobs: (e['jobs'] as List? ?? const []).whereType<Map>().map((j) => Job.fromJson(j)).toList(),
      );

  /// Review decision wins over raw job status (matches web topicState()).
  String get state {
    final job = jobs.isEmpty ? null : jobs.first;
    if (job == null) return 'none';
    if (job.status == 'completed' && job.review != null) return job.review!.decision;
    return job.status;
  }
}

class CurriculumData {
  CurriculumData({required this.trees, required this.coverage});
  final List<CurriculumTree> trees;
  final List<CoverageEntry> coverage;
  CoverageEntry? forTopic(String topicId) {
    for (final e in coverage) {
      if (e.topicId == topicId) return e;
    }
    return null;
  }
}
