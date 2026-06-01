import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

/// On Flutter Web, [HtmlElementView] / iframe maps steal pointer events from
/// widgets drawn on top. Wrap interactive overlays with this helper.
class WebPointerShield extends StatelessWidget {
  const WebPointerShield({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!kIsWeb) return child;
    return PointerInterceptor(child: child);
  }
}
