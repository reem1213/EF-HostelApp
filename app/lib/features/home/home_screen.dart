import 'package:material_ui/material_ui.dart';

import '../../core/money.dart';
import '../../core/theme.dart';
import '../../domain/models.dart';
import 'home_controller.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.controller});

  final HomeController controller;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    widget.controller.load();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final c = widget.controller;
        final result = c.result;
        return RefreshIndicator(
          onRefresh: c.load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (result == null && c.loading)
                const Padding(
                  padding: EdgeInsets.only(top: 120),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (result == null)
                _ErrorState(error: c.error, onRetry: c.load)
              else ...[
                _Header(name: result.property.name, syncedAt: result.syncedAt),
                const SizedBox(height: 16),
                _LeakHero(result: result),
                const SizedBox(height: 22),
                const _SectionLabel('Audit breakdown'),
                const SizedBox(height: 10),
                _BreakdownRow(result: result),
                const SizedBox(height: 22),
                const _SectionLabel('Recommended next step'),
                const SizedBox(height: 10),
                _NextStepCard(
                  result: result,
                  busy: c.busy,
                  onMarkDone: (f) => c.markAddressed(f),
                ),
                const SizedBox(height: 22),
                _PulseCard(result: result),
                if (c.error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    'Last action failed: ${c.error}',
                    style: const TextStyle(color: AppColors.red, fontSize: 12),
                  ),
                ],
              ],
            ],
          ),
        );
      },
    );
  }
}

// ---- header -------------------------------------------------------------

class _Header extends StatelessWidget {
  const _Header({required this.name, required this.syncedAt});
  final String name;
  final DateTime syncedAt;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(name, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
        const SizedBox(height: 2),
        Text(
          'Synced ${_ago(syncedAt)}',
          style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
        ),
      ],
    );
  }

  static String _ago(DateTime t) {
    final d = DateTime.now().difference(t);
    if (d.inMinutes < 1) return 'just now';
    if (d.inMinutes < 60) return '${d.inMinutes} min ago';
    if (d.inHours < 24) return '${d.inHours} h ago';
    return '${d.inDays} d ago';
  }
}

// ---- hero ---------------------------------------------------------------

class _LeakHero extends StatelessWidget {
  const _LeakHero({required this.result});
  final AuditResult result;

  @override
  Widget build(BuildContext context) {
    final open = result.openLeaks.length;
    final recovered = result.addressedLeaks;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.dark,
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Money leaks found',
                    style: TextStyle(color: AppColors.darkText, fontSize: 15)),
              ),
              _Pill(
                label: '$open unaddressed',
                color: AppColors.gold,
                textColor: AppColors.darkText,
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(dollars(result.openLeakCents), style: displaySerif(size: 60)),
                ),
              ),
              const SizedBox(width: 6),
              const Text('/month',
                  style: TextStyle(color: AppColors.darkText, fontSize: 15)),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            recovered.isEmpty
                ? 'Nothing recovered yet. Mark a finding done to track it here.'
                : '${dollars(result.recoveredCents)}/mo recovered from '
                    '${recovered.first.title.toLowerCase()}',
            style: const TextStyle(color: Color(0xFF8FD3A8), fontSize: 13.5, height: 1.35),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.color, required this.textColor});
  final String label;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: textColor, fontSize: 12)),
        ],
      ),
    );
  }
}

// ---- breakdown ----------------------------------------------------------

class _BreakdownRow extends StatelessWidget {
  const _BreakdownRow({required this.result});
  final AuditResult result;

  @override
  Widget build(BuildContext context) {
    final moneyLeak = result.openLeakCentsIn(FindingArea.money);
    final costLeak = result.openLeakCentsIn(FindingArea.costs);
    return Row(
      children: [
        Expanded(
          child: _BreakdownCard(
            icon: Icons.account_balance_wallet_outlined,
            title: 'Money',
            subtitle: 'Channels & SaaS',
            value: '${dollars(moneyLeak)}/mo leak',
            valueColor: AppColors.amber,
            flagged: moneyLeak > 0,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _BreakdownCard(
            icon: Icons.pie_chart_outline,
            title: 'Costs',
            subtitle: 'Per occupied bed',
            value: '${dollarsExact(result.costPerBedNightCents)} / bed',
            valueColor: AppColors.amber,
            flagged: costLeak > 0,
          ),
        ),
      ],
    );
  }
}

class _BreakdownCard extends StatelessWidget {
  const _BreakdownCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.valueColor,
    required this.flagged,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final String value;
  final Color valueColor;
  final bool flagged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: AppColors.teal, size: 22),
              const Spacer(),
              if (flagged)
                Container(
                  width: 7,
                  height: 7,
                  decoration: const BoxDecoration(color: AppColors.amber, shape: BoxShape.circle),
                ),
            ],
          ),
          const SizedBox(height: 14),
          Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(subtitle, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          const SizedBox(height: 10),
          Text(value,
              style: TextStyle(color: valueColor, fontSize: 13.5, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ---- next step ----------------------------------------------------------

class _NextStepCard extends StatelessWidget {
  const _NextStepCard({required this.result, required this.busy, required this.onMarkDone});
  final AuditResult result;
  final bool busy;
  final ValueChanged<Finding> onMarkDone;

  @override
  Widget build(BuildContext context) {
    final f = result.nextStep;
    if (f == null) {
      return Container(
        padding: const EdgeInsets.all(18),
        decoration: _cardDecoration(),
        child: const Text("You're all caught up. New findings appear after the next sync."),
      );
    }
    final isGrowth = f.kind == FindingKind.growth;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => _showDetail(context, f),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: _cardDecoration(),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(
                color: AppColors.tealSoft,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                isGrowth ? Icons.north_east : Icons.warning_amber_rounded,
                color: AppColors.teal,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(f.title,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, height: 1.25)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text(
                        '${isGrowth ? '+' : ''}${dollars(f.monthlyImpactCents)}/mo '
                        '${isGrowth ? 'impact' : 'leak'}',
                        style: TextStyle(
                          color: isGrowth ? AppColors.green : AppColors.amber,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 8),
                      _SeverityChip(severity: f.severity),
                    ],
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.muted),
          ],
        ),
      ),
    );
  }

  void _showDetail(BuildContext context, Finding f) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(f.title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(f.detail, style: const TextStyle(color: AppColors.muted, height: 1.4)),
            const SizedBox(height: 14),
            Text(
              '${dollars(f.monthlyImpactCents)} per month',
              style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.amber),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.teal,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                onPressed: busy
                    ? null
                    : () {
                        Navigator.of(ctx).pop();
                        onMarkDone(f);
                      },
                child: const Text('Mark as done'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SeverityChip extends StatelessWidget {
  const _SeverityChip({required this.severity});
  final Severity severity;

  @override
  Widget build(BuildContext context) {
    final label = severity.name.toUpperCase();
    final color = switch (severity) {
      Severity.high => AppColors.red,
      Severity.medium => AppColors.amber,
      Severity.low => AppColors.muted,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label,
          style: TextStyle(color: color, fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.4)),
    );
  }
}

// ---- property pulse -----------------------------------------------------

class _PulseCard extends StatelessWidget {
  const _PulseCard({required this.result});
  final AuditResult result;

  @override
  Widget build(BuildContext context) {
    final bench = result.property.benchmark;
    final peer = bench.peerCostPerBedNightCents;
    final costGap = result.costPerBedNightCents - peer;
    final directPct = (result.directSharePct * 100).round();
    final otaPct = (result.otaSharePct * 100).round();
    final health = result.profitHealth;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Property pulse', style: TextStyle(color: AppColors.muted, fontSize: 13)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _PulseTile(
                  label: 'Direct split',
                  value: '$directPct%',
                  delta: '$otaPct% OTA',
                  deltaColor: otaPct > (bench.targetOtaShare * 100) ? AppColors.red : AppColors.green,
                  deltaIcon: Icons.south_east,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _PulseTile(
                  label: 'Bed cost',
                  value: dollarsExact(result.costPerBedNightCents),
                  delta: '${costGap >= 0 ? '+' : '-'}${dollarsExact(costGap.abs())} vs peer',
                  deltaColor: costGap > 0 ? AppColors.red : AppColors.green,
                  deltaIcon: costGap > 0 ? Icons.trending_up : Icons.trending_down,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _PulseTile(
                  label: 'Profit health',
                  value: '$health',
                  delta: 'Audited',
                  deltaColor: AppColors.green,
                  deltaIcon: Icons.trending_up,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _PulseTile extends StatelessWidget {
  const _PulseTile({
    required this.label,
    required this.value,
    required this.delta,
    required this.deltaColor,
    required this.deltaIcon,
  });

  final String label;
  final String value;
  final String delta;
  final Color deltaColor;
  final IconData deltaIcon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.hairline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 11.5)),
          const SizedBox(height: 6),
          Text(value, style: displaySerif(size: 26, color: AppColors.ink, weight: FontWeight.w600)),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(deltaIcon, size: 12, color: deltaColor),
              const SizedBox(width: 3),
              Expanded(
                child: Text(delta,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: deltaColor, fontSize: 10.5, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---- shared -------------------------------------------------------------

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(color: AppColors.muted, fontSize: 14, fontWeight: FontWeight.w500),
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error, required this.onRetry});
  final Object? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 100),
      child: Column(
        children: [
          const Icon(Icons.cloud_off_outlined, size: 40, color: AppColors.muted),
          const SizedBox(height: 12),
          const Text("Couldn't load your audit"),
          const SizedBox(height: 4),
          Text('${error ?? ''}', textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted, fontSize: 12)),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
  }
}

BoxDecoration _cardDecoration() => BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: AppColors.hairline),
    );
