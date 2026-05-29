import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/indoor_map_models.dart';
import '../../providers/indoor_map_providers.dart';
import '../../utils/app_logger.dart';

class SearchOverlay extends ConsumerStatefulWidget {
  const SearchOverlay({super.key});

  @override
  ConsumerState<SearchOverlay> createState() => _SearchOverlayState();
}

class _SearchOverlayState extends ConsumerState<SearchOverlay> {
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
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
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
                      hintText: 'Search a store or place…',
                      hintStyle: TextStyle(color: Colors.grey, fontSize: 14),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.symmetric(vertical: 12),
                    ),
                    onSubmitted: (query) {
                      appLog('UI', 'Search submitted: "$query"');
                      ref.read(indoorMapProvider.notifier).submitSearch(query);
                    },
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                if (_controller.text.isNotEmpty)
                  IconButton(
                    icon: Icon(Icons.close, color: Colors.grey.shade500, size: 20),
                    onPressed: () {
                      _controller.clear();
                      ref.read(indoorMapProvider.notifier).submitSearch('');
                      setState(() {});
                    },
                  ),
              ],
            ),
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

  final List<IndoorLocation> results;
  final ValueChanged<IndoorLocation> onLocationSelected;

  @override
  Widget build(BuildContext context) {
    if (results.isEmpty) {
      return const SizedBox.shrink();
    }

    return Positioned(
      top: 118,
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
              padding: const EdgeInsets.symmetric(vertical: 4),
              itemCount: results.length,
              separatorBuilder: (_, __) => Divider(
                height: 1,
                color: Colors.white.withValues(alpha: 0.08),
              ),
              itemBuilder: (context, index) {
                final location = results[index];
                return ListTile(
                  dense: true,
                  leading: const Icon(
                    Icons.flag_outlined,
                    color: Colors.redAccent,
                    size: 20,
                  ),
                  title: Text(
                    location.name,
                    style: const TextStyle(color: Colors.white),
                  ),
                  subtitle: Text(
                    location.floorName ?? '',
                    style: TextStyle(color: Colors.grey.shade400, fontSize: 12),
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
