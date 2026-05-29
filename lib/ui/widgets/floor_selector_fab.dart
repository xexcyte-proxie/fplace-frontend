import 'package:flutter/material.dart';
import 'package:mapsindoors_mapbox/mapsindoors.dart';

import '../../utils/app_logger.dart';

class FloorSelectorFab extends StatelessWidget {
  const FloorSelectorFab({
    super.key,
    required this.floors,
    required this.currentFloor,
    required this.onFloorSelected,
  });

  final List<MPFloor> floors;
  final MPFloor? currentFloor;
  final ValueChanged<MPFloor> onFloorSelected;

  @override
  Widget build(BuildContext context) {
    if (floors.isEmpty) {
      return const SizedBox.shrink();
    }

    appLog('UI', 'Rendering floor selector — ${floors.length} floor(s), current: ${currentFloor?.displayName}');

    final orderedFloors = List<MPFloor>.from(floors)
      ..sort((a, b) => b.floorIndex.compareTo(a.floorIndex));

    return Positioned(
      right: 16,
      bottom: 120,
      child: Container(
        width: 50,
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(25),
          boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 6)],
        ),
        child: ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: orderedFloors.length,
          itemBuilder: (context, index) {
            final floor = orderedFloors[index];
            final isSelected = currentFloor?.floorIndex == floor.floorIndex;

            return GestureDetector(
              onTap: () => onFloorSelected(floor),
              child: Container(
                margin: const EdgeInsets.all(4),
                height: 42,
                decoration: BoxDecoration(
                  color: isSelected ? Colors.blueAccent : Colors.transparent,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  key: ValueKey('floor_${floor.floorIndex}'),
                  child: Text(
                    floor.displayName,
                    style: TextStyle(
                      color: isSelected ? Colors.white : Colors.grey.shade400,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
