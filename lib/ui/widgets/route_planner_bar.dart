import 'package:flutter/material.dart';

/// Slim status bar — guides the user through two map taps, then auto-routes.
class RouteHintBar extends StatelessWidget {
  const RouteHintBar({
    super.key,
    required this.hasStart,
    required this.hasEnd,
    required this.endLabel,
    required this.isCalculating,
    required this.onReset,
  });

  final bool hasStart;
  final bool hasEnd;
  final String? endLabel;
  final bool isCalculating;
  final VoidCallback onReset;

  @override
  Widget build(BuildContext context) {
    final hint = _hintText();
    final showReset = hasStart || hasEnd;

    return Positioned(
      left: 16,
      right: 16,
      bottom: 16,
      child: SafeArea(
        top: false,
        child: Material(
          color: const Color(0xFF1E293B),
          elevation: 6,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                _StepDot(active: true, done: hasStart, color: const Color(0xFF22C55E)),
                _StepLine(done: hasStart),
                _StepDot(
                  active: hasStart,
                  done: hasEnd,
                  color: const Color(0xFFEF4444),
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
                  )
                else if (showReset)
                  IconButton(
                    onPressed: onReset,
                    icon: Icon(Icons.restart_alt, color: Colors.grey.shade400),
                    tooltip: 'Start over',
                    visualDensity: VisualDensity.compact,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _hintText() {
    if (isCalculating) return 'Finding route…';
    if (!hasStart) return 'Tap the map — where are you?';
    if (!hasEnd) return 'Tap the map — where are you going?';
    return 'Route ready';
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot({
    required this.active,
    required this.done,
    required this.color,
  });

  final bool active;
  final bool done;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
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