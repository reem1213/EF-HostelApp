import 'package:material_ui/material_ui.dart';

import '../common/coming_soon.dart';
import '../home/home_controller.dart';
import '../home/home_screen.dart';

/// Bottom-navigation shell matching the FlutterFlow design:
/// Home, Money, Costs, Reports, More. Only Home is built out for now.
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.homeController});

  final HomeController homeController;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        top: false,
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: IndexedStack(
              index: _index,
              children: [
                HomeScreen(controller: widget.homeController),
                const ComingSoonScreen(title: 'Money', summary: 'Leaks by channel, SaaS and bank feeds.'),
                const ComingSoonScreen(title: 'Costs', summary: 'Cost per occupied bed and its breakdown.'),
                const ComingSoonScreen(title: 'Reports', summary: 'Monthly profit reports, built from your forms.'),
                const ComingSoonScreen(title: 'More', summary: 'Plan, connections and shortcuts.'),
              ],
            ),
          ),
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(
              icon: Icon(Icons.account_balance_wallet_outlined),
              selectedIcon: Icon(Icons.account_balance_wallet),
              label: 'Money'),
          NavigationDestination(
              icon: Icon(Icons.pie_chart_outline), selectedIcon: Icon(Icons.pie_chart), label: 'Costs'),
          NavigationDestination(
              icon: Icon(Icons.bar_chart_outlined), selectedIcon: Icon(Icons.bar_chart), label: 'Reports'),
          NavigationDestination(
              icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'More'),
        ],
      ),
    );
  }

  static const _titles = ['Home', 'Money', 'Costs', 'Reports', 'More'];
}
