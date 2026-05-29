import 'package:flutter/material.dart';

class MyLocationFab extends StatefulWidget {
  const MyLocationFab({
    super.key,
    required this.onPressed,
    required this.enabled,
    this.bottomOffset = 120,
  });

  final Future<void> Function() onPressed;
  final bool enabled;
  final double bottomOffset;

  @override
  State<MyLocationFab> createState() => _MyLocationFabState();
}

class _MyLocationFabState extends State<MyLocationFab> {
  bool _isLocating = false;

  Future<void> _handleTap() async {
    if (!widget.enabled || _isLocating) return;

    setState(() => _isLocating = true);
    try {
      await widget.onPressed();
    } finally {
      if (mounted) {
        setState(() => _isLocating = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 16,
      bottom: widget.bottomOffset,
      child: Material(
        color: const Color(0xFF1E293B),
        elevation: 4,
        shadowColor: Colors.black38,
        shape: const CircleBorder(),
        child: InkWell(
          onTap: _handleTap,
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: 48,
            height: 48,
            child: _isLocating
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.blueAccent,
                    ),
                  )
                : Icon(
                    Icons.my_location,
                    color: widget.enabled ? Colors.blueAccent : Colors.grey,
                  ),
          ),
        ),
      ),
    );
  }
}
