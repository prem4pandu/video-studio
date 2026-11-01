import 'package:flutter/material.dart';

import '../theme.dart';
import 'api.dart';

class V2Page extends StatelessWidget {
  const V2Page({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, box) => SingleChildScrollView(
      padding: EdgeInsets.all(box.maxWidth < 600 ? 18 : 32),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1180),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: children,
          ),
        ),
      ),
    ),
  );
}

class V2Panel extends StatelessWidget {
  const V2Panel({super.key, required this.child, this.padding = 24});
  final Widget child;
  final double padding;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: EdgeInsets.all(padding),
    decoration: fairCard(),
    child: child,
  );
}

class V2Badge extends StatelessWidget {
  const V2Badge({
    super.key,
    required this.label,
    this.color = FairColors.inkSoft,
  });
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: color.withValues(alpha: .1),
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: color.withValues(alpha: .25)),
    ),
    child: Text(
      label,
      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
    ),
  );
}

class V2Notice extends StatelessWidget {
  const V2Notice({
    super.key,
    required this.message,
    this.error = false,
    this.action,
  });
  final String message;
  final bool error;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(16),
    decoration: fairCard(
      color: error ? FairColors.errorBg : FairColors.surfaceSoft,
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          error ? Icons.error_outline : Icons.info_outline,
          size: 20,
          color: error ? FairColors.error : FairColors.inkSoft,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            message,
            style: TextStyle(
              color: error ? FairColors.error : FairColors.inkSoft,
              height: 1.5,
            ),
          ),
        ),
        ?action,
      ],
    ),
  );
}

class V2Disclosure extends StatelessWidget {
  const V2Disclosure({
    super.key,
    required this.title,
    this.subtitle,
    required this.children,
  });
  final String title;
  final String? subtitle;
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(top: 12, bottom: 16),
        expandedCrossAxisAlignment: CrossAxisAlignment.start,
        expansionAnimationStyle: AnimationStyle(
          duration: MediaQuery.disableAnimationsOf(context)
              ? Duration.zero
              : const Duration(milliseconds: 200),
        ),
        title: Text(
          title,
          style: const TextStyle(fontSize: 15, color: FairColors.ink),
        ),
        subtitle: subtitle == null
            ? null
            : Text(
                subtitle!,
                style: const TextStyle(fontSize: 12, color: FairColors.inkSoft),
              ),
        children: [
          SizedBox(
            width: double.infinity,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: children,
            ),
          ),
        ],
      ),
    ),
  );
}

class V2JobTile extends StatelessWidget {
  const V2JobTile({
    super.key,
    required this.job,
    required this.onTap,
    this.thumbnail,
  });
  final V2Job job;
  final VoidCallback onTap;
  final String? thumbnail;
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ColoredBox(
                    color: FairColors.surfaceSoft,
                    child: Center(
                      child: Icon(
                        job.completed
                            ? Icons.play_circle_outline
                            : Icons.movie_creation_outlined,
                        size: 42,
                        color: FairColors.inkSoft,
                      ),
                    ),
                  ),
                  if (thumbnail != null)
                    Image.network(
                      thumbnail!,
                      fit: BoxFit.cover,
                      excludeFromSemantics: true,
                      errorBuilder: (_, _, _) => const SizedBox(),
                    ),
                  if (job.active)
                    Align(
                      alignment: Alignment.bottomCenter,
                      child: LinearProgressIndicator(
                        value: job.progress / 100,
                        minHeight: 3,
                      ),
                    ),
                  if (job.completed)
                    const Positioned(
                      right: 12,
                      bottom: 12,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          color: Color(0xBB101714),
                          shape: BoxShape.circle,
                        ),
                        child: Padding(
                          padding: EdgeInsets.all(8),
                          child: Icon(
                            Icons.play_arrow,
                            size: 22,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            job.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 16,
              height: 1.5,
              fontWeight: FontWeight.w600,
              color: FairColors.ink,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            '${job.label} · ${job.brief['format'] == 'portrait' ? 'Portrait' : 'Landscape'}',
            style: TextStyle(
              fontSize: 13,
              color:
                  job.retryable ||
                      [
                        'needs-changes',
                        'rejected',
                      ].contains(job.review?['decision'])
                  ? FairColors.amber
                  : FairColors.inkSoft,
            ),
          ),
        ],
      ),
    ),
  );
}
