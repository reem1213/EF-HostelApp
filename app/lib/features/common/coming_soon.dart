import 'package:material_ui/material_ui.dart';

import '../../core/theme.dart';

/// Placeholder for tabs that are not built yet.
class ComingSoonScreen extends StatelessWidget {
  const ComingSoonScreen({super.key, required this.title, required this.summary});

  final String title;
  final String summary;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, style: displaySerif(size: 34, color: AppColors.ink, weight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(summary, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted)),
            const SizedBox(height: 12),
            const Text('Coming next', style: TextStyle(color: AppColors.teal, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
