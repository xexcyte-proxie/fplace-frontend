import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:pointer_interceptor/pointer_interceptor.dart';

/// Tracks open modal dialogs so the map iframe can be pointer-blocked underneath.
class ModalShieldScope {
  ModalShieldScope._();

  static final ValueNotifier<int> openDialogCount = ValueNotifier(0);

  static void notifyOpened() {
    openDialogCount.value++;
  }

  static void notifyClosed() {
    if (openDialogCount.value > 0) {
      openDialogCount.value--;
    }
  }
}

/// Drop-in replacement for [showDialog] that blocks iframe/map pointer steal on web.
Future<T?> showAppDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool barrierDismissible = true,
  Color? barrierColor,
  bool useRootNavigator = true,
  RouteSettings? routeSettings,
}) async {
  ModalShieldScope.notifyOpened();
  try {
    if (!kIsWeb) {
      return showDialog<T>(
        context: context,
        barrierDismissible: barrierDismissible,
        barrierColor: barrierColor,
        useRootNavigator: useRootNavigator,
        routeSettings: routeSettings,
        builder: builder,
      );
    }

    final localizations = MaterialLocalizations.of(context);
    return showGeneralDialog<T>(
      context: context,
      useRootNavigator: useRootNavigator,
      routeSettings: routeSettings,
      barrierDismissible: false,
      barrierColor: Colors.transparent,
      barrierLabel: localizations.modalBarrierDismissLabel,
      pageBuilder: (dialogContext, animation, secondaryAnimation) {
        return _WebModalShield(
          dismissible: barrierDismissible,
          barrierColor: barrierColor ?? Colors.black54,
          onDismiss: () => Navigator.of(dialogContext).pop(),
          child: builder(dialogContext),
        );
      },
      transitionBuilder: (context, animation, secondaryAnimation, child) {
        return FadeTransition(
          opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
          child: child,
        );
      },
    );
  } finally {
    ModalShieldScope.notifyClosed();
  }
}

/// Full-screen pointer shield + centered dialog content (Flutter web iframe fix).
class _WebModalShield extends StatelessWidget {
  const _WebModalShield({
    required this.child,
    required this.dismissible,
    required this.barrierColor,
    required this.onDismiss,
  });

  final Widget child;
  final bool dismissible;
  final Color barrierColor;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    return Material(
      type: MaterialType.transparency,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
            child: PointerInterceptor(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: dismissible ? onDismiss : null,
                child: ColoredBox(color: barrierColor),
              ),
            ),
          ),
          Center(
            child: PointerInterceptor(
              child: Material(
                type: MaterialType.transparency,
                child: child,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
