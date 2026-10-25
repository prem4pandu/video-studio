import 'package:flutter/material.dart';

/// Fair Studio design tokens — ported from public/fair-studio.css so the
/// Flutter app and the web studio share one visual language.
abstract final class FairColors {
  static const canvas = Color(0xFFF4F3EF);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceSoft = Color(0xFFFAF9F6);
  static const ink = Color(0xFF202421);
  static const inkSoft = Color(0xFF3A423D);
  static const muted = Color(0xFF68716B);
  static const line = Color(0xFFDEDFD9);
  static const strongLine = Color(0xFFC4C9C2);

  static const accent = Color(0xFF16705B);
  static const accentDark = Color(0xFF0F5646);
  static const accentSoft = Color(0xFFE7F2ED);

  static const amber = Color(0xFFB86524);
  static const amberSoft = Color(0xFFFAEEE3);
  static const warning = Color(0xFF95601C);
  static const warningBg = Color(0xFFFFF4DB);
  static const error = Color(0xFFA33B32);
  static const errorBg = Color(0xFFFFF0ED);
  static const success = Color(0xFF2C6E49);
  static const successSoft = Color(0xFFE3EFE2);

  static const sidebar = Color(0xFF1F2925);
  static const sidebarMuted = Color(0xFFAEB9B3);
  static const sidebarInk = Color(0xFFF1F3EE);
  static const sidebarLine = Color(0xFF36423C);

  static const monitor = Color(0xFF0E1A17);
}

abstract final class FairDimens {
  static const radius = 12.0;
  static const radiusSm = 8.0;
  static const radiusLg = 18.0;
  static const railWidth = 240.0;
  static const contentMax = 1180.0;
  static const gap = 16.0;
}

const _shadows = [
  BoxShadow(color: Color(0x0D16221D), blurRadius: 2, offset: Offset(0, 1)),
  BoxShadow(color: Color(0x0D16221D), blurRadius: 24, offset: Offset(0, 8)),
];

BoxDecoration fairCard({double radius = FairDimens.radius, Color color = FairColors.surface}) => BoxDecoration(
      color: color,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: FairColors.line),
      boxShadow: _shadows,
    );

ThemeData fairTheme() {
  final base = ThemeData.light(useMaterial3: true);
  final text = base.textTheme.apply(bodyColor: FairColors.ink, displayColor: FairColors.ink);
  return base.copyWith(
    scaffoldBackgroundColor: FairColors.canvas,
    colorScheme: ColorScheme.fromSeed(
      seedColor: FairColors.accent,
      primary: FairColors.accent,
      surface: FairColors.surface,
      error: FairColors.error,
    ),
    textTheme: text.copyWith(
      headlineMedium: text.headlineMedium?.copyWith(fontSize: 28, fontWeight: FontWeight.w700, letterSpacing: -0.8, height: 1.15),
      titleLarge: text.titleLarge?.copyWith(fontSize: 18, fontWeight: FontWeight.w600, letterSpacing: -0.3),
      titleMedium: text.titleMedium?.copyWith(fontSize: 15, fontWeight: FontWeight.w600),
      labelSmall: text.labelSmall?.copyWith(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.0, color: FairColors.muted),
    ),
    dividerTheme: const DividerThemeData(color: FairColors.line, thickness: 1, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: FairColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      hintStyle: const TextStyle(color: FairColors.muted, fontSize: 13),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm), borderSide: const BorderSide(color: FairColors.strongLine)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm), borderSide: const BorderSide(color: FairColors.strongLine)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm), borderSide: const BorderSide(color: FairColors.accent, width: 2)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: FairColors.accent,
        foregroundColor: Colors.white,
        disabledBackgroundColor: FairColors.strongLine,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm)),
        textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: FairColors.ink,
        side: const BorderSide(color: FairColors.strongLine),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(FairDimens.radiusSm)),
        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    tabBarTheme: const TabBarThemeData(
      labelColor: FairColors.ink,
      unselectedLabelColor: FairColors.muted,
      indicatorColor: FairColors.accent,
      labelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      unselectedLabelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
    ),
  );
}

/// Small uppercase section label used across screens ("PIPELINE", "SETUP").
class Kicker extends StatelessWidget {
  const Kicker(this.label, {super.key, this.color = FairColors.accent});
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Text(
        label.toUpperCase(),
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.4, color: color),
      );
}

/// Status chip shared by library rows, curriculum tree and job headers.
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  static ({Color bg, Color fg, String label}) style(String status) => switch (status) {
        'queued' => (bg: FairColors.warningBg, fg: FairColors.warning, label: 'Queued'),
        'running' => (bg: FairColors.warningBg, fg: FairColors.warning, label: 'Generating'),
        'completed' => (bg: FairColors.successSoft, fg: FairColors.success, label: 'Draft ready'),
        'failed' => (bg: FairColors.errorBg, fg: FairColors.error, label: 'Failed'),
        'interrupted' => (bg: FairColors.errorBg, fg: FairColors.error, label: 'Stopped'),
        'approved' => (bg: FairColors.accentDark, fg: Colors.white, label: 'Approved'),
        'rejected' => (bg: const Color(0xFF6D3226), fg: Colors.white, label: 'Rejected'),
        'needs-changes' => (bg: const Color(0xFF6D3226), fg: Colors.white, label: 'Needs changes'),
        _ => (bg: FairColors.accentSoft, fg: FairColors.muted, label: 'Not started'),
      };

  @override
  Widget build(BuildContext context) {
    final s = style(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: s.bg, borderRadius: BorderRadius.circular(20)),
      child: Text(s.label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, letterSpacing: 0.4, color: s.fg)),
    );
  }
}
