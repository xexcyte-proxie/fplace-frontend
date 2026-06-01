import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'ui/screens/map_container_screen.dart';
import 'utils/map_diagnostic_logger.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (!kIsWeb) {
    await InAppWebViewController.setWebContentsDebuggingEnabled(true);
  }

  MapDiagnosticLogger.step(
    'App',
    'Starting indoor navigation (${kIsWeb ? 'PWA / web' : 'native shell'})',
  );

  runApp(
    const ProviderScope(
      child: IndoorMapPrototypeApp(),
    ),
  );
}

class IndoorMapPrototypeApp extends StatelessWidget {
  const IndoorMapPrototypeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Demo Mall · Indoor Nav',
      theme: ThemeData.dark().copyWith(
        primaryColor: const Color(0xFF1A365D),
        scaffoldBackgroundColor: const Color(0xFF0F172A),
      ),
      home: const MapContainerScreen(),
    );
  }
}
