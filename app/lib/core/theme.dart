import 'package:material_ui/material_ui.dart';
import 'package:google_fonts/google_fonts.dart';

/// Design tokens taken from the FlutterFlow screens (Roam Quarter Hostel).
class AppColors {
  AppColors._();
  static const bg = Color(0xFFF4F3EF);
  static const surface = Colors.white;
  static const ink = Color(0xFF1B1B1A);
  static const muted = Color(0xFF7B7B77);
  static const hairline = Color(0xFFE6E4DE);
  static const dark = Color(0xFF13232B);
  static const darkText = Color(0xFFD9E3E6);
  static const gold = Color(0xFFC9A44C);
  static const teal = Color(0xFF1F5E5A);
  static const green = Color(0xFF2E7D57);
  static const red = Color(0xFFB4442F);
  static const amber = Color(0xFFA7782A);
  static const amberSoft = Color(0xFFF3E7D2);
  static const tealSoft = Color(0xFFDDE9E6);
}

ThemeData buildAppTheme() {
  final body = GoogleFonts.outfitTextTheme();
  final scheme = ColorScheme.fromSeed(
    seedColor: AppColors.teal,
    surface: AppColors.bg,
    primary: AppColors.teal,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: AppColors.bg,
    textTheme: body.apply(bodyColor: AppColors.ink, displayColor: AppColors.ink),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.bg,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: true,
      titleTextStyle: body.titleMedium?.copyWith(fontWeight: FontWeight.w600, color: AppColors.ink),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surface,
      indicatorColor: AppColors.tealSoft,
      labelTextStyle: WidgetStatePropertyAll(
        body.labelSmall?.copyWith(fontWeight: FontWeight.w500),
      ),
    ),
  );
}

/// Serif display style used for hero numbers and page titles.
TextStyle displaySerif({double size = 48, Color color = AppColors.gold, FontWeight weight = FontWeight.w500}) =>
    GoogleFonts.cormorantGaramond(fontSize: size, color: color, fontWeight: weight, height: 1.0);
