import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/indoor_map_providers.dart';
import '../../providers/indoor_map_state.dart';
import '../../services/ar_bridge_service.dart';
import '../../services/ar_inapp_browser.dart';
import '../../utils/ar_session_logger.dart';
import '../../utils/map_diagnostic_logger.dart';
import '../widgets/app_dialog.dart';
import '../widgets/bottom_sheets.dart';
import '../widgets/floor_selector_fab.dart';
import '../widgets/mappedin_map_widget.dart';
import '../widgets/location_permission_prompt.dart';
import '../widgets/my_location_fab.dart';
import '../widgets/route_planner_bar.dart';
import '../widgets/search_overlay.dart';
import '../widgets/web_pointer_shield.dart';

class MapContainerScreen extends ConsumerStatefulWidget {
  const MapContainerScreen({super.key});

  @override
  ConsumerState<MapContainerScreen> createState() => _MapContainerScreenState();
}

class _MapContainerScreenState extends ConsumerState<MapContainerScreen> {
  final ArBridgeService _arBridgeService = const ArBridgeService();
  Timer? _mapInitTimeout;

  @override
  void initState() {
    super.initState();
    MapDiagnosticLogger.step('UI', 'MapContainerScreen initState');
    _startMapInitTimeout();
  }

  void _onWebViewReady() {
    MapDiagnosticLogger.step(
        'UI', 'WebView ready callback → starting initializeMap()');
    ref.read(indoorMapProvider.notifier).initializeMap();
  }

  void _startMapInitTimeout() {
    _mapInitTimeout?.cancel();
    _mapInitTimeout = Timer(const Duration(seconds: 45), () {
      if (!mounted) return;

      final mapState = ref.read(indoorMapProvider);
      if (mapState.isMapReady) return;

      MapDiagnosticLogger.warn(
        'UI',
        'Map not ready after 45s (status: ${mapState.status}, '
            'error: ${mapState.errorMessage ?? 'none'})',
      );
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Map is taking longer than expected. Check your network connection.',
          ),
          duration: Duration(seconds: 5),
        ),
      );
    });
  }

  void _onMapReady() {
    _mapInitTimeout?.cancel();
  }

  @override
  void dispose() {
    _mapInitTimeout?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mapState = ref.watch(indoorMapProvider);
    final mapNotifier = ref.read(indoorMapProvider.notifier);
    final bridge = ref.watch(mappedinBridgeProvider);

    ref.listen<IndoorMapState>(indoorMapProvider, (previous, current) {
      MapDiagnosticLogger.step('UI', 'State → $current');

      if (current.isMapReady ||
          current.status == IndoorMapStatus.engineFailure) {
        _mapInitTimeout?.cancel();
      }

      if (current.isMapReady) {
        MapDiagnosticLogger.ok(
            'UI', 'Map is ready — hiding loading overlay 🎉');
        _onMapReady();
        if (previous?.isMapReady != true) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) {
              LocationPermissionPrompt.maybePromptAfterMapReady(context);
            }
          });
        }
      }

      if (current.status == IndoorMapStatus.engineFailure &&
          previous?.status != IndoorMapStatus.engineFailure) {
        MapDiagnosticLogger.error(
          'UI',
          'Map failed to load',
          detail: current.errorMessage,
        );
      }

      final message = current.errorMessage;
      if (message != null && previous?.errorMessage != message) {
        if (current.status == IndoorMapStatus.engineFailure) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(message),
              backgroundColor: Colors.red.shade700,
            ),
          );
        } else if (current.isMapReady) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(message)),
          );
        }
      }
    });

    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: Stack(
        fit: StackFit.expand,
        children: [
          ValueListenableBuilder<int>(
            valueListenable: ModalShieldScope.openDialogCount,
            builder: (context, openDialogs, child) => IgnorePointer(
              ignoring: mapState.showRouteSheet || openDialogs > 0,
              child: child,
            ),
            child: Visibility(
              visible: !mapState.isArNavigationActive,
              maintainState: false,
              maintainAnimation: false,
              maintainSize: false,
              child: MappedinMapWidget(
                bridge: bridge,
                onWebViewReady: _onWebViewReady,
                onMapError: mapNotifier.mapLoadFailed,
              ),
            ),
          ),
          if (!mapState.isMapReady &&
              mapState.status != IndoorMapStatus.engineFailure)
            Positioned.fill(
              child: WebPointerShield(
                child: ColoredBox(
                  color: const Color(0xFF0F172A).withValues(alpha: 0.92),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircularProgressIndicator(color: Colors.blue),
                        const SizedBox(height: 16),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 32),
                          child: Text(
                            mapState.loadingMessage,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              height: 1.4,
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'Status: ${mapState.status.name}',
                          style: TextStyle(
                            color: Colors.grey.shade500,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          if (mapState.status == IndoorMapStatus.engineFailure)
            Positioned.fill(
              child: WebPointerShield(
                child: ColoredBox(
                  color: const Color(0xFF0F172A).withValues(alpha: 0.92),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.error_outline,
                          color: Colors.redAccent,
                          size: 48,
                        ),
                        const SizedBox(height: 16),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 32),
                          child: Text(
                            mapState.loadingMessage,
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
          if (mapState.isMapReady)
            Stack(
              fit: StackFit.expand,
              children: [
                SearchOverlay(),
                SearchResultsPanel(
                  results: mapState.searchResults,
                  onLocationSelected: mapNotifier.selectSearchResult,
                ),
                FloorSelectorFab(
                  floors: mapState.availableFloors,
                  currentFloor: mapState.currentFloor,
                  onFloorSelected: mapNotifier.selectFloor,
                  bottomOffset: mapState.showRouteSheet ? 100 : 88,
                ),
                MyLocationFab(
                  enabled: mapState.isMapReady,
                  onPressed: mapNotifier.goToMyLocation,
                  bottomOffset: mapState.showRouteSheet ? 100 : 88,
                ),
                if (!mapState.showRouteSheet)
                  RouteHintBar(
                    hasStart: mapState.hasRouteOrigin,
                    hasEnd: mapState.hasRouteDestination,
                    endLabel: mapState.routeDestinationLabel,
                    isCalculating: mapState.isCalculatingRoute,
                    onReset: mapNotifier.clearRoutePoints,
                  ),
                if (mapState.showRouteSheet && mapState.activeRoute != null)
                  RouteBottomSheet(
                    instructions: mapState.routeInstructions,
                    currentLegIndex: mapState.currentLegIndex,
                    legCount: mapState.activeRoute!.legs.length,
                    onPreviousLeg: mapNotifier.routePreviousLeg,
                    onNextLeg: mapNotifier.routeNextLeg,
                    onOpenAr: () => _openArNavigation(mapState),
                    onClose: mapNotifier.clearRoute,
                    onResetPoints: mapNotifier.clearRoutePoints,
                  ),
              ],
            ),
        ],
      ),
    );
  }

  Future<void> _openArNavigation(IndoorMapState mapState) async {
    final mapNotifier = ref.read(indoorMapProvider.notifier);

    ArSessionLogger.reset();
    ArSessionLogger.log('Launch', 'User tapped Open AR Guidance');

    final route = mapState.activeRoute;
    if (route == null) {
      ArSessionLogger.warn('Launch', 'No active route — aborting');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Generate a route before opening AR.')),
      );
      return;
    }

    ArSessionLogger.log('Route', 'Active route snapshot', detail: {
      'pathPoints': route.pathCoordinates.length,
      'maneuvers': route.maneuvers.length,
      'legs': route.legs.length,
      'currentLegIndex': mapState.currentLegIndex,
      'destinationName': route.destinationName,
      'distanceMeters': route.distanceMeters,
      'origin': route.origin?.toJson(),
      'destination': route.destination?.toJson(),
    });

    Map<String, dynamic>? userPosition;
    final routeOrigin = route.origin;
    if (routeOrigin != null) {
      userPosition = {
        'latitude': routeOrigin.latitude,
        'longitude': routeOrigin.longitude,
        if (routeOrigin.floorId != null) 'floorId': routeOrigin.floorId,
        'accuracy': 8,
        'source': 'mapOrigin',
      };
      ArSessionLogger.log('Location', 'Seeding AR from route map origin',
          detail: userPosition);
    } else if (mapState.routeOriginLatitude != null &&
        mapState.routeOriginLongitude != null) {
      userPosition = {
        'latitude': mapState.routeOriginLatitude,
        'longitude': mapState.routeOriginLongitude,
        if (mapState.routeOriginFloorId != null)
          'floorId': mapState.routeOriginFloorId,
        'accuracy': 8,
        'source': 'mapOrigin',
      };
      ArSessionLogger.log('Location', 'Seeding AR from tapped route origin',
          detail: userPosition);
    } else {
      try {
        ArSessionLogger.log('Location', 'Fetching device GPS for AR seed…');
        final location =
            await ref.read(deviceLocationServiceProvider).getCurrentPosition();
        userPosition = {
          'latitude': location.latitude,
          'longitude': location.longitude,
          if (location.accuracyMeters != null)
            'accuracy': location.accuracyMeters,
          'source': 'flutterGps',
        };
        ArSessionLogger.log('Location', 'Got GPS seed for AR',
            detail: userPosition);
      } catch (error) {
        ArSessionLogger.warn(
          'Location',
          'Could not seed AR with device position',
          detail: error,
        );
      }
    }

    final routePayload = _arBridgeService.buildRoutePayload(
      route: route,
      currentLegIndex: mapState.currentLegIndex,
      instructions: mapState.routeInstructions,
      userPosition: userPosition,
    );

    if (!mounted) return;

    mapNotifier.openArNavigation();
    ArSessionLogger.log('Launch', 'Waiting 800ms before opening AR browser…');
    await Future<void>.delayed(const Duration(milliseconds: 800));

    if (!mounted) {
      ArSessionLogger.warn(
          'Launch', 'Widget unmounted during delay — aborting');
      mapNotifier.closeArNavigation();
      return;
    }

    try {
      await openArInAppBrowser(
        routePayload: routePayload,
        instructions: mapState.routeInstructions,
        onBridgeEvent: (event) {
          final eventName = event['event']?.toString() ?? 'unknown';
          switch (eventName) {
            case 'arRuntimeError':
              ArSessionLogger.error(
                'Bridge',
                'AR runtime error from page',
                detail: {
                  'message': event['message'],
                  'source': event['source'],
                  'stack': event['stack'],
                },
              );
              mapNotifier.arStatusUpdated(
                event['message']?.toString() ?? 'AR runtime error',
              );
              break;
            case 'debug':
              // Mirrored from AR page — already logged in InAppBrowser handler when applicable.
              break;
            case 'sessionReady':
              ArSessionLogger.log('Bridge', 'AR page sessionReady');
              mapNotifier.arSessionReadyChanged(true);
              break;
            case 'trackingLost':
              ArSessionLogger.warn('Bridge', 'AR tracking lost');
              mapNotifier.arStatusUpdated('AR tracking lost');
              break;
            case 'trackingGood':
              ArSessionLogger.log('Bridge', 'AR tracking stable');
              mapNotifier.arStatusUpdated('AR tracking stable');
              break;
            case 'maneuverReached':
              ArSessionLogger.log(
                'Bridge',
                'Maneuver reached',
                detail: {'instruction': event['instruction']},
              );
              mapNotifier.arStatusUpdated(
                event['instruction']?.toString() ?? 'Maneuver reached',
              );
              break;
            default:
              ArSessionLogger.log('Bridge', 'AR event: $eventName',
                  detail: event);
              mapNotifier.arStatusUpdated('AR event: $eventName');
              break;
          }
        },
      );
    } on StateError catch (error) {
      ArSessionLogger.error('Launch', 'AR StateError', detail: error.message);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.message)),
        );
      }
    } catch (error, stackTrace) {
      ArSessionLogger.error(
        'Launch',
        'AR failed to open',
        error: error,
        stackTrace: stackTrace,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('AR failed to open: $error')),
        );
      }
    }

    mapNotifier.closeArNavigation();
    ArSessionLogger.complete('AR session closed');
  }
}
