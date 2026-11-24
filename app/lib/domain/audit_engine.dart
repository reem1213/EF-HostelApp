import '../core/money.dart';
import 'models.dart';

/// Turns raw bookings and expenses into findings, metrics and a next step.
///
/// Pure Dart: no I/O, no Flutter. Every rule is listed below so each number
/// on screen can be traced back to its source.
///
/// Rules (monthly impact in cents):
///  1. laundry-peer     Laundry per bed-night above the peer median.
///                      impact = laundry - peerPerNight * occupiedBedNights
///  2. ota-commission   Channel commission above the target rate on OTA revenue.
///                      impact = commission - otaRevenue * targetRate
///  3. dupe-MERCHANT  Same software merchant charged more than once.
///                      impact = every charge after the first
///  4. spike-CATEGORY Category up >= 15% and >= $50 vs the previous period.
///                      Laundry and channel commission are skipped because
///                      rules 1 and 2 already cover them (avoids double counting).
///  5. direct-share     (growth) Direct revenue below target.
///                      shifted = min(otaRevenue, target*revenue - directRevenue)
///                      impact  = shifted * effective OTA commission rate
///
/// Profit health (0-100, heuristic, to tune with real data):
///   100 - 1.5 × cost gap vs peer (%) - 2 * open leaks as % of revenue
///       - 0.5 * OTA share above target (%)
class AuditEngine {
  AuditEngine._();

  static const double spikeRatio = 0.15;
  static const int spikeMinCents = 5000;

  /// Runs every rule. Nothing is addressed yet; use [withAddressed] to apply
  /// the user's progress.
  static AuditResult run(AuditInput input, {Set<String> addressed = const {}}) {
    final bench = input.property.benchmark;
    final revenue = _sumRevenue(input.bookings, null);
    final otaRevenue = _sumRevenue(input.bookings, Channel.ota);
    final directRevenue = _sumRevenue(input.bookings, Channel.direct);
    final opCost = _sumExpenses(input.expenses, null);
    final nights = input.occupiedBedNights;

    final commission = _sumExpenses(input.expenses, ExpenseCategory.channelCommission);
    final laundry = _sumExpenses(input.expenses, ExpenseCategory.laundry);
    final effectiveOtaRate = otaRevenue > 0
        ? commission / otaRevenue
        : bench.targetOtaCommissionRate;

    final findings = <Finding>[
      ..._laundryOverPeer(laundry, nights, bench),
      ..._otaCommission(commission, otaRevenue, bench),
      ..._duplicateSoftware(input.expenses),
      ..._categorySpikes(input.expenses, input.previousExpenses),
      ..._directShareGrowth(
        revenue: revenue,
        directRevenue: directRevenue,
        otaRevenue: otaRevenue,
        effectiveOtaRate: effectiveOtaRate,
        bench: bench,
      ),
    ]..sort((a, b) => b.monthlyImpactCents.compareTo(a.monthlyImpactCents));

    final costPerNight = nights > 0 ? opCost ~/ nights : 0;
    final laundryPerNight = nights > 0 ? laundry ~/ nights : 0;
    final directShare = revenue > 0 ? directRevenue / revenue : 0.0;
    final otaShare = revenue > 0 ? otaRevenue / revenue : 0.0;

    return _build(
      property: input.property,
      syncedAt: input.syncedAt,
      findings: findings,
      addressed: addressed,
      revenue: revenue,
      opCost: opCost,
      nights: nights,
      costPerNight: costPerNight,
      laundryPerNight: laundryPerNight,
      directShare: directShare,
      otaShare: otaShare,
    );
  }

  /// Same findings with a different set of addressed ids applied.
  static AuditResult withAddressed(AuditResult r, Set<String> addressed) => _build(
        property: r.property,
        syncedAt: r.syncedAt,
        findings: r.findings,
        addressed: addressed,
        revenue: r.totalRevenueCents,
        opCost: r.operatingCostCents,
        nights: r.occupiedBedNights,
        costPerNight: r.costPerBedNightCents,
        laundryPerNight: r.laundryPerBedNightCents,
        directShare: r.directSharePct,
        otaShare: r.otaSharePct,
      );

  static AuditResult _build({
    required PropertyProfile property,
    required DateTime syncedAt,
    required List<Finding> findings,
    required Set<String> addressed,
    required int revenue,
    required int opCost,
    required int nights,
    required int costPerNight,
    required int laundryPerNight,
    required double directShare,
    required double otaShare,
  }) {
    final openLeakCents = findings
        .where((f) => f.kind == FindingKind.leak && !addressed.contains(f.id))
        .fold(0, (s, f) => s + f.monthlyImpactCents);
    return AuditResult(
      property: property,
      syncedAt: syncedAt,
      findings: findings,
      addressedIds: addressed,
      totalRevenueCents: revenue,
      operatingCostCents: opCost,
      occupiedBedNights: nights,
      costPerBedNightCents: costPerNight,
      laundryPerBedNightCents: laundryPerNight,
      directSharePct: directShare,
      otaSharePct: otaShare,
      profitHealth: _profitHealth(
        costPerNight: costPerNight,
        bench: property.benchmark,
        openLeakCents: openLeakCents,
        revenueCents: revenue,
        otaShare: otaShare,
      ),
    );
  }

  // ---- rules -------------------------------------------------------------

  static List<Finding> _laundryOverPeer(int laundry, int nights, Benchmark bench) {
    if (nights <= 0) return const [];
    final impact = laundry - bench.peerLaundryPerBedNightCents * nights;
    if (impact <= 0) return const [];
    final perNight = dollarsExact(laundry ~/ nights);
    final peer = dollarsExact(bench.peerLaundryPerBedNightCents);
    return [
      Finding(
        id: 'laundry-peer',
        kind: FindingKind.leak,
        area: FindingArea.costs,
        title: 'Laundry above peer median',
        detail: '$perNight per occupied night vs peer $peer',
        monthlyImpactCents: impact,
        severity: _severityFor(impact),
      ),
    ];
  }

  static List<Finding> _otaCommission(int commission, int otaRevenue, Benchmark bench) {
    if (otaRevenue <= 0) return const [];
    final allowed = (otaRevenue * bench.targetOtaCommissionRate).round();
    final impact = commission - allowed;
    if (impact <= 0) return const [];
    final rate = (commission / otaRevenue * 100).toStringAsFixed(1);
    final target = (bench.targetOtaCommissionRate * 100).round();
    return [
      Finding(
        id: 'ota-commission',
        kind: FindingKind.leak,
        area: FindingArea.money,
        title: 'Booking-site commission',
        detail: '$rate% effective commission vs $target% target',
        monthlyImpactCents: impact,
        severity: _severityFor(impact),
      ),
    ];
  }

  static List<Finding> _duplicateSoftware(List<Expense> expenses) {
    final byMerchant = <String, List<Expense>>{};
    for (final e in expenses) {
      if (e.category != ExpenseCategory.software) continue;
      byMerchant.putIfAbsent(_merchantKey(e.merchant), () => []).add(e);
    }
    final out = <Finding>[];
    byMerchant.forEach((key, charges) {
      if (charges.length < 2) return;
      charges.sort((a, b) => a.date.compareTo(b.date));
      final extra = charges.skip(1).fold<int>(0, (s, e) => s + e.amountCents);
      out.add(Finding(
        id: 'dupe-$key',
        kind: FindingKind.leak,
        area: FindingArea.money,
        title: 'Duplicate charge: ${charges.first.merchant}',
        detail: '${charges.length} charges this period for the same service',
        monthlyImpactCents: extra,
        severity: _severityFor(extra),
      ));
    });
    return out;
  }

  static List<Finding> _categorySpikes(List<Expense> current, List<Expense> previous) {
    const skip = {ExpenseCategory.laundry, ExpenseCategory.channelCommission};
    final out = <Finding>[];
    for (final cat in ExpenseCategory.values) {
      if (skip.contains(cat)) continue;
      final now = _sumExpenses(current, cat);
      final before = _sumExpenses(previous, cat);
      if (before <= 0) continue;
      final increase = now - before;
      if (increase < spikeMinCents) continue;
      final ratio = increase / before;
      if (ratio < spikeRatio) continue;
      out.add(Finding(
        id: 'spike-${cat.name}',
        kind: FindingKind.leak,
        area: FindingArea.costs,
        title: '${cat.label} up ${(ratio * 100).round()}% vs last period',
        detail: '${dollars(increase)} more than the previous period',
        monthlyImpactCents: increase,
        severity: _severityFor(increase),
      ));
    }
    return out;
  }

  static List<Finding> _directShareGrowth({
    required int revenue,
    required int directRevenue,
    required int otaRevenue,
    required double effectiveOtaRate,
    required Benchmark bench,
  }) {
    if (revenue <= 0 || otaRevenue <= 0) return const [];
    final directShare = directRevenue / revenue;
    if (directShare >= bench.targetDirectShare) return const [];
    final wanted = (bench.targetDirectShare * revenue).round() - directRevenue;
    final shifted = wanted < otaRevenue ? wanted : otaRevenue;
    final impact = (shifted * effectiveOtaRate).round();
    if (impact <= 0) return const [];
    return [
      Finding(
        id: 'direct-share',
        kind: FindingKind.growth,
        area: FindingArea.growth,
        title: 'Move OTA guests to direct booking',
        detail: '${(directShare * 100).round()}% direct today, target '
            '${(bench.targetDirectShare * 100).round()}%',
        monthlyImpactCents: impact,
        severity: _severityFor(impact),
      ),
    ];
  }

  // ---- helpers -----------------------------------------------------------

  static int _sumRevenue(List<Booking> bookings, Channel? channel) => bookings
      .where((b) => channel == null || b.channel == channel)
      .fold(0, (s, b) => s + b.revenueCents);

  static int _sumExpenses(List<Expense> expenses, ExpenseCategory? cat) => expenses
      .where((e) => cat == null || e.category == cat)
      .fold(0, (s, e) => s + e.amountCents);

  static String _merchantKey(String merchant) =>
      merchant.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');

  static Severity _severityFor(int cents) {
    if (cents >= 20000) return Severity.high;
    if (cents >= 7500) return Severity.medium;
    return Severity.low;
  }

  static int _profitHealth({
    required int costPerNight,
    required Benchmark bench,
    required int openLeakCents,
    required int revenueCents,
    required double otaShare,
  }) {
    final peer = bench.peerCostPerBedNightCents;
    final costGapPct = peer > 0 ? ((costPerNight - peer) / peer * 100).clamp(0, 1e9).toDouble() : 0.0;
    final leakPct = revenueCents > 0 ? openLeakCents / revenueCents * 100 : 0.0;
    final otaExcessPct = ((otaShare - bench.targetOtaShare) * 100).clamp(0, 1e9).toDouble();
    final score = 100 - 1.5 * costGapPct - 2 * leakPct - 0.5 * otaExcessPct;
    return score.round().clamp(0, 100);
  }
}
