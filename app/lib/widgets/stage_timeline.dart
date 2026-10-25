import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../models.dart';
import '../state.dart';
import '../theme.dart';

/// Interactive pipeline timeline — the heart of the job monitor.
///
/// Renders every pipeline step with a live state: done (check), current
/// (pulsing marker + ticking elapsed time), failed, or pending. Ticking is
/// driven by a 1s [Timer] while the job is active, so elapsed time animates
/// continuously without re-firing the API.
class StageTimeline extends StatefulWidget {
  const StageTimeline({super.key, required this.job, this.compact = false});
  final Job job;

  /// Compact mode drops descriptions — used in dashboard cards.
  final bool compact;

  @override
  State<StageTimeline> createState() => _StageTimelineState();
}

class _StageTimelineState extends State<StageTimeline> with SingleTickerProviderStateMixin {
  Timer? _ticker;
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();
    _syncTicker();
  }

  @override
  void didUpdateWidget(StageTimeline old) {
    super.didUpdateWidget(old);
    _syncTicker();
  }

  void _syncTicker() {
    final active = widget.job.isActive;
    if (active && _ticker == null) {
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
    } else if (!active && _ticker != null) {
      _ticker?.cancel();
      _ticker = null;
    }
    if (active && !_pulse.isAnimating) _pulse.repeat();
    if (!active && _pulse.isAnimating) _pulse.stop();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final job = widget.job;
    final steps = pipelineStepsFor(
        generationVersion: job.generationVersion, footage: job.wantsFootage, audio: job.brief['audio'] == 'music');
    final currentIndex = steps.indexWhere((s) => s.id == job.stage);
    final currentEvent = _stageEvent(job, job.stage);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < steps.length; i++)
          _StageTile(
            step: steps[i],
            index: i,
            state: _stateFor(job, i, currentIndex),
            event: _stageEvent(job, steps[i].id),
            elapsed: i == currentIndex && job.isActive ? _elapsed(currentEvent?.at) : null,
            compact: widget.compact,
            isLast: i == steps.length - 1,
            pulse: _pulse,
          ),
      ],
    );
  }

  static _StageState _stateFor(Job job, int index, int currentIndex) {
    if (job.isReady || index < currentIndex) return _StageState.done;
    if (index == currentIndex) {
      if (job.status == 'failed' || job.status == 'interrupted') return _StageState.failed;
      return _StageState.current;
    }
    return _StageState.pending;
  }

  static JobEvent? _stageEvent(Job job, String stageId) {
    for (final e in job.events) {
      if (e.stage == stageId) return e;
    }
    return null;
  }

  static String _elapsed(DateTime? start) {
    if (start == null) return '';
    final seconds = math.max(0, DateTime.now().difference(start).inSeconds);
    if (seconds < 60) return '${seconds}s';
    return '${seconds ~/ 60}m ${seconds % 60}s';
  }
}

enum _StageState { done, current, failed, pending }

class _StageTile extends StatelessWidget {
  const _StageTile({
    required this.step,
    required this.index,
    required this.state,
    required this.event,
    required this.elapsed,
    required this.compact,
    required this.isLast,
    required this.pulse,
  });
  final PipelineStep step;
  final int index;
  final _StageState state;
  final JobEvent? event;
  final String? elapsed;
  final bool compact;
  final bool isLast;
  final Animation<double> pulse;

  @override
  Widget build(BuildContext context) {
    final done = state == _StageState.done;
    final current = state == _StageState.current;
    final failed = state == _StageState.failed;
    final markerColor = done
        ? FairColors.accent
        : current
            ? FairColors.warning
            : failed
                ? FairColors.error
                : FairColors.strongLine;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 34,
            child: Column(
              children: [
                AnimatedBuilder(
                  animation: pulse,
                  builder: (context, _) {
                    final ring = current ? 3.0 + pulse.value * 4 : 0.0;
                    return Container(
                      width: 26,
                      height: 26,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: markerColor,
                        boxShadow: current ? [BoxShadow(color: FairColors.warning.withValues(alpha: 0.45 * (1 - pulse.value)), blurRadius: ring * 2, spreadRadius: ring / 2)] : null,
                      ),
                      child: Center(
                        child: done
                            ? const Icon(Icons.check, size: 14, color: Colors.white)
                            : failed
                                ? const Icon(Icons.priority_high, size: 14, color: Colors.white)
                                : Text('${index + 1}'.padLeft(2, '0'),
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: current ? Colors.white : FairColors.muted)),
                      ),
                    );
                  },
                ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 3),
                      color: done ? FairColors.accent.withValues(alpha: 0.5) : FairColors.line,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : (compact ? 10 : 16), top: 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(step.label,
                            style: TextStyle(
                              fontSize: compact ? 12.5 : 13.5,
                              fontWeight: FontWeight.w600,
                              color: state == _StageState.pending ? FairColors.muted : FairColors.ink,
                            )),
                      ),
                      _statusLabel(),
                    ],
                  ),
                  if (!compact) ...[
                    const SizedBox(height: 2),
                    Text(step.description, style: const TextStyle(fontSize: 11.5, color: FairColors.muted, height: 1.4)),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.inventory_2_outlined, size: 11, color: FairColors.muted),
                        const SizedBox(width: 4),
                        Text(step.output, style: const TextStyle(fontSize: 10.5, color: FairColors.muted, fontWeight: FontWeight.w500)),
                        if (event?.at != null) ...[
                          const SizedBox(width: 10),
                          Text(
                            _time(event!.at!) + (elapsed != null ? ' · $elapsed elapsed' : ''),
                            style: const TextStyle(fontSize: 10.5, color: FairColors.muted, fontFeatures: [FontFeature.tabularFigures()]),
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _statusLabel() {
    final (label, color) = switch (state) {
      _StageState.done => ('Complete', FairColors.success),
      _StageState.current => ('In progress', FairColors.warning),
      _StageState.failed => ('Stopped', FairColors.error),
      _StageState.pending => ('Waiting', FairColors.muted),
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (state == _StageState.current)
          Padding(
            padding: const EdgeInsets.only(right: 5),
            child: SizedBox(
              width: 9,
              height: 9,
              child: CircularProgressIndicator(strokeWidth: 1.6, color: color),
            ),
          ),
        Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color, letterSpacing: 0.3)),
      ],
    );
  }

  static String _time(DateTime at) {
    final h = at.toLocal().hour.toString().padLeft(2, '0');
    final m = at.toLocal().minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

/// Overall animated progress bar with percentage — sits above the timeline.
class JobProgressBar extends StatelessWidget {
  const JobProgressBar({super.key, required this.job});
  final Job job;

  @override
  Widget build(BuildContext context) {
    final pct = job.isReady ? 100 : job.progress.clamp(0, 100);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(job.isReady ? 'Ready for review' : (job.message.isNotEmpty ? job.message : 'Working…'),
                style: const TextStyle(fontSize: 12.5, color: FairColors.inkSoft), maxLines: 2, overflow: TextOverflow.ellipsis)),
            const SizedBox(width: 10),
            Text('$pct%', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, fontFeatures: [FontFeature.tabularFigures()])),
          ],
        ),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(5),
          child: SizedBox(
            height: 8,
            child: Stack(
              fit: StackFit.expand,
              children: [
                const ColoredBox(color: FairColors.line),
                TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: pct / 100),
                  duration: const Duration(milliseconds: 600),
                  curve: Curves.easeOutCubic,
                  builder: (context, value, _) => FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: value.clamp(0, 1),
                    child: ColoredBox(color: job.status == 'failed' ? FairColors.error : job.isReady ? FairColors.accent : FairColors.warning),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
