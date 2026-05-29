import 'package:flutter/material.dart';

import '../../models/indoor_map_models.dart';
import '../../utils/app_logger.dart';

class FloorSelectorFab extends StatelessWidget {
  const FloorSelectorFab({
    super.key,
    required this.floors,
    required this.currentFloor,
    required this.onFloorSelected,
    this.bottomOffset = 120,
  });

  final List<IndoorFloor> floors;
  final IndoorFloor? currentFloor;
  final ValueChanged<IndoorFloor> onFloorSelected;
  final double bottomOffset;

  @override
  Widget build(BuildContext context) {
    if (floors.isEmpty) {
      return const SizedBox.shrink();
    }

    appLog(
      'UI',
      'Rendering floor selector — ${floors.length} floor(s), '
      'current: ${currentFloor?.displayName}',
    );

    final orderedFloors = List<IndoorFloor>.from(floors)
      ..sort((a, b) => b.sortOrder.compareTo(a.sortOrder));

    return Positioned(
      right: 16,
      bottom: bottomOffset,
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
            final isSelected = currentFloor?.id == floor.id;

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
                  key: ValueKey('floor_${floor.id}'),
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
