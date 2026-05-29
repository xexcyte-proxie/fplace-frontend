/// Application configuration for Mappedin and hosted AR.
///
/// Defaults use Mappedin's **free demo mall** and shared demo API credentials
/// (no Pro account required). See:
/// https://developer.mappedin.com/docs/demo-keys-and-maps
///
/// When you upgrade to Pro, override at build time:
///   flutter run \
///     --dart-define=MAPPEDIN_KEY=your_key \
///     --dart-define=MAPPEDIN_SECRET=your_secret \
///     --dart-define=MAPPEDIN_MAP_ID=your_map_id
class AppConfig {
  AppConfig._();

  /// Mappedin free-tier demo API key (Maker maps).
  static const String mappedinDemoKey = 'mik_yeBk0Vf0nNJtpesfu560e07e5';

  /// Mappedin free-tier demo API secret.
  static const String mappedinDemoSecret =
      'mis_2g9ST8ZcSFb5R9fPnsvYhrX3RyRwPtDGbMGweCYKEq385431022';

  /// Demo Mall map id (`65c0ff7430b94e3fabd5bb8c`).
  static const String mappedinDemoMallMapId = '65c0ff7430b94e3fabd5bb8c';

  static const String mappedinDemoVenueName = 'Demo Mall';

  /// Active Mappedin API key — defaults to [mappedinDemoKey].
  static const String mappedinKey = String.fromEnvironment(
    'MAPPEDIN_KEY',
    defaultValue: mappedinDemoKey,
  );

  /// Active Mappedin API secret — defaults to [mappedinDemoSecret].
  static const String mappedinSecret = String.fromEnvironment(
    'MAPPEDIN_SECRET',
    defaultValue: mappedinDemoSecret,
  );

  /// Active map id — defaults to [mappedinDemoMallMapId].
  static const String mappedinMapId = String.fromEnvironment(
    'MAPPEDIN_MAP_ID',
    defaultValue: mappedinDemoMallMapId,
  );

  /// True when running with the public demo credentials (no custom keys).
  static bool get isUsingMappedinDemo =>
      mappedinKey == mappedinDemoKey &&
      mappedinSecret == mappedinDemoSecret &&
      mappedinMapId == mappedinDemoMallMapId;

  static const String _eighthWallArUrlRaw = String.fromEnvironment(
    'EIGHTH_WALL_AR_URL',
    defaultValue: 'https://fplaces-test.netlify.app/',
  );

  /// Hosted 8th Wall WebAR page URL loaded inside Flutter WebView.
  static String get eighthWallArUrl => _normalizeArUrl(_eighthWallArUrlRaw);

  static bool get eighthWallArUrlWasNormalized =>
      _normalizeArUrl(_eighthWallArUrlRaw) != _eighthWallArUrlRaw.trim();

  static String _normalizeArUrl(String raw) {
    var url = raw.trim();
    if (url.isEmpty) {
      return 'https://fplaces-test.netlify.app/';
    }

    for (var i = 0; i < 3; i++) {
      if (url.startsWith('https://https://')) {
        url = 'https://${url.substring('https://https://'.length)}';
      } else if (url.startsWith('http://http://')) {
        url = 'http://${url.substring('http://http://'.length)}';
      } else {
        break;
      }
    }

    if (url.startsWith('https//')) {
      url = 'https://${url.substring('https//'.length)}';
    } else if (url.startsWith('http//')) {
      url = 'http://${url.substring('http//'.length)}';
    }

    return url;
  }
}
