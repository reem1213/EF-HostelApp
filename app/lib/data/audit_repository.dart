import 'package:supabase_flutter/supabase_flutter.dart';

import '../domain/audit_engine.dart';
import '../domain/models.dart';
import '../integrations/connectors.dart';
import '../integrations/demo_data.dart';

/// Remembers which findings the user has acted on.
abstract class FindingStore {
  Future<Set<String>> addressedIds(String propertyId);
  Future<void> markAddressed(String propertyId, String findingId);
}

class MemoryFindingStore implements FindingStore {
  final Map<String, Set<String>> _byProperty = {};

  @override
  Future<Set<String>> addressedIds(String propertyId) async =>
      Set.of(_byProperty[propertyId] ?? const <String>{});

  @override
  Future<void> markAddressed(String propertyId, String findingId) async {
    _byProperty.putIfAbsent(propertyId, () => <String>{}).add(findingId);
  }
}

/// Stores addressed findings in Supabase table `finding_actions`
/// (see supabase/schema.sql).
class SupabaseFindingStore implements FindingStore {
  SupabaseFindingStore(this._client);
  final SupabaseClient _client;

  static const _table = 'finding_actions';

  @override
  Future<Set<String>> addressedIds(String propertyId) async {
    final rows = await _client
        .from(_table)
        .select('finding_id')
        .eq('property_id', propertyId);
    return {for (final r in rows) r['finding_id'] as String};
  }

  @override
  Future<void> markAddressed(String propertyId, String findingId) async {
    await _client.from(_table).upsert(
      {'property_id': propertyId, 'finding_id': findingId},
      onConflict: 'property_id,finding_id',
    );
  }
}

/// Builds the home-screen audit from live connectors, then applies the user's
/// progress from the [FindingStore].
class AuditRepository {
  AuditRepository({
    required this.property,
    required this.pms,
    required this.bank,
    required this.store,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final PropertyProfile property;
  final PmsConnector pms;
  final BankFeedConnector bank;
  final FindingStore store;
  final DateTime Function() _now;

  /// Audit window: the last 30 days, compared with the 30 days before that.
  static const windowDays = 30;

  DateRange currentWindow() {
    final today = _now();
    final end = DateTime(today.year, today.month, today.day).add(const Duration(days: 1));
    return DateRange(end.subtract(const Duration(days: windowDays)), end);
  }

  DateRange previousWindow() {
    final cur = currentWindow();
    return DateRange(cur.start.subtract(const Duration(days: windowDays)), cur.start);
  }

  Future<AuditResult> loadAudit() async {
    final period = currentWindow();
    final previous = previousWindow();

    final pmsSnap = await pms.fetchPeriod(period);
    final expenses = await bank.fetchExpenses(period);
    final previousExpenses = await bank.fetchExpenses(previous);

    final input = AuditInput(
      property: property,
      period: period,
      previousPeriod: previous,
      occupiedBedNights: pmsSnap.occupiedBedNights,
      bookings: pmsSnap.bookings,
      expenses: expenses,
      previousExpenses: previousExpenses,
      syncedAt: _now(),
    );
    final addressed = await store.addressedIds(property.id);
    return AuditEngine.run(input, addressed: addressed);
  }

  Future<void> markAddressed(String findingId) =>
      store.markAddressed(property.id, findingId);

  /// Demo wiring: no credentials needed, data shaped like the design.
  factory AuditRepository.demo({FindingStore? store, DateTime Function()? now}) {
    return AuditRepository(
      property: DemoProperty.profile,
      pms: const DemoPms(),
      bank: DemoBankFeed(now: now ?? DateTime.now),
      store: store ?? MemoryFindingStore(),
      now: now,
    );
  }
}
