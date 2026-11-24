import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/money.dart';
import '../domain/models.dart';
import 'connectors.dart';

/// Cloudbeds PMS connector (API v1.2).
///
/// Security: Cloudbeds credentials must NOT ship inside the Flutter app, since
/// anyone can extract them from a built app. Point [baseUrl] at your own
/// backend (for example a Supabase Edge Function) that holds the token and
/// forwards the call, and pass that backend's auth in [headers].
///
/// Assumptions to verify against the live Cloudbeds reference before go-live:
///  - the reservations endpoint and its date/paging parameters below;
///  - that one reservation equals one bed-stay (true for most dorm bookings).
class CloudbedsConnector implements PmsConnector {
  CloudbedsConnector({
    required this.propertyId,
    required this.baseUrl,
    required this.headers,
    http.Client? client,
    this.pageSize = 100,
  }) : _client = client ?? http.Client();

  final String propertyId;

  /// Backend route that proxies Cloudbeds, e.g. https://example.com/cloudbeds
  /// (the connector appends `/getReservations`).
  final Uri baseUrl;
  final Map<String, String> headers;
  final int pageSize;
  final http.Client _client;

  @override
  String get name => 'Cloudbeds PMS';

  static const _countedStatuses = {'confirmed', 'checked_in', 'checked_out'};

  @override
  Future<PmsSnapshot> fetchPeriod(DateRange period) async {
    final bookings = <Booking>[];
    var page = 1;
    while (true) {
      final uri = baseUrl.replace(
        path: '${baseUrl.path.replaceAll(RegExp(r'/$'), '')}/getReservations',
        queryParameters: {
          'propertyID': propertyId,
          'checkInFrom': _iso(period.start),
          'checkInTo': _iso(period.end.subtract(const Duration(days: 1))),
          'pageNumber': '$page',
          'pageSize': '$pageSize',
        },
      );
      final res = await _client.get(uri, headers: headers);
      if (res.statusCode != 200) {
        throw IntegrationException(name, 'HTTP ${res.statusCode} while reading reservations');
      }
      final rows = parseReservationsPage(jsonDecode(res.body));
      bookings.addAll(rows);
      if (rows.length < pageSize) break; // last page
      page++;
      if (page > 200) {
        throw IntegrationException(name, 'Too many pages; narrow the period');
      }
    }
    return PmsSnapshot(
      bookings: bookings,
      occupiedBedNights: bookings.fold(0, (s, b) => s + b.nights),
    );
  }

  /// Parses a Cloudbeds-style envelope `{ "success": true, "data": [ ... ] }`.
  /// Exposed for tests. Cancelled and no-show reservations are dropped.
  static List<Booking> parseReservationsPage(Object? json) {
    if (json is! Map<String, dynamic>) {
      throw const IntegrationException('Cloudbeds PMS', 'Unexpected response shape');
    }
    if (json['success'] == false) {
      throw IntegrationException('Cloudbeds PMS', '${json['message'] ?? 'request failed'}');
    }
    final data = json['data'];
    if (data is! List) return const [];
    final out = <Booking>[];
    for (final raw in data) {
      if (raw is! Map<String, dynamic>) continue;
      final booking = parseReservation(raw);
      if (booking != null) out.add(booking);
    }
    return out;
  }

  /// Maps one reservation. Returns null when it should not count as occupancy.
  static Booking? parseReservation(Map<String, dynamic> r) {
    final status = (r['status'] ?? '').toString().toLowerCase();
    if (!_countedStatuses.contains(status)) return null;

    final checkIn = DateTime.tryParse('${r['checkIn']}');
    final checkOut = DateTime.tryParse('${r['checkOut']}');
    if (checkIn == null || checkOut == null) return null;
    final nights = checkOut.difference(checkIn).inDays;
    if (nights <= 0) return null;

    return Booking(
      id: (r['reservationID'] ?? r['reservationId'] ?? '${r['checkIn']}-${r['checkOut']}').toString(),
      channel: channelFromSource('${r['sourceName'] ?? ''}'),
      revenueCents: centsFromDecimal(r['total'] ?? r['grandTotal']),
      nights: nights,
      checkIn: checkIn,
    );
  }

  /// Maps Cloudbeds' source name to a sales channel.
  static Channel channelFromSource(String source) {
    final s = source.toLowerCase();
    const ota = ['booking.com', 'expedia', 'airbnb', 'hostelworld', 'agoda', 'hotels.com'];
    if (ota.any(s.contains)) return Channel.ota;
    const direct = ['direct', 'website', 'front desk', 'walk', 'phone', 'email', 'hostel'];
    if (s.isEmpty) return Channel.other;
    if (direct.any(s.contains)) return Channel.direct;
    return Channel.other;
  }

  static String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  void close() => _client.close();
}
