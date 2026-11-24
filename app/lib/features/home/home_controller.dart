import 'package:flutter/foundation.dart';

import '../../data/audit_repository.dart';
import '../../domain/models.dart';

/// Owns the home-screen state: loading, error, and the latest audit.
class HomeController extends ChangeNotifier {
  HomeController(this._repo);

  final AuditRepository _repo;

  AuditResult? _result;
  Object? _error;
  bool _loading = false;
  bool _busy = false;

  AuditResult? get result => _result;
  Object? get error => _error;
  bool get loading => _loading;

  /// True while a "mark as done" write is in flight.
  bool get busy => _busy;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _result = await _repo.loadAudit();
    } catch (e) {
      _error = e;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Records that the user acted on [finding], then refreshes the audit so
  /// the open/recovered totals and next step update immediately.
  Future<void> markAddressed(Finding finding) async {
    if (_busy) return;
    _busy = true;
    notifyListeners();
    try {
      await _repo.markAddressed(finding.id);
      _result = await _repo.loadAudit();
      _error = null;
    } catch (e) {
      _error = e;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }
}
