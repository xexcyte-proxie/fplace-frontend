import 'package:flutter/material.dart';

import '../../utils/app_logger.dart';
import 'web_pointer_shield.dart';

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
    required this.onResetPoints,
  });

  final String instructions;
  final int currentLegIndex;
  final int legCount;
  final VoidCallback onPreviousLeg;
  final VoidCallback onNextLeg;
  final VoidCallback onOpenAr;
  final VoidCallback onClose;
  final VoidCallback onResetPoints;

  @override
  Widget build(BuildContext context) {
    appLog('UI', 'Route sheet — $instructions');

    return Positioned(
      left: 0,
      right: 0,
      bottom: 0,
      child: WebPointerShield(
        child: Material(
        color: const Color(0xFF1E293B),
        elevation: 16,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 8, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Icon(Icons.directions_walk, color: Colors.blueAccent, size: 22),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      instructions.isNotEmpty ? instructions : 'Follow the path',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: onClose,
                    icon: const Icon(Icons.close, color: Colors.grey),
                  ),
                ],
              ),
              if (legCount > 1) ...[
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      onPressed: currentLegIndex > 0 ? onPreviousLeg : null,
                      icon: const Icon(Icons.chevron_left),
                      color: Colors.blueAccent,
                    ),
                    Text(
                      'Step ${currentLegIndex + 1} of $legCount',
                      style: TextStyle(color: Colors.grey.shade400, fontSize: 13),
                    ),
                    IconButton(
                      onPressed: currentLegIndex < legCount - 1 ? onNextLeg : null,
                      icon: const Icon(Icons.chevron_right),
                      color: Colors.blueAccent,
                    ),
                  ],
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: onResetPoints,
                      icon: const Icon(Icons.restart_alt, size: 18),
                      label: const Text('Reset points'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white70,
                        side: BorderSide(color: Colors.grey.shade600),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: onOpenAr,
                      icon: const Icon(Icons.view_in_ar_outlined, size: 20),
                      label: const Text('AR'),
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.teal,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        ),
      ),
    );
  }
}
