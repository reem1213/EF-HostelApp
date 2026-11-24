import 'package:flutter/foundation.dart';

/// Half-open date range [start, end).
@immutable
class DateRange {
  const DateRange(this.start, this.end);
  final DateTime start;
  final DateTime end;

  int get days => end.difference(start).inDays;

  bool contains(DateTime t) => !t.isBefore(start) && t.isBefore(end);
}

enum Channel { direct, ota, other }

enum ExpenseCategory {
  laundry,
  utilities,
  staff,
  software,
  channelCommission,
  supplies,
  other;

  String get label => switch (this) {
        ExpenseCategory.laundry => 'Laundry',
        ExpenseCategory.utilities => 'Utilities',
        ExpenseCategory.staff => 'Staff',
        ExpenseCategory.software => 'Software',
        ExpenseCategory.channelCommission => 'Channel commission',
        ExpenseCategory.supplies => 'Supplies',
        ExpenseCategory.other => 'Other',
      };
}

/// A bed-stay booked through a channel.
@immutable
class Booking {
  const Booking({
    required this.id,
    required this.channel,
    required this.revenueCents,
    required this.nights,
    required this.checkIn,
  });

  final String id;
  final Channel channel;
  final int revenueCents;
  final int nights;
  final DateTime checkIn;
}

/// An operating expense (bank or card charge). Amount is positive cents.
@immutable
class Expense {
  const Expense({
    required this.id,
    required this.date,
    required this.amountCents,
    required this.merchant,
    required this.category,
  });

  final String id;
  final DateTime date;
  final int amountCents;
  final String merchant;
  final ExpenseCategory category;
}

/// Peer-group targets used to judge a property.
@immutable
class Benchmark {
  const Benchmark({
    required this.peerCostPerBedNightCents,
    required this.targetCostPerBedNightCents,
    required this.peerLaundryPerBedNightCents,
    required this.targetOtaCommissionRate,
    required this.targetDirectShare,
    required this.targetOtaShare,
  });

  final int peerCostPerBedNightCents;
  final int targetCostPerBedNightCents;
  final int peerLaundryPerBedNightCents;

  /// e.g. 0.15 means 15% commission is acceptable.
  final double targetOtaCommissionRate;

  /// e.g. 0.40 means 40% of revenue should come direct.
  final double targetDirectShare;

  /// Above this share of OTA revenue the property is considered over-dependent.
  final double targetOtaShare;
}

@immutable
class PropertyProfile {
  const PropertyProfile({
    required this.id,
    required this.name,
    required this.beds,
    required this.benchmark,
  });

  final String id;
  final String name;
  final int beds;
  final Benchmark benchmark;
}

/// Everything the engine needs for one audit period.
@immutable
class AuditInput {
  const AuditInput({
    required this.property,
    required this.period,
    required this.previousPeriod,
    required this.occupiedBedNights,
    required this.bookings,
    required this.expenses,
    required this.previousExpenses,
    required this.syncedAt,
  });

  final PropertyProfile property;
  final DateRange period;
  final DateRange previousPeriod;
  final int occupiedBedNights;
  final List<Booking> bookings;
  final List<Expense> expenses;
  final List<Expense> previousExpenses;
  final DateTime syncedAt;
}

enum FindingKind { leak, growth }

enum FindingArea { money, costs, growth }

enum Severity { low, medium, high }

@immutable
class Finding {
  const Finding({
    required this.id,
    required this.kind,
    required this.area,
    required this.title,
    required this.detail,
    required this.monthlyImpactCents,
    required this.severity,
  });

  /// Stable key, used to remember that the user addressed it.
  final String id;
  final FindingKind kind;
  final FindingArea area;
  final String title;
  final String detail;
  final int monthlyImpactCents;
  final Severity severity;
}

@immutable
class AuditResult {
  const AuditResult({
    required this.property,
    required this.syncedAt,
    required this.findings,
    required this.addressedIds,
    required this.totalRevenueCents,
    required this.operatingCostCents,
    required this.occupiedBedNights,
    required this.costPerBedNightCents,
    required this.laundryPerBedNightCents,
    required this.directSharePct,
    required this.otaSharePct,
    required this.profitHealth,
  });

  final PropertyProfile property;
  final DateTime syncedAt;

  /// All findings, highest monthly impact first.
  final List<Finding> findings;
  final Set<String> addressedIds;

  final int totalRevenueCents;
  final int operatingCostCents;
  final int occupiedBedNights;
  final int costPerBedNightCents;
  final int laundryPerBedNightCents;
  final double directSharePct;
  final double otaSharePct;

  /// 0-100, see [AuditEngine.profitHealth] for the formula.
  final int profitHealth;

  bool isAddressed(Finding f) => addressedIds.contains(f.id);

  Iterable<Finding> get leaks => findings.where((f) => f.kind == FindingKind.leak);

  List<Finding> get openLeaks => leaks.where((f) => !isAddressed(f)).toList();

  List<Finding> get addressedLeaks => leaks.where(isAddressed).toList();

  int get openLeakCents => openLeaks.fold(0, (s, f) => s + f.monthlyImpactCents);

  int get recoveredCents => addressedLeaks.fold(0, (s, f) => s + f.monthlyImpactCents);

  int openLeakCentsIn(FindingArea area) => openLeaks
      .where((f) => f.area == area)
      .fold(0, (s, f) => s + f.monthlyImpactCents);

  /// Highest-impact open finding of any kind: the "recommended next step".
  Finding? get nextStep {
    for (final f in findings) {
      if (!isAddressed(f)) return f;
    }
    return null;
  }
}
