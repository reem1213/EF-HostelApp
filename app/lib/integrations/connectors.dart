import '../domain/models.dart';

/// Thrown when an upstream system cannot be read. The message is safe to show.
class IntegrationException implements Exception {
  const IntegrationException(this.source, this.message);
  final String source;
  final String message;

  @override
  String toString() => '$source: $message';
}

/// What a property-management system gives us for one period.
class PmsSnapshot {
  const PmsSnapshot({required this.bookings, required this.occupiedBedNights});
  final List<Booking> bookings;
  final int occupiedBedNights;
}

/// Reads bookings and occupancy from a property-management system (PMS).
abstract class PmsConnector {
  String get name;
  Future<PmsSnapshot> fetchPeriod(DateRange period);
}

/// Reads operating expenses from bank and card feeds.
abstract class BankFeedConnector {
  String get name;
  Future<List<Expense>> fetchExpenses(DateRange period);
}
