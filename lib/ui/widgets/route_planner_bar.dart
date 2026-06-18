import 'package:flutter/material.dart';

import 'web_pointer_shield.dart';

/// Slim status bar — guides the user through two map taps, then auto-routes.
class RouteHintBar extends StatelessWidget {
  const RouteHintBar({
    super.key,
    required this.hasStart,
    required this.hasEnd,
    required this.endLabel,
    required this.isCalculating,
    required this.onReset,
    this.onFocusStart,
    this.onFocusEnd,
  });

  final bool hasStart;
  final bool hasEnd;
  final String? endLabel;
  final bool isCalculating;
  final VoidCallback onReset;
  final VoidCallback? onFocusStart;
  final VoidCallback? onFocusEnd;

  @override
  Widget build(BuildContext context) {
    final hint = _hintText();
    final canReset = (hasStart || hasEnd) && !isCalculating;

    return Positioned(
      left: 16,
      right: 16,
      bottom: 16,
      child: SafeArea(
        top: false,
        child: WebPointerShield(
          child: Material(
          color: const Color(0xFF1E293B),
          elevation: 6,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                _StepDot(
                  active: true,
                  done: hasStart,
                  color: const Color(0xFF22C55E),
                  onTap: hasStart ? onFocusStart : null,
                  tooltip: hasStart ? 'Show start on map' : null,
                ),
                _StepLine(done: hasStart),
                _StepDot(
                  active: hasStart,
                  done: hasEnd,
                  color: const Color(0xFFEF4444),
                  onTap: hasEnd ? onFocusEnd : null,
                  tooltip: hasEnd ? 'Show destination on map' : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        hint,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      if (hasEnd && endLabel != null && endLabel != 'End point')
                        Text(
                          endLabel!,
                          style: TextStyle(
                            color: Colors.grey.shade400,
                            fontSize: 12,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                if (isCalculating)
                  const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: canReset ? onReset : null,
                  icon: const Icon(Icons.restart_alt, size: 18),
                  label: const Text('Reset'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white70,
                    disabledForegroundColor: Colors.grey.shade700,
                    side: BorderSide(
                      color: canReset ? Colors.grey.shade500 : Colors.grey.shade800,
                    ),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ],
            ),
          ),
        ),
        ),
      ),
    );
  }

  String _hintText() {
    if (isCalculating) return 'Finding route…';
    if (!hasStart) return 'Tap the map — where are you?';
    if (!hasEnd) return 'Tap the map — where are you going? (flag marks destination)';
    return 'Route ready — tap ● to view on map';
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot({
    required this.active,
    required this.done,
    required this.color,
    this.onTap,
    this.tooltip,
  });

  final bool active;
  final bool done;
  final Color color;
  final VoidCallback? onTap;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final dot = AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: done ? color : Colors.transparent,
        shape: BoxShape.circle,
        border: Border.all(
          color: active ? color : Colors.grey.shade600,
          width: 2,
        ),
      ),
    );

    if (onTap == null) return dot;

    return Tooltip(
      message: tooltip ?? '',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: dot,
          ),
        ),
      ),
    );
  }
}

class _StepLine extends StatelessWidget {
  const _StepLine({required this.done});

  final bool done;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 20,
      height: 2,
      margin: const EdgeInsets.symmetric(horizontal: 4),
      color: done ? const Color(0xFF22C55E) : Colors.grey.shade700,
    );
  }
}