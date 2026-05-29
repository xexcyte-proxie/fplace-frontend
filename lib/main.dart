import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import 'bloc/indoor_map_bloc.dart';
import 'repository/indoor_map_repository.dart';
import 'services/route_controller.dart';
import 'ui/screens/map_container_screen.dart';
import 'utils/app_bloc_observer.dart';
import 'utils/app_logger.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (Platform.isAndroid) {
    await InAppWebViewController.setWebContentsDebuggingEnabled(true);
  }
  appLog('App', 'Starting Indoor Navigation POC');
  Bloc.observer = AppBlocObserver();
  runApp(const IndoorMapPrototypeApp());
}

class IndoorMapPrototypeApp extends StatelessWidget {
  const IndoorMapPrototypeApp({super.key});

  @override
  Widget build(BuildContext context) {
    appLog('App', 'Building MaterialApp');
    return BlocProvider(
      create: (_) {
        appLog('App', 'Creating IndoorMapBloc');
        return IndoorMapBloc(
          repository: const IndoorMapRepository(),
          routeController: RouteController(),
        );
      },
      child: MaterialApp(
        title: 'Indoor Navigation POC',
        theme: ThemeData.dark().copyWith(
          primaryColor: const Color(0xFF1A365D),
          scaffoldBackgroundColor: const Color(0xFF0F172A),
        ),
        home: const MapContainerScreen(),
      ),
    );
  }
}
