import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mapsindoors_mapbox/mapsindoors.dart';

import '../../bloc/indoor_map_bloc.dart';
import '../../bloc/indoor_map_event.dart';
import '../../bloc/indoor_map_state.dart';
import '../../services/ar_bridge_service.dart';
import '../../services/ar_inapp_browser.dart';
import '../../utils/app_logger.dart';
import '../../utils/ar_session_logger.dart';
import '../widgets/bottom_sheets.dart';
import '../widgets/floor_selector_fab.dart';
import '../widgets/search_overlay.dart';

class MapContainerScreen extends StatefulWidget {
  const MapContainerScreen({super.key});

  @override
  State<MapContainerScreen> createState() => _MapContainerScreenState();
}

class _MapContainerScreenState extends State<MapContainerScreen> {
  late final MapsIndoorsWidget _mapWidget;
  final ArBridgeService _arBridgeService = const ArBridgeService();
  Timer? _mapInitTimeout;

  @override
  void initState() {
    super.initState();
    appLog('UI', 'MapContainerScreen initState — creating MapsIndoorsWidget');
    _mapWidget = MapsIndoorsWidget(
      showFloorSelector: false,
      readyListener: _onMapControlReady,
    );
    appLog('UI', 'Dispatching InitializeEngine (map mounts in parallel)');
    context.read<IndoorMapBloc>().add(const InitializeEngine());
    _startMapInitTimeout();
  }

  void _startMapInitTimeout() {
    _mapInitTimeout?.cancel();
    _mapInitTimeout = Timer(const Duration(seconds: 20), () {
      if (!mounted) {
        return;
      }

      final state = context.read<IndoorMapBloc>().state;
      if (state.isMapReady) {
        return;
      }

      appLog(
        'UI',
        'WARNING: MapControl not ready after 20s (status: ${state.status})',
      );
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Map is taking longer than expected. Check Mapbox token and network.',
          ),
          duration: Duration(seconds: 5),
        ),
      );
    });
  }

  void _onMapControlReady(MPError? error) {
    _mapInitTimeout?.cancel();
    appLog('UI', 'MapsIndoorsWidget readyListener — error: $error');
    if (!mounted) {
      appLog('UI', 'MapControl ready ignored — widget unmounted');
      return;
    }

    context.read<IndoorMapBloc>().add(
          MapControlReady(error, _mapWidget),
        );
  }

  @override
  void dispose() {
    _mapInitTimeout?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<IndoorMapBloc, IndoorMapState>(
      listenWhen: (previous, current) =>
          previous.status != current.status ||
          previous.errorMessage != current.errorMessage ||
          previous.showRouteSheet != current.showRouteSheet ||
          previous.selectedLocation != current.selectedLocation,
      listener: (context, state) {
        appLog('UI', 'State update — $state');

        final message = state.errorMessage;
        if (message != null && state.status == IndoorMapStatus.engineFailure) {
          appLog('UI', 'Showing error snackbar: $message');
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(message),
              backgroundColor: Colors.red.shade700,
            ),
          );
        }
      },
      builder: (context, state) {
        final bloc = context.read<IndoorMapBloc>();

        appLog('UI', 'Building map screen — status: ${state.status}');

        return Scaffold(
          resizeToAvoidBottomInset: false,
          body: Stack(
            fit: StackFit.expand,
            children: [
              // MapsIndoors requires a Column/Row parent because it uses Flexible.
              // Fully dispose Mapbox while AR runs — Offstage still keeps GL alive.
              Visibility(
                visible: !state.isArNavigationActive,
                maintainState: false,
                maintainAnimation: false,
                maintainSize: false,
                child: Column(
                  children: [
                    Expanded(
                      child: Column(
                        children: [
                          _mapWidget,
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              IgnorePointer(
                ignoring: state.isMapReady,
                child: AnimatedOpacity(
                  opacity: state.isMapReady ? 0 : 1,
                  duration: const Duration(milliseconds: 250),
                  child: ColoredBox(
                    color: const Color(0xFF0F172A).withValues(alpha: 0.92),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (state.status != IndoorMapStatus.engineFailure)
                            const CircularProgressIndicator(color: Colors.blue),
                          if (state.status == IndoorMapStatus.engineFailure)
                            const Icon(
                              Icons.error_outline,
                              color: Colors.redAccent,
                              size: 48,
                            ),
                          const SizedBox(height: 16),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 32),
                            child: Text(
                              state.loadingMessage,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 14,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              IgnorePointer(
                ignoring: !state.isMapReady,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    SearchOverlay(
                      bloc: bloc,
                      onDirectionsPressed: () {
                        appLog('UI', 'Sample route button tapped');
                        bloc.add(const GenerateSampleRoute());
                      },
                    ),
                    SearchResultsPanel(
                      results: state.searchResults,
                      onLocationSelected: (location) {
                        appLog('UI', 'Search result tapped: ${location.name}');
                        bloc.add(SearchResultSelected(location));
                      },
                    ),
                    FloorSelectorFab(
                      floors: state.availableFloors,
                      currentFloor: state.currentFloor,
                      onFloorSelected: (floor) {
                        appLog('UI', 'Floor FAB tapped: ${floor.displayName}');
                        bloc.add(FloorSelected(floor));
                      },
                    ),
                    if (state.selectedLocation != null)
                      LocationDetailSheet(
                        location: state.selectedLocation!,
                        onDirections: () {
                          appLog(
                            'UI',
                            'Get Directions tapped for ${state.selectedLocation!.name}',
                          );
                          bloc.add(const RouteToSelectedLocation());
                        },
                        onDismiss: () {
                          appLog('UI', 'Location detail dismissed');
                          bloc.add(const DismissLocationDetail());
                        },
                      ),
                    if (state.showRouteSheet && state.activeRoute != null)
                      RouteBottomSheet(
                        instructions: state.routeInstructions,
                        currentLegIndex: state.currentLegIndex,
                        legCount: state.activeRoute!.legs?.length ?? 1,
                        onPreviousLeg: () {
                          appLog('UI', 'Route previous leg tapped');
                          bloc.add(const RoutePreviousLeg());
                        },
                        onNextLeg: () {
                          appLog('UI', 'Route next leg tapped');
                          bloc.add(const RouteNextLeg());
                        },
                        onOpenAr: () {
                          appLog('UI', 'Open AR Guidance tapped');
                          _openArNavigation(context, bloc, state);
                        },
                        onClose: () {
                          appLog('UI', 'Route sheet closed');
                          bloc.add(const ClearRoute());
                        },
                      ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _openArNavigation(
    BuildContext context,
    IndoorMapBloc bloc,
    IndoorMapState state,
  ) async {
    ArSessionLogger.reset();
    ArSessionLogger.log('Launch', 'User tapped Open AR Guidance');

    final route = state.activeRoute;
    if (route == null) {
      ArSessionLogger.error('Launch', 'No active route — aborting AR open');
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Generate a route before opening AR.')),
      );
      ArSessionLogger.complete('Aborted — no route');
      return;
    }

    ArSessionLogger.log(
      'Launch',
      'Active route — legs=${route.legs?.length ?? 0} '
      'currentLeg=${state.currentLegIndex} '
      'instructions="${state.routeInstructions}"',
    );

    final routePayload = _arBridgeService.buildRoutePayload(
      route: route,
      currentLegIndex: state.currentLegIndex,
      instructions: state.routeInstructions,
    );

    if (!context.mounted) {
      return;
    }

    bloc.add(const OpenArNavigation());
    ArSessionLogger.log(
      'Launch',
      'Map disposed — waiting 1200ms for GPU/camera release…',
    );
    await Future<void>.delayed(const Duration(milliseconds: 1200));

    if (!context.mounted) {
      bloc.add(const CloseArNavigation());
      return;
    }

    ArSessionLogger.log('Launch', 'Opening AR via Chrome Custom Tabs…');
    try {
      await openArInAppBrowser(
        routePayload: routePayload,
        instructions: state.routeInstructions,
        onBridgeEvent: (event) {
          final eventName = event['event']?.toString() ?? 'unknown';
          ArSessionLogger.log('Bloc', 'Forwarding bridge event → $eventName');
          switch (eventName) {
            case 'sessionReady':
              bloc.add(const ArSessionReadyChanged(true));
              break;
            case 'trackingLost':
              bloc.add(const ArStatusUpdated('AR tracking lost'));
              break;
            case 'trackingGood':
              bloc.add(const ArStatusUpdated('AR tracking stable'));
              break;
            case 'maneuverReached':
              bloc.add(
                ArStatusUpdated(
                  event['instruction']?.toString() ?? 'Maneuver reached',
                ),
              );
              break;
            default:
              bloc.add(ArStatusUpdated('AR event: $eventName'));
              break;
          }
        },
      );
    } on StateError catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message)),
        );
      }
    } catch (error, stackTrace) {
      ArSessionLogger.error(
        'Launch',
        'InAppBrowser failed',
        error: error,
        stackTrace: stackTrace,
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('AR failed to open: $error')),
        );
      }
    }

    ArSessionLogger.log('Launch', 'AR session ended');
    bloc.add(const CloseArNavigation());
    ArSessionLogger.complete('AR session closed');
  }
}
