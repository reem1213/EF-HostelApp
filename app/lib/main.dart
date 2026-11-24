import 'package:material_ui/material_ui.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/theme.dart';
import 'data/audit_repository.dart';
import 'features/home/home_controller.dart';
import 'features/shell/app_shell.dart';
import 'integrations/cloudbeds_connector.dart';
import 'integrations/demo_data.dart';

/// Build-time configuration. Pass with --dart-define, for example:
///   flutter run -d chrome \
///     --dart-define=SUPABASE_URL=https://xyz.supabase.co \
///     --dart-define=SUPABASE_ANON_KEY=... \
///     --dart-define=CLOUDBEDS_PROXY_URL=https://xyz.supabase.co/functions/v1/cloudbeds
/// With none set the app runs on demo data.
class AppConfig {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const cloudbedsProxyUrl = String.fromEnvironment('CLOUDBEDS_PROXY_URL');
  static const cloudbedsPropertyId = String.fromEnvironment('CLOUDBEDS_PROPERTY_ID');

  static bool get hasSupabase => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
  static bool get hasCloudbeds => cloudbedsProxyUrl.isNotEmpty && cloudbedsPropertyId.isNotEmpty;
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  GoogleFonts.config.allowRuntimeFetching = true;

  FindingStore store = MemoryFindingStore();
  if (AppConfig.hasSupabase) {
    await Supabase.initialize(url: AppConfig.supabaseUrl, publishableKey: AppConfig.supabaseAnonKey);
    store = SupabaseFindingStore(Supabase.instance.client);
  }

  final repo = AuditRepository(
    property: DemoProperty.profile,
    pms: AppConfig.hasCloudbeds
        ? CloudbedsConnector(
            propertyId: AppConfig.cloudbedsPropertyId,
            baseUrl: Uri.parse(AppConfig.cloudbedsProxyUrl),
            headers: {
              'Authorization': 'Bearer ${AppConfig.supabaseAnonKey}',
              'apikey': AppConfig.supabaseAnonKey,
            },
            client: http.Client(),
          )
        : const DemoPms(),
    bank: const DemoBankFeed(),
    store: store,
  );

  runApp(HostelPulseApp(homeController: HomeController(repo)));
}

class HostelPulseApp extends StatelessWidget {
  const HostelPulseApp({super.key, required this.homeController});

  final HomeController homeController;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'HostelPulse',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(),
      home: AppShell(homeController: homeController),
    );
  }
}
