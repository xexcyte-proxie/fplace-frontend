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

class IndoorRouteStep {
  const IndoorRouteStep({required this.instruction});

  final String instruction;

  factory IndoorRouteStep.fromJson(Map<String, dynamic> json) {
    return IndoorRouteStep(
      instruction: json['instruction']?.toString() ?? 'Continue',
    );
  }
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
  });

  final List<IndoorRouteLeg> legs;
  final String? destinationName;

  factory IndoorRoute.fromJson(Map<String, dynamic> json) {
    final rawLegs = json['legs'];
    final legs = rawLegs is List
        ? rawLegs
            .whereType<Map>()
            .map((e) => IndoorRouteLeg.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <IndoorRouteLeg>[];

    return IndoorRoute(
      legs: legs,
      destinationName: json['destinationName']?.toString(),
    );
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
