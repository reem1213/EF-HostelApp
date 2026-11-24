import '../domain/models.dart';
import 'connectors.dart';

/// Demo data shaped like the Roam Quarter Hostel design. Used when no
/// integrations are configured, so the app runs end to end out of the box.
class DemoProperty {
  static const profile = PropertyProfile(
    id: 'roam-quarter',
    name: 'Roam Quarter Hostel',
    beds: 48,
    benchmark: Benchmark(
      peerCostPerBedNightCents: 490,
      targetCostPerBedNightCents: 450,
      peerLaundryPerBedNightCents: 145,
      targetOtaCommissionRate: 0.15,
      targetDirectShare: 0.40,
      targetOtaShare: 0.50,
    ),
  );
}

class DemoPms implements PmsConnector {
  const DemoPms();

  @override
  String get name => 'Cloudbeds PMS (demo)';

  @override
  Future<PmsSnapshot> fetchPeriod(DateRange period) async {
    // 48 beds at 78% occupancy over the period.
    final targetNights = (DemoProperty.profile.beds * period.days * 0.78).round();
    final bookings = <Booking>[];
    var nights = 0;
    var i = 0;
    while (nights < targetNights) {
      final n = 1 + i % 3;
      // 26% of stays come direct, the rest through OTAs.
      final channel = i % 100 < 26 ? Channel.direct : Channel.ota;
      bookings.add(Booking(
        id: 'demo-$i',
        channel: channel,
        nights: n,
        revenueCents: n * 2800,
        checkIn: period.start.add(Duration(days: i % (period.days == 0 ? 1 : period.days))),
      ));
      nights += n;
      i++;
    }
    return PmsSnapshot(bookings: bookings, occupiedBedNights: nights);
  }
}

/// Demo bank feed. Serves the "current" dataset for the live window and the
/// "previous" dataset for any window that ends before it.
class DemoBankFeed implements BankFeedConnector {
  const DemoBankFeed({this.windowDays = 30, this.now = DateTime.now});

  final int windowDays;
  final DateTime Function() now;

  @override
  String get name => 'Bank & cards (demo)';

  @override
  Future<List<Expense>> fetchExpenses(DateRange period) async {
    final today = now();
    final currentStart = DateTime(today.year, today.month, today.day)
        .add(const Duration(days: 1))
        .subtract(Duration(days: windowDays));
    if (period.start.isBefore(currentStart)) {
      return demoPreviousExpenses(period.start);
    }
    return demoExpenses(period.start, idPrefix: 'cur');
  }
}

List<Expense> demoExpenses(DateTime start, {required String idPrefix}) {
  Expense e(int n, String merchant, ExpenseCategory c, int cents) => Expense(
        id: '$idPrefix-$n',
        date: start.add(Duration(days: 3 * n)),
        amountCents: cents,
        merchant: merchant,
        category: c,
      );
  return [
    e(1, 'Clean Linen Co', ExpenseCategory.laundry, 61200),
    e(2, 'Clean Linen Co', ExpenseCategory.laundry, 58900),
    e(3, 'Clean Linen Co', ExpenseCategory.laundry, 59400),
    e(4, 'Clean Linen Co', ExpenseCategory.laundry, 56300),
    e(5, 'City Power', ExpenseCategory.utilities, 120000),
    e(6, 'Boiler Gas', ExpenseCategory.utilities, 120000),
    e(7, 'Front desk payroll', ExpenseCategory.staff, 110000),
    e(8, 'Housekeeping', ExpenseCategory.staff, 60000),
    e(9, 'Supply Depot', ExpenseCategory.supplies, 35000),
    e(10, 'Supply Depot', ExpenseCategory.supplies, 27000),
    e(11, 'Cloudbeds', ExpenseCategory.software, 25000),
    e(12, 'Mailchimp', ExpenseCategory.software, 4900),
    e(13, 'Mailchimp', ExpenseCategory.software, 4900),
    e(14, 'Booking.com', ExpenseCategory.channelCommission, 200000),
    e(15, 'Hostelworld', ExpenseCategory.channelCommission, 183900),
  ];
}

List<Expense> demoPreviousExpenses(DateTime start) => [
      Expense(id: 'prev-1', date: start, amountCents: 200000, merchant: 'Clean Linen Co', category: ExpenseCategory.laundry),
      Expense(id: 'prev-2', date: start, amountCents: 230000, merchant: 'City Power', category: ExpenseCategory.utilities),
      Expense(id: 'prev-3', date: start, amountCents: 168000, merchant: 'Front desk payroll', category: ExpenseCategory.staff),
      Expense(id: 'prev-4', date: start, amountCents: 38000, merchant: 'Supply Depot', category: ExpenseCategory.supplies),
      Expense(id: 'prev-5', date: start, amountCents: 30000, merchant: 'Cloudbeds', category: ExpenseCategory.software),
      Expense(id: 'prev-6', date: start, amountCents: 350000, merchant: 'Booking.com', category: ExpenseCategory.channelCommission),
    ];
