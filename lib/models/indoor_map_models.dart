// Domain models for indoor map data, decoupled from any map SDK.

class IndoorFloor {
  const IndoorFloor({
    required this.id,
    required this.displayName,
    required this.sortOrder,
  });

  final String id;
  final String displayName;
  final int sortOrder;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is IndoorFloor && other.id == id;

  @override
  int get hashCode => id.hashCode;
}

class IndoorLocation {
  const IndoorLocation({
    required this.id,
    required this.name,
    this.description,
    this.floorName,
    this.floorId,
    this.buildingName,
    this.latitude,
    this.longitude,
  });

  final String id;
  final String name;
  final String? description;
  final String? floorName;
  final String? floorId;
  final String? buildingName;
  final double? latitude;
  final double? longitude;

  factory IndoorLocation.fromJson(Map<String, dynamic> json) {
    final center = json['center'];
    double? lat;
    double? lng;
    if (center is Map) {
      lat = (center['latitude'] as num?)?.toDouble();
      lng = (center['longitude'] as num?)?.toDouble();
    }

    return IndoorLocation(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unknown',
      description: json['description']?.toString(),
      floorName: json['floorName']?.toString(),
      floorId: json['floorId']?.toString(),
      buildingName: json['buildingName']?.toString(),
      latitude: (json['latitude'] as num?)?.toDouble() ?? lat,
      longitude: (json['longitude'] as num?)?.toDouble() ?? lng,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        if (description != null) 'description': description,
        if (floorName != null) 'floorName': floorName,
        if (floorId != null) 'floorId': floorId,
        if (buildingName != null) 'buildingName': buildingName,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
      };
}

class RouteCoordinate {
  const RouteCoordinate({
    required this.latitude,
    required this.longitude,
    this.floorId,
  });

  final double latitude;
  final double longitude;
  final String? floorId;

  factory RouteCoordinate.fromJson(Map<String, dynamic> json) {
    return RouteCoordinate(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      floorId: json['floorId']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'latitude': latitude,
        'longitude': longitude,
        if (floorId != null) 'floorId': floorId,
      };
}

class IndoorRouteStep {
  const IndoorRouteStep({
    required this.instruction,
    this.actionType,
    this.bearing,
    this.distanceMeters,
    this.legIndex,
    this.stepIndex,
  });

  final String instruction;
  final String? actionType;
  final String? bearing;
  final double? distanceMeters;
  final int? legIndex;
  final int? stepIndex;

  factory IndoorRouteStep.fromJson(Map<String, dynamic> json) {
    return IndoorRouteStep(
      instruction: json['instruction']?.toString() ?? 'Continue',
      actionType: json['actionType']?.toString(),
      bearing: json['bearing']?.toString(),
      distanceMeters: (json['distanceMeters'] as num?)?.toDouble(),
      legIndex: (json['legIndex'] as num?)?.toInt(),
      stepIndex: (json['stepIndex'] as num?)?.toInt(),
    );
  }

  Map<String, dynamic> toJson() => {
        'instruction': instruction,
        if (actionType != null) 'actionType': actionType,
        if (bearing != null) 'bearing': bearing,
        if (distanceMeters != null) 'distanceMeters': distanceMeters,
        if (legIndex != null) 'legIndex': legIndex,
        if (stepIndex != null) 'stepIndex': stepIndex,
      };
}

class IndoorRouteLeg {
  const IndoorRouteLeg({
    required this.index,
    required this.steps,
  });

  final int index;
  final List<IndoorRouteStep> steps;

  String get instructionsText {
    if (steps.isEmpty) {
      return 'Continue on current floor';
    }
    return steps.map((s) => s.instruction).join(', ');
  }

  factory IndoorRouteLeg.fromJson(Map<String, dynamic> json) {
    final rawSteps = json['steps'];
    final steps = rawSteps is List
        ? rawSteps
            .whereType<Map>()
            .map((e) => IndoorRouteStep.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <IndoorRouteStep>[];

    return IndoorRouteLeg(
      index: (json['index'] as num?)?.toInt() ?? 0,
      steps: steps,
    );
  }
}

class IndoorRoute {
  const IndoorRoute({
    required this.legs,
    this.destinationName,
    this.pathCoordinates = const [],
    this.maneuvers = const [],
    this.origin,
    this.destination,
    this.distanceMeters,
    this.durationSeconds,
    this.mapId,
  });

  final List<IndoorRouteLeg> legs;
  final String? destinationName;
  final List<RouteCoordinate> pathCoordinates;
  final List<IndoorRouteStep> maneuvers;
  final RouteCoordinate? origin;
  final RouteCoordinate? destination;
  final double? distanceMeters;
  final double? durationSeconds;
  final String? mapId;

  factory IndoorRoute.fromJson(Map<String, dynamic> json) {
    final rawLegs = json['legs'];
    final legs = rawLegs is List
        ? rawLegs
            .whereType<Map>()
            .map((e) => IndoorRouteLeg.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <IndoorRouteLeg>[];

    final rawPath = json['pathCoordinates'];
    final pathCoordinates = rawPath is List
        ? rawPath
            .whereType<Map>()
            .map((e) => RouteCoordinate.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <RouteCoordinate>[];

    final rawManeuvers = json['maneuvers'];
    var maneuvers = rawManeuvers is List
        ? rawManeuvers
            .whereType<Map>()
            .map((e) => IndoorRouteStep.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <IndoorRouteStep>[];

    if (maneuvers.isEmpty) {
      maneuvers = [
        for (final leg in legs)
          for (var i = 0; i < leg.steps.length; i++)
            IndoorRouteStep(
              instruction: leg.steps[i].instruction,
              actionType: leg.steps[i].actionType,
              bearing: leg.steps[i].bearing,
              distanceMeters: leg.steps[i].distanceMeters,
              legIndex: leg.index,
              stepIndex: i,
            ),
      ];
    }

    RouteCoordinate? coordFrom(dynamic raw) {
      if (raw is! Map) return null;
      return RouteCoordinate.fromJson(Map<String, dynamic>.from(raw));
    }

    return IndoorRoute(
      legs: legs,
      destinationName: json['destinationName']?.toString(),
      pathCoordinates: pathCoordinates,
      maneuvers: maneuvers,
      origin: coordFrom(json['origin']),
      destination: coordFrom(json['destination']),
      distanceMeters: (json['distanceMeters'] as num?)?.toDouble(),
      durationSeconds: (json['durationSeconds'] as num?)?.toDouble(),
      mapId: json['mapId']?.toString(),
    );
  }

  Map<String, dynamic> toArJson({
    required int currentLegIndex,
    required String instructions,
  }) {
    return {
      'type': 'route_update',
      'legCount': legs.length,
      'currentLegIndex': currentLegIndex,
      'instructions': instructions,
      'destinationName': destinationName,
      'distanceMeters': distanceMeters,
      'durationSeconds': durationSeconds,
      'mapId': mapId,
      'origin': origin?.toJson(),
      'destination': destination?.toJson(),
      'pathCoordinates': pathCoordinates.map((c) => c.toJson()).toList(),
      'maneuvers': maneuvers.map((m) => m.toJson()).toList(),
      'legs': legs
          .map(
            (leg) => {
              'index': leg.index,
              'steps': leg.steps.map((s) => s.toJson()).toList(),
            },
          )
          .toList(),
    };
  }
}

class IndoorMapFocusResult {
  const IndoorMapFocusResult({
    this.mapName,
    this.floors = const [],
    this.currentFloor,
  });

  final String? mapName;
  final List<IndoorFloor> floors;
  final IndoorFloor? currentFloor;
}
