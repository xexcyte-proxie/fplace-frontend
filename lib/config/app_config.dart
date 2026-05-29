/// Application configuration for MapsIndoors sandbox and Mapbox credentials.
///
/// Override at build time with dart-define:
///   flutter run --dart-define=MAPBOX_ACCESS_TOKEN=pk.xxx
class AppConfig {
  AppConfig._();

  /// MapsPeople HQ digital twin sandbox solution id.
  static const String sandboxSolutionId = 'd876ff0e60bb430b8fabb145';

  /// Public Mapbox access token for the rendering canvas.
  static const String mapboxPublicToken = String.fromEnvironment(
    'MAPBOX_ACCESS_TOKEN',
    defaultValue:
        'pk.eyJ1Ijoib2xhbmthbiIsImEiOiJjbXBpeG92bW0wcWczMnBzNnV5Mm02bnU0In0.wOnx0MEVZYMaH2ox8G6Dfw',
  );

  static const String _eighthWallArUrlRaw = String.fromEnvironment(
    'EIGHTH_WALL_AR_URL',
    defaultValue: 'https://fplaces-test.netlify.app/',
  );

  /// Hosted 8th Wall WebAR page URL loaded inside Flutter WebView.
  ///
  /// Override with:
  ///   flutter run --dart-define=EIGHTH_WALL_AR_URL=https://your-domain/
  ///
  /// Common typo `https://https://...` is corrected automatically.
  static String get eighthWallArUrl => _normalizeArUrl(_eighthWallArUrlRaw);

  /// True when [eighthWallArUrl] was auto-corrected (e.g. double `https://`).
  static bool get eighthWallArUrlWasNormalized =>
      _normalizeArUrl(_eighthWallArUrlRaw) != _eighthWallArUrlRaw.trim();

  static String _normalizeArUrl(String raw) {
    var url = raw.trim();
    if (url.isEmpty) {
      return 'https://fplaces-test.netlify.app/';
    }

    // Fix duplicated schemes, e.g. https://https://example.com
    for (var i = 0; i < 3; i++) {
      if (url.startsWith('https://https://')) {
        url = 'https://${url.substring('https://https://'.length)}';
      } else if (url.startsWith('http://http://')) {
        url = 'http://${url.substring('http://http://'.length)}';
      } else {
        break;
      }
    }

    // Fix missing colon after scheme.
    if (url.startsWith('https//')) {
      url = 'https://${url.substring('https//'.length)}';
    } else if (url.startsWith('http//')) {
      url = 'http://${url.substring('http//'.length)}';
    }

    return url;
  }
}
