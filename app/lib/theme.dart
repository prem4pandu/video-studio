import 'package:flutter/material.dart';

/// Video Studio — "Production console" design system.
///
/// A light studio workspace: warm paper canvas, white surfaces, an emerald
/// accent for live state, amber for educator markers, and a bundled type
/// system (Inter UI · Space Grotesk display · JetBrains Mono telemetry).
/// Every token is local — the studio has no network dependencies.
abstract final class FairColors {
  static const canvas = Color(0xFFF5F4EF);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceSoft = Color(0xFFFAF9F5);
  static const surfaceRaised = Color(0xFFEFEEE7);
  static const surfaceInset = Color(0xFFF0EFE8);
  static const monitor = Color(0xFF101713);

  static const ink = Color(0xFF1E2421);
  static const inkSoft = Color(0xFF45524B);
  static const muted = Color(0xFF626D66);
  static const faint = Color(0xFF98A29B);

  static const line = Color(0xFFE3E3DB);
  static const strongLine = Color(0xFFCDD2C9);

  static const accent = Color(0xFF167A5C);
  static const accentDark = Color(0xFF0E5C45);
  static const accentSoft = Color(0xFFE4F1EB);

  static const amber = Color(0xFFB26421);
  static const amberSoft = Color(0xFFF8EDDE);
  static const warning = Color(0xFF96620E);
  static const warningBg = Color(0xFFFDF4DE);
  static const error = Color(0xFFB23A31);
  static const errorBg = Color(0xFFFBEEEC);
  static const success = Color(0xFF167A5C);
  static const successSoft = Color(0xFFE4F1EB);

  static const sidebar = Color(0xFFFBFAF6);
  static const sidebarMuted = Color(0xFF717B74);
  static const sidebarInk = Color(0xFF1E2421);
  static const sidebarLine = Color(0xFFE6E5DE);
}

abstract final class FairDimens {
  static const radius = 10.0;
  static const radiusSm = 7.0;
  static const radiusLg = 14.0;
  static const railWidth = 232.0;
  static const contentMax = 1240.0;
  static const gap = 14.0;
}

/// Console monospace telemetry — stage times, progress, durations, hashes.
TextStyle mono([double size = 11.5, Color color = FairColors.inkSoft, FontWeight weight = FontWeight.w500]) =>
    TextStyle(fontFamily: 'JetBrainsMono', fontSize: size, fontWeight: weight, color: color, height: 1.45, letterSpacing: 0.1);

/// Display type for screen titles and metric numerals.
TextStyle display([double size = 26, Color color = FairColors.ink, FontWeight weight = FontWeight.w700]) =>
    TextStyle(fontFamily: 'SpaceGrotesk', fontSize: size, fontWeight: weight, color: color, height: 1.12, letterSpacing: -0.6);

/// Flat console panel — one hairline border, faint inner top highlight.
BoxDecoration fairCard({double radius = FairDimens.radius, Color color = FairColors.surface}) => BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: FairColors.line),
    );

/// Inset well for code, logs, and fields that read as recessed.
BoxDecoration fairWell({double radius = FairDimens.radiusSm, Color color = FairColors.surfaceInset}) => BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: FairColors.line),
    );

ThemeData fairTheme() {
  const textColor = FairColors.ink;
  // Inter is bundled — pin it as the engine default so canvaskit never
  // reaches for the Roboto CDN font (blocked by connect-src 'self').
  final base = ThemeData(fontFamily: 'Inter', brightness: Brightness.light, useMaterial3: true);
  final text = base.textTheme.apply(fontFamily: 'Inter', bodyColor: textColor, displayColor: textColor);
  return base.copyWith(
    scaffoldBackgroundColor: FairColors.canvas,
    colorScheme: const ColorScheme.light(
      primary: FairColors.accent,
      onPrimary: Colors.white,
      secondary: FairColors.amber,
      surface: FairColors.surface,
      onSurface: textColor,
      error: FairColors.error,
      onError: Colors.white,
    ),
    splashColor: FairColors.accent.withValues(alpha: 0.08),
    hoverColor: FairColors.surfaceRaised,
    textTheme: text.copyWith(
      headlineMedium: display(28),
      titleLarge: display(19, FairColors.ink, FontWeight.w500),
      titleMedium: text.titleMedium?.copyWith(fontSize: 15, fontWeight: FontWeight.w600),
      labelSmall: text.labelSmall?.copyWith(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.2, color: FairColors.muted),
      bodyMedium: text.bodyMedium?.copyWith(fontSize: 13.5, height: 1.5, color: FairColors.inkSoft),
      bodySmall: text.bodySmall?.copyWith(fontSize: 12, height: 1.5, color: FairColors.muted),
    ),
    dividerTheme: const DividerThemeData(color: FairColors.line, thickness: 1, space: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: FairColors.accent, linearTrackColor: FairColors.line),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: FairColors.surfaceInset,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      hintStyle: const TextStyle(color: FairColors.muted, fontSize: 13),
      labelStyle: const TextStyle(color: FairColors.muted, fontSize: 12),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm), borderSide: const BorderSide(color: FairColors.strongLine)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm), borderSide: const BorderSide(color: FairColors.strongLine)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm), borderSide: const BorderSide(color: FairColors.accent, width: 1.6)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: FairColors.accent,
        foregroundColor: Colors.white,
        disabledBackgroundColor: FairColors.line,
        disabledForegroundColor: FairColors.muted,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm)),
        textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 13.5, fontWeight: FontWeight.w700, letterSpacing: 0.1),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: FairColors.ink,
        side: const BorderSide(color: FairColors.strongLine),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm)),
        textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 12.5, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: FairColors.accent, textStyle: const TextStyle(fontFamily: 'Inter', fontSize: 12.5, fontWeight: FontWeight.w600)),
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: FairColors.surfaceRaised,
      contentTextStyle: TextStyle(fontFamily: 'Inter', color: FairColors.ink, fontSize: 13),
    ),
    tabBarTheme: const TabBarThemeData(
      labelColor: FairColors.ink,
      unselectedLabelColor: FairColors.muted,
      indicatorColor: FairColors.accent,
      labelStyle: TextStyle(fontFamily: 'Inter', fontSize: 12.5, fontWeight: FontWeight.w600),
      unselectedLabelStyle: TextStyle(fontFamily: 'Inter', fontSize: 12.5, fontWeight: FontWeight.w500),
    ),
    expansionTileTheme: const ExpansionTileThemeData(
      iconColor: FairColors.muted,
      collapsedIconColor: FairColors.muted,
      textColor: FairColors.inkSoft,
      collapsedTextColor: FairColors.inkSoft,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(color: FairColors.surfaceRaised, borderRadius: BorderRadius.circular(6), border: Border.all(color: FairColors.strongLine)),
      textStyle: const TextStyle(fontFamily: 'Inter', color: FairColors.ink, fontSize: 11.5),
    ),
    scrollbarTheme: ScrollbarThemeData(thumbColor: WidgetStateProperty.all(FairColors.strongLine), thickness: WidgetStateProperty.all(8), radius: const Radius.circular(4)),
    dialogTheme: DialogThemeData(backgroundColor: FairColors.surface, surfaceTintColor: Colors.transparent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(FairDimens.radius))),
    popupMenuTheme: const PopupMenuThemeData(color: FairColors.surface),
    chipTheme: base.chipTheme.copyWith(backgroundColor: FairColors.surfaceSoft, selectedColor: FairColors.accentSoft, side: const BorderSide(color: FairColors.strongLine), labelStyle: const TextStyle(fontFamily: 'Inter', fontSize: 12, color: FairColors.inkSoft)),
  );
}

/// Small uppercase section label used across screens ("PIPELINE", "SETUP").
class Kicker extends StatelessWidget {
  const Kicker(this.label, {super.key, this.color = FairColors.amber});
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Text(
        label.toUpperCase(),
        style: TextStyle(fontFamily: 'JetBrainsMono', fontSize: 9.5, fontWeight: FontWeight.w500, letterSpacing: 1.8, color: color),
      );
}

/// Console status chip — status dot + text on a quiet tint.
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  static ({Color bg, Color fg, Color dot, String label}) style(String status) => switch (status) {
        'queued' => (bg: FairColors.warningBg, fg: FairColors.amber, dot: FairColors.amber, label: 'Queued'),
        'running' => (bg: FairColors.warningBg, fg: FairColors.amber, dot: FairColors.amber, label: 'Generating'),
        'completed' => (bg: FairColors.successSoft, fg: FairColors.accent, dot: FairColors.accent, label: 'Draft ready'),
        'failed' => (bg: FairColors.errorBg, fg: FairColors.error, dot: FairColors.error, label: 'Failed'),
        'interrupted' => (bg: FairColors.errorBg, fg: FairColors.error, dot: FairColors.error, label: 'Stopped'),
        'approved' => (bg: FairColors.accent, fg: Colors.white, dot: Colors.white, label: 'Approved'),
        'rejected' => (bg: const Color(0xFF6D3226), fg: Colors.white, dot: Colors.white, label: 'Rejected'),
        'needs-changes' => (bg: const Color(0xFF6D4A26), fg: Colors.white, dot: Colors.white, label: 'Needs changes'),
        _ => (bg: FairColors.surfaceRaised, fg: FairColors.muted, dot: FairColors.faint, label: 'Not started'),
      };

  @override
  Widget build(BuildContext context) {
    final s = style(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: s.bg, borderRadius: BorderRadius.circular(20)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 5, height: 5, decoration: BoxDecoration(color: s.dot, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(s.label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: s.fg)),
        ],
      ),
    );
  }
}

/// Composed empty state — icon tile, headline, body, optional action.
class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.body, this.action});
  final IconData icon;
  final String title, body;
  final Widget? action;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(color: FairColors.surfaceRaised, borderRadius: BorderRadius.circular(12), border: Border.all(color: FairColors.strongLine)),
              child: Icon(icon, size: 24, color: FairColors.amber),
            ),
            const SizedBox(height: 16),
            Text(title, style: display(20), textAlign: TextAlign.center),
            const SizedBox(height: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 380),
              child: Text(body, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: FairColors.muted, height: 1.55)),
            ),
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ),
      ),
    );
  }
}

/// Hairline meter — pipeline progress, coverage, and queue load.
class MeterBar extends StatelessWidget {
  const MeterBar({super.key, required this.value, this.color = FairColors.accent, this.height = 5});
  final double value;
  final Color color;
  final double height;
  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(height / 2),
      child: Container(
        height: height,
        color: FairColors.line,
        alignment: Alignment.centerLeft,
        child: FractionallySizedBox(
          widthFactor: value.clamp(0.0, 1.0),
          child: Container(color: color),
        ),
      ),
    );
  }
}
