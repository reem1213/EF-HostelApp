import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:hostelpulse/core/money.dart';
import 'package:hostelpulse/data/audit_repository.dart';
import 'package:hostelpulse/domain/models.dart';
import 'package:hostelpulse/integrations/cloudbeds_connector.dart';
import 'package:hostelpulse/integrations/connectors.dart';
import 'package:hostelpulse/integrations/demo_data.dart';

void main() {
  group('money helpers', () {
    test('whole dollars round half-up and group thousands', () {
      expect(dollars(51234), '\$512');
      expect(dollars(51250), '\$513');
      expect(dollars(-1550), '-\$16');
      expect(dollars(123456789), '\$1,234,568');
    });

    test('exact dollars always show cents', () {
      expect(dollarsExact(620), '\$6.20');
      expect(dollarsExact(5), '\$0.05');
    });

    test('decimal strings parse to cents, bad input is zero', () {
      expect(centsFromDecimal('120.50'), 12050);
      expect(centsFromDecimal(45), 4500);
      expect(centsFromDecimal('1,200.00'), 120000);
      expect(centsFromDecimal('abc'), 0);
      expect(centsFromDecimal(null), 0);
    });
  });

  group('Cloudbeds parsing', () {
    final fixture = {
      'success': true,
      'data': [
        {
          'reservationID': 'R1',
          'status': 'confirmed',
          'checkIn': '2026-11-01',
          'checkOut': '2026-11-04',
          'sourceName': 'Booking.com',
          'total': '120.50',
        },
        {
          'reservationID': 'R2',
          'status': 'checked_out',
          'checkIn': '2026-11-02',
          'checkOut': '2026-11-03',
          'sourceName': 'Hostel Website',
          'total': 45,
        },
        {
          'reservationID': 'R3',
          'status': 'canceled',
          'checkIn': '2026-11-05',
          'checkOut': '2026-11-06',
          'sourceName': 'Expedia',
          'total': '30',
        },
        {
          'reservationID': 'R4',
          'status': 'confirmed',
          'checkIn': '2026-11-07',
          'checkOut': '2026-11-07',
          'sourceName': 'Direct',
          'total': '10',
        },
      ],
    };

    test('keeps counted statuses, drops cancelled and zero-night stays', () {
      final rows = CloudbedsConnector.parseReservationsPage(fixture);
      expect(rows.map((b) => b.id), ['R1', 'R2']);
    });

    test('maps nights, revenue and channel', () {
      final rows = CloudbedsConnector.parseReservationsPage(fixture);
      final r1 = rows[0];
      expect(r1.nights, 3);
      expect(r1.revenueCents, 12050);
      expect(r1.channel, Channel.ota);

      final r2 = rows[1];
      expect(r2.nights, 1);
      expect(r2.revenueCents, 4500);
      expect(r2.channel, Channel.direct);
    });

    test('a failed envelope throws an IntegrationException', () {
      expect(
        () => CloudbedsConnector.parseReservationsPage({'success': false, 'message': 'bad token'}),
        throwsA(isA<IntegrationException>()),
      );
    });

    test('channel source names map to channels', () {
      expect(CloudbedsConnector.channelFromSource('Hostelworld'), Channel.ota);
      expect(CloudbedsConnector.channelFromSource('Front Desk'), Channel.direct);
      expect(CloudbedsConnector.channelFromSource('Travel agent X'), Channel.other);
      expect(CloudbedsConnector.channelFromSource(''), Channel.other);
    });

    test('fetchPeriod pages until a short page and sums occupancy', () async {
      final calls = <Uri>[];
      final client = MockClient((req) async {
        calls.add(req.url);
        final page = int.parse(req.url.queryParameters['pageNumber']!);
        final data = page == 1
            ? [
                {'reservationID': 'A', 'status': 'confirmed', 'checkIn': '2026-11-01', 'checkOut': '2026-11-03', 'sourceName': 'Booking.com', 'total': '50'},
                {'reservationID': 'B', 'status': 'confirmed', 'checkIn': '2026-11-02', 'checkOut': '2026-11-04', 'sourceName': 'Direct', 'total': '60'},
              ]
            : [
                {'reservationID': 'C', 'status': 'confirmed', 'checkIn': '2026-11-03', 'checkOut': '2026-11-04', 'sourceName': 'Direct', 'total': '20'},
              ];
        return http.Response(jsonEncode({'success': true, 'data': data}), 200);
      });

      final connector = CloudbedsConnector(
        propertyId: 'P',
        baseUrl: Uri.parse('https://example.com/cloudbeds'),
        headers: const {'Authorization': 'Bearer x'},
        client: client,
        pageSize: 2,
      );
      final snap = await connector.fetchPeriod(DateRange(DateTime(2026, 11, 1), DateTime(2026, 12, 1)));

      expect(calls, hasLength(2));
      expect(calls.first.path, '/cloudbeds/getReservations');
      expect(calls.first.queryParameters['propertyID'], 'P');
      expect(calls.first.queryParameters['checkInFrom'], '2026-11-01');
      expect(calls.first.queryParameters['checkInTo'], '2026-11-30');
      expect(snap.bookings, hasLength(3));
      expect(snap.occupiedBedNights, 2 + 2 + 1);
    });

    test('non-200 responses become IntegrationException', () async {
      final connector = CloudbedsConnector(
        propertyId: 'P',
        baseUrl: Uri.parse('https://example.com/cloudbeds'),
        headers: const {},
        client: MockClient((_) async => http.Response('nope', 401)),
      );
      expect(
        () => connector.fetchPeriod(DateRange(DateTime(2026, 11, 1), DateTime(2026, 11, 8))),
        throwsA(isA<IntegrationException>()),
      );
    });
  });

  group('demo pipeline', () {
    final now = DateTime(2026, 11, 24, 9);

    test('the demo audit surfaces the expected findings', () async {
      final repo = AuditRepository.demo(now: () => now);
      final r = await repo.loadAudit();
      final ids = r.findings.map((f) => f.id).toSet();

      expect(ids, containsAll(['laundry-peer', 'ota-commission', 'dupe-mailchimp', 'spike-supplies', 'direct-share']));
      expect(r.occupiedBedNights, 1123); // 48 beds * 30 days * 78%
      expect(r.findings.firstWhere((f) => f.id == 'laundry-peer').monthlyImpactCents, 235800 - 145 * 1123);
      expect(r.findings.firstWhere((f) => f.id == 'dupe-mailchimp').monthlyImpactCents, 4900);
      expect(r.findings.firstWhere((f) => f.id == 'spike-supplies').monthlyImpactCents, 24000);
    });

    test('marking a finding done persists it and moves it to recovered', () async {
      final store = MemoryFindingStore();
      final repo = AuditRepository.demo(store: store, now: () => now);

      await repo.markAddressed('spike-supplies');
      final r = await repo.loadAudit();

      expect(r.addressedIds, {'spike-supplies'});
      expect(r.recoveredCents, 24000);
      expect(r.nextStep!.id, isNot('spike-supplies'));
    });

    test('demo bank feed serves the previous dataset for the earlier window', () async {
      const feed = DemoBankFeed();
      final repo = AuditRepository.demo(now: () => now);
      final cur = repo.currentWindow();
      final prev = repo.previousWindow();
      final curExp = await DemoBankFeed(now: () => now).fetchExpenses(cur);
      final prevExp = await feed.fetchExpenses(prev);
      expect(curExp.length, isNot(prevExp.length));
    });
  });
}
