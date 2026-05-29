import 'package:flutter/material.dart';
import 'package:mapsindoors_mapbox/mapsindoors.dart';

import '../../utils/app_logger.dart';

class LocationDetailSheet extends StatelessWidget {
  const LocationDetailSheet({
    super.key,
    required this.location,
    required this.onDirections,
    required this.onDismiss,
  });

  final MPLocation location;
  final VoidCallback onDirections;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    appLog('UI', 'Showing location detail sheet: ${location.name}');
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Material(
        color: const Color(0xFF1E293B),
        elevation: 12,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      location.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: onDismiss,
                    icon: const Icon(Icons.close, color: Colors.grey),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (location.description?.isNotEmpty ?? false)
                Text(
                  location.description!,
                  style: TextStyle(color: Colors.grey.shade300),
                ),
              const SizedBox(height: 8),
              Text(
                '${location.buildingName ?? 'Building'} · ${location.floorName ?? 'Floor'}',
                style: TextStyle(color: Colors.grey.shade400),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: onDirections,
                  icon: const Icon(Icons.directions_walk),
                  label: const Text('Get Directions'),
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.blueAccent,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class RouteBottomSheet extends StatelessWidget {
  const RouteBottomSheet({
    super.key,
    required this.instructions,
    required this.currentLegIndex,
    required this.legCount,
    required this.onPreviousLeg,
    required this.onNextLeg,
    required this.onOpenAr,
    required this.onClose,
  });

  final String instructions;
  final int currentLegIndex;
  final int legCount;
  final VoidCallback onPreviousLeg;
  final VoidCallback onNextLeg;
  final VoidCallback onOpenAr;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    appLog(
      'UI',
      'Showing route sheet — leg ${currentLegIndex + 1}/$legCount: $instructions',
    );
    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: Material(
        color: const Color(0xFF1E293B),
        elevation: 12,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 16, 12, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Text(
                    'Route · Leg ${currentLegIndex + 1} of $legCount',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    onPressed: onClose,
                    icon: const Icon(Icons.close, color: Colors.grey),
                  ),
                ],
              ),
              Row(
                children: [
                  IconButton(
                    onPressed: currentLegIndex > 0 ? onPreviousLeg : null,
                    icon: const Icon(Icons.keyboard_arrow_left),
                    iconSize: 36,
                    color: Colors.blueAccent,
                  ),
                  Expanded(
                    child: Text(
                      instructions,
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.grey.shade200),
                    ),
                  ),
                  IconButton(
                    onPressed:
                        currentLegIndex < legCount - 1 ? onNextLeg : null,
                    icon: const Icon(Icons.keyboard_arrow_right),
                    iconSize: 36,
                    color: Colors.blueAccent,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: onOpenAr,
                  icon: const Icon(Icons.view_in_ar_outlined),
                  label: const Text('Open AR Guidance'),
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.teal,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
