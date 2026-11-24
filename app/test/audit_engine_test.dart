import 'package:flutter_test/flutter_test.dart';
import 'package:hostelpulse/domain/audit_engine.dart';
import 'package:hostelpulse/domain/models.dart';

const _bench = Benchmark(
  peerCostPerBedNightCents: 490,
  targetCostPerBedNightCents: 450,
  peerLaundryPerBedNightCents: 145,
  targetOtaCommissionRate: 0.15,
  targetDirectShare: 0.40,
  targetOtaShare: 0.50,
);

const _property = PropertyProfile(id: 'p1', name: 'Test Hostel', beds: 10, benchmark: _bench);

final _now = DateTime(2026, 11, 24);
final _period = DateRange(DateTime(2026, 10, 25), DateTime(2026, 11, 24));
final _prev = DateRange(DateTime(2026, 9, 25), DateTime(2026, 10, 25));

Expense _exp(String id, ExpenseCategory c, int cents, {String merchant = 'Vendor', int day = 1}) =>
    Expense(id: id, date: DateTime(2026, 11, day), amountCents: cents, merchant: merchant, category: c);

Booking _b(String id, Channel c, int revenue, int nights) =>
    Booking(id: id, channel: c, revenueCents: revenue, nights: nights, checkIn: _now);

AuditInput _input({
  required List<Booking> bookings,
  required List<Expense> expenses,
  List<Expense> previous = const [],
  int nights = 40,
}) =>
    AuditInput(
      property: _property,
      period: _period,
      previousPeriod: _prev,
      occupiedBedNights: nights,
      bookings: bookings,
      expenses: expenses,
      previousExpenses: previous,
      syncedAt: _now,
    );

/// A dataset where every rule fires, with arithmetic worked out by hand:
///  - revenue 4000 (direct 1000, OTA 3000), 40 bed-nights
///  - laundry 9000 vs peer 145*40 = 5800            -> laundry-peer 3200
///  - commission 600 vs 15% of 3000 = 450           -> ota-commission 150
///  - two Mailchimp charges of 1000                 -> dupe 1000
///  - supplies 12000 vs 4000 previously (+200%)     -> spike-supplies 8000
///  - direct 25% vs 40% target, shift 600 at 20%    -> direct-share 120 (growth)
AuditInput _allRulesFire() => _input(
      bookings: [_b('d', Channel.direct, 1000, 10), _b('o', Channel.ota, 3000, 30)],
      expenses: [
        _exp('l', ExpenseCategory.laundry, 9000),
        _exp('c', ExpenseCategory.channelCommission, 600, merchant: 'Booking.com'),
        _exp('m1', ExpenseCategory.software, 1000, merchant: 'Mailchimp', day: 2),
        _exp('m2', ExpenseCategory.software, 1000, merchant: 'MailChimp!', day: 9),
        _exp('s', ExpenseCategory.supplies, 12000),
      ],
      previous: [_exp('ps', ExpenseCategory.supplies, 4000)],
    );

void main() {
  group('AuditEngine rules', () {
    test('every rule fires with the hand-computed impact', () {
      final r = AuditEngine.run(_allRulesFire());
      final byId = {for (final f in r.findings) f.id: f};

      expect(byId['laundry-peer']!.monthlyImpactCents, 3200);
      expect(byId['ota-commission']!.monthlyImpactCents, 150);
      expect(byId['dupe-mailchimp']!.monthlyImpactCents, 1000);
      expect(byId['dupe-mailchimp']!.title, 'Duplicate charge: Mailchimp');
      expect(byId['spike-supplies']!.monthlyImpactCents, 8000);
      expect(byId['spike-supplies']!.title, 'Supplies up 200% vs last period');
      expect(byId['direct-share']!.monthlyImpactCents, 120);
      expect(byId['direct-share']!.kind, FindingKind.growth);
    });

    test('findings are sorted by impact, highest first', () {
      final impacts = AuditEngine.run(_allRulesFire()).findings.map((f) => f.monthlyImpactCents).toList();
      final sorted = [...impacts]..sort((a, b) => b.compareTo(a));
      expect(impacts, sorted);
    });

    test('laundry is never flagged as a spike (covered by the peer rule)', () {
      final r = AuditEngine.run(_input(
        bookings: [_b('d', Channel.direct, 2000, 20), _b('o', Channel.ota, 2000, 20)],
        expenses: [_exp('l', ExpenseCategory.laundry, 5000)],
        previous: [_exp('pl', ExpenseCategory.laundry, 1000)],
      ));
      expect(r.findings.any((f) => f.id == 'spike-laundry'), isFalse);
    });

    test('a clean property produces no leaks and no next step', () {
      final r = AuditEngine.run(_input(
        bookings: [_b('d', Channel.direct, 2000, 20), _b('o', Channel.ota, 2000, 20)],
        expenses: [_exp('l', ExpenseCategory.laundry, 5000)],
      ));
      expect(r.findings, isEmpty);
      expect(r.nextStep, isNull);
      expect(r.openLeakCents, 0);
      expect(r.profitHealth, 100);
    });

    test('small category increases below the \$50 floor are ignored', () {
      final r = AuditEngine.run(_input(
        bookings: [_b('d', Channel.direct, 2000, 20), _b('o', Channel.ota, 2000, 20)],
        expenses: [_exp('s', ExpenseCategory.supplies, 4000)],
        previous: [_exp('ps', ExpenseCategory.supplies, 1000)],
      ));
      expect(r.findings.any((f) => f.id == 'spike-supplies'), isFalse);
    });
  });

  group('AuditResult metrics', () {
    test('cost per bed-night, laundry per bed-night and channel shares', () {
      final r = AuditEngine.run(_allRulesFire());
      // operating cost = 9000 + 600 + 2000 + 12000 = 23600 over 40 bed-nights
      expect(r.operatingCostCents, 23600);
      expect(r.costPerBedNightCents, 590);
      expect(r.laundryPerBedNightCents, 225);
      expect(r.directSharePct, closeTo(0.25, 1e-9));
      expect(r.otaSharePct, closeTo(0.75, 1e-9));
    });

    test('profit health is clamped to 0-100', () {
      // Heavy leaks and OTA dependence push the raw score below zero.
      expect(AuditEngine.run(_allRulesFire()).profitHealth, 0);
    });

    test('next step is the highest-impact open finding', () {
      final r = AuditEngine.run(_allRulesFire());
      expect(r.nextStep!.id, 'spike-supplies');
    });
  });

  group('addressing findings', () {
    test('addressed leaks move from open to recovered', () {
      final base = AuditEngine.run(_allRulesFire());
      final after = AuditEngine.withAddressed(base, {'spike-supplies'});

      expect(after.recoveredCents, 8000);
      expect(after.openLeakCents, base.openLeakCents - 8000);
      expect(after.nextStep!.id, 'laundry-peer');
    });

    test('addressing a finding improves profit health', () {
      final base = AuditEngine.run(_allRulesFire());
      final after = AuditEngine.withAddressed(base, {'laundry-peer', 'spike-supplies', 'dupe-mailchimp', 'ota-commission'});
      expect(after.profitHealth, greaterThanOrEqualTo(base.profitHealth));
    });

    test('addressing a growth finding does not count as recovered money', () {
      final base = AuditEngine.run(_allRulesFire());
      final after = AuditEngine.withAddressed(base, {'direct-share'});
      expect(after.recoveredCents, 0);
    });
  });
}
