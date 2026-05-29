import 'package:flutter/material.dart';
import 'package:mapsindoors_mapbox/mapsindoors.dart';

import '../../utils/app_logger.dart';
import '../../bloc/indoor_map_bloc.dart';
import '../../bloc/indoor_map_event.dart';

class SearchOverlay extends StatefulWidget {
  const SearchOverlay({
    super.key,
    required this.bloc,
    required this.onDirectionsPressed,
  });

  final IndoorMapBloc bloc;
  final VoidCallback onDirectionsPressed;

  @override
  State<SearchOverlay> createState() => _SearchOverlayState();
}

class _SearchOverlayState extends State<SearchOverlay> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: 50,
      left: 16,
      right: 16,
      child: SafeArea(
        child: Material(
          color: Colors.transparent,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: const [
                    BoxShadow(color: Colors.black26, blurRadius: 8),
                  ],
                ),
                child: Row(
                  children: [
                    Icon(Icons.search, color: Colors.grey.shade400),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        style: const TextStyle(color: Colors.white, fontSize: 14),
                        decoration: const InputDecoration(
                          hintText: 'Search Sandbox Venue (MapsPeople HQ)...',
                          hintStyle: TextStyle(color: Colors.grey, fontSize: 14),
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                        onSubmitted: (query) {
                          appLog('UI', 'Search submitted: "$query"');
                          widget.bloc.add(SearchSubmitted(query));
                        },
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.directions, color: Colors.blueAccent),
                      onPressed: () {
                        appLog('UI', 'Directions icon tapped in search bar');
                        widget.onDirectionsPressed();
                      },
                      tooltip: 'Generate sample route',
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class SearchResultsPanel extends StatelessWidget {
  const SearchResultsPanel({
    super.key,
    required this.results,
    required this.onLocationSelected,
  });

  final List<MPLocation> results;
  final ValueChanged<MPLocation> onLocationSelected;

  @override
  Widget build(BuildContext context) {
    if (results.isEmpty) {
      return const SizedBox.shrink();
    }

    return Positioned(
      top: 120,
      left: 16,
      right: 16,
      child: SafeArea(
        child: Material(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(12),
          elevation: 8,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 220),
            child: ListView.separated(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: results.length,
              separatorBuilder: (_, __) => Divider(
                height: 1,
                color: Colors.white.withValues(alpha: 0.08),
              ),
              itemBuilder: (context, index) {
                final location = results[index];
                return ListTile(
                  dense: true,
                  title: Text(
                    location.name,
                    style: const TextStyle(color: Colors.white),
                  ),
                  subtitle: Text(
                    location.floorName ?? '',
                    style: TextStyle(color: Colors.grey.shade400),
                  ),
                  onTap: () => onLocationSelected(location),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}
