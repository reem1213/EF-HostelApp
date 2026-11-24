library;

/// All money in the domain is stored as integer cents to avoid float drift.

String _group(int n) {
  final s = n.toString();
  final b = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 == 0) b.write(',');
    b.write(s[i]);
  }
  return b.toString();
}

/// Whole dollars, rounded half-up: 51234 -> "$512", -1550 -> "-$16".
String dollars(int cents) {
  final whole = (cents.abs() + 50) ~/ 100;
  return '${cents < 0 ? '-' : ''}\$${_group(whole)}';
}

/// Exact dollars with cents: 620 -> "$6.20".
String dollarsExact(int cents) {
  final abs = cents.abs();
  final rem = (abs % 100).toString().padLeft(2, '0');
  return '${cents < 0 ? '-' : ''}\$${_group(abs ~/ 100)}.$rem';
}

/// Parses a decimal string such as "120.50" into cents. Returns 0 if unparseable.
int centsFromDecimal(Object? value) {
  if (value == null) return 0;
  final parsed = double.tryParse(value.toString().replaceAll(',', ''));
  if (parsed == null || parsed.isNaN) return 0;
  return (parsed * 100).round();
}
