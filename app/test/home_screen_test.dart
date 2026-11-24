import 'dart:ui' show Size;
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:hostelpulse/data/audit_repository.dart';
import 'package:hostelpulse/features/home/home_controller.dart';
import 'package:hostelpulse/features/shell/app_shell.dart';
import 'package:hostelpulse/main.dart';

void main() {
  setUpAll(() {
    // No network in tests: fall back to the default font instead of fetching.
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('home renders the audit sections from demo data', (tester) async {
    tester.view.physicalSize = const Size(430 * 2, 1000 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    final now = DateTime(2026, 11, 24, 9);
    final controller = HomeController(AuditRepository.demo(now: () => now));
    await tester.pumpWidget(HostelPulseApp(homeController: controller));
    await tester.pumpAndSettle();

    expect(find.text('Roam Quarter Hostel'), findsOneWidget);
    expect(find.text('Money leaks found'), findsOneWidget);
    expect(find.text('Audit breakdown'), findsOneWidget);
    expect(find.text('Recommended next step'), findsOneWidget);
    expect(find.text('Property pulse'), findsOneWidget);
    expect(find.text('Direct split'), findsOneWidget);
    expect(find.text('Profit health'), findsOneWidget);
    expect(find.text('Laundry above peer median'), findsOneWidget);
  });

  testWidgets('marking the next step done updates the audit', (tester) async {
    tester.view.physicalSize = const Size(430 * 2, 1000 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    final now = DateTime(2026, 11, 24, 9);
    final controller = HomeController(AuditRepository.demo(now: () => now));
    await tester.pumpWidget(HostelPulseApp(homeController: controller));
    await tester.pumpAndSettle();

    final before = controller.result!.nextStep!.id;
    await tester.tap(find.text('Laundry above peer median'));
    await tester.pumpAndSettle();
    expect(find.text('Mark as done'), findsOneWidget);

    await tester.tap(find.text('Mark as done'));
    await tester.pumpAndSettle();

    expect(controller.result!.addressedIds, {before});
    expect(controller.result!.nextStep!.id, isNot(before));
  });

  testWidgets('bottom navigation switches to placeholder tabs', (tester) async {
    tester.view.physicalSize = const Size(430 * 2, 1000 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);

    final controller = HomeController(AuditRepository.demo(now: () => DateTime(2026, 11, 24)));
    await tester.pumpWidget(HostelPulseApp(homeController: controller));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Reports'));
    await tester.pumpAndSettle();
    expect(find.text('Coming next'), findsOneWidget);
    expect(find.byType(AppShell), findsOneWidget);
  });
}
