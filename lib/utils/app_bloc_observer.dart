import 'package:flutter_bloc/flutter_bloc.dart';

import 'app_logger.dart';

class AppBlocObserver extends BlocObserver {
  @override
  void onCreate(BlocBase<dynamic> bloc) {
    super.onCreate(bloc);
    appLog('Bloc', 'Created ${bloc.runtimeType}');
  }

  @override
  void onEvent(Bloc<dynamic, dynamic> bloc, Object? event) {
    super.onEvent(bloc, event);
    appLog('Bloc', '${bloc.runtimeType} ← event: $event');
  }

  @override
  void onTransition(
    Bloc<dynamic, dynamic> bloc,
    Transition<dynamic, dynamic> transition,
  ) {
    super.onTransition(bloc, transition);
    appLog(
      'Bloc',
      '${bloc.runtimeType} transition: '
      '${transition.currentState.runtimeType} → ${transition.nextState.runtimeType} '
      '(event: ${transition.event.runtimeType})',
    );
  }

  @override
  void onChange(BlocBase<dynamic> bloc, Change<dynamic> change) {
    super.onChange(bloc, change);
    appLog(
      'Bloc',
      '${bloc.runtimeType} state: ${change.currentState} → ${change.nextState}',
    );
  }

  @override
  void onError(BlocBase<dynamic> bloc, Object error, StackTrace stackTrace) {
    super.onError(bloc, error, stackTrace);
    appLog('Bloc', '${bloc.runtimeType} ERROR: $error');
    appLog('Bloc', stackTrace.toString());
  }

  @override
  void onClose(BlocBase<dynamic> bloc) {
    super.onClose(bloc);
    appLog('Bloc', 'Closed ${bloc.runtimeType}');
  }
}
