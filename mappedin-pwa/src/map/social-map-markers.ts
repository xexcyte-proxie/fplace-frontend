import type { MapData, MapView } from '@mappedin/mappedin-js';

import type { AppState, SectionHeatEntry, SocialPost } from '../types';
import { appLog } from '../utils/logger';
import {
  INITIAL_SOCIAL_POSTS,
  SOCIAL_LOCATIONS,
  SOCIAL_LOCATIONS_BY_ID,
} from '../ui/social-data';
import {
  collectLocationAnchors,
  slugifyLocationName,
  type LocationAnchor,
} from './location-anchors';
import {
  heatVisualState,
  renderSocialMapMarkerHtml,
  type SocialMarkerCategory,
  type SocialMarkerModel,
  type SocialMarkerVisualState,
} from './social-map-marker-html';

type MarkerHandle = { remove?: () => void };

interface InstalledMarker {
  anchorId: string;
  handle: MarkerHandle;
}

export type LocationCardSelection = {
  locationId: string;
  name: string;
  anchor: unknown;
};

export type LocationCardSelectHandler = (selection: LocationCardSelection) => void;

export class SocialMapMarkerService {
  private markers: InstalledMarker[] = [];
  private anchors: LocationAnchor[] = [];
  private anchorById = new Map<string, LocationAnchor>();
  private viewedLocationIds = new Set<string>();
  private mapContainer: HTMLElement | null = null;
  private cardClickHandler: ((event: Event) => void) | null = null;
  private lastMarkerSyncKey = '';
  private installed = false;

  constructor(
    private readonly mapView: MapView,
    private readonly mapData: MapData,
    private readonly onLocationSelect: LocationCardSelectHandler,
  ) {}

  install(mapContainer: HTMLElement): number {
    this.mapContainer = mapContainer;
    this.anchors = collectLocationAnchors(this.mapData);
    this.anchorById = new Map(this.anchors.map((entry) => [entry.id, entry]));
    this.wireCardClickDelegation(mapContainer);
    this.installed = true;
    const count = this.renderAll(null);
    this.lastMarkerSyncKey = this.markerSyncKey(null, [], [], false, [], []);
    return count;
  }

  syncState(state: AppState): void {
    if (!this.installed) return;

    const syncKey = this.markerSyncKey(
      state.socialLocation,
      state.socialPosts,
      state.sectionHeatmap,
      state.sectionHeatmapActive,
      state.forumSections,
      state.venueFeedPosts,
    );
    if (syncKey === this.lastMarkerSyncKey) return;

    this.lastMarkerSyncKey = syncKey;
    this.renderAll(state);
  }

  /** Re-collect anchors after Mappedin language packs update location names. */
  refreshForLanguageChange(state: AppState | null): void {
    if (!this.installed || !this.mapContainer) return;
    this.anchors = collectLocationAnchors(this.mapData);
    this.anchorById = new Map(this.anchors.map((entry) => [entry.id, entry]));
    this.lastMarkerSyncKey = '';
    this.renderAll(state);
  }

  destroy(): void {
    this.clearMarkers();
    if (this.mapContainer && this.cardClickHandler) {
      this.mapContainer.removeEventListener('click', this.cardClickHandler, true);
    }
    this.cardClickHandler = null;
    this.mapContainer = null;
    this.installed = false;
    this.lastMarkerSyncKey = '';
  }

  private markerSyncKey(
    socialLocation: string | null,
    socialPosts: SocialPost[],
    sectionHeatmap: SectionHeatEntry[],
    sectionHeatmapActive: boolean,
    forumSections: AppState['forumSections'],
    venueFeedPosts: AppState['venueFeedPosts'],
  ): string {
    const posts = socialPosts.length ? socialPosts : INITIAL_SOCIAL_POSTS;
    const postKey = posts.map((post) => `${post.id}:${post.upvotes}`).join('|');
    const feedKey = venueFeedPosts
      .map((post) => `${post.id}:${post.upvotes}`)
      .join('|');
    const heatKey = sectionHeatmap
      .map((entry) => `${entry.sectionId}:${entry.postCount}:${entry.priority}`)
      .join('|');
    const sectionKey = forumSections.map((section) => section.id).join(',');
    return `${socialLocation ?? ''}::${postKey}::${feedKey}::${sectionHeatmapActive}:${heatKey}::${sectionKey}`;
  }

  private wireCardClickDelegation(mapContainer: HTMLElement): void {
    if (this.cardClickHandler) return;

    this.cardClickHandler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const card = target.closest<HTMLElement>('.social-map-marker__card[data-anchor-id]');
      if (!card) return;

      event.stopPropagation();
      event.preventDefault();

      const anchorId = card.dataset.anchorId;
      if (!anchorId) return;

      const entry = this.anchorById.get(anchorId);
      if (!entry) return;

      const locationId = this.resolveLocationId(entry.name);
      this.viewedLocationIds.add(locationId);
      this.onLocationSelect({
        locationId,
        name: entry.name,
        anchor: entry.anchor,
      });
    };

    mapContainer.addEventListener('click', this.cardClickHandler, true);
  }

  private renderAll(state: AppState | null): number {
    this.clearMarkers();
    if (!this.mapView.Markers?.add) return 0;

    const socialPosts = state?.socialPosts?.length
      ? state.socialPosts
      : INITIAL_SOCIAL_POSTS;
    const selectedLocationId = state?.socialLocation ?? null;
    const heatmapBySectionId = new Map(
      (state?.sectionHeatmap ?? []).map((entry) => [entry.sectionId, entry]),
    );
    const hasLiveHeatmap = Boolean(state?.sectionHeatmapActive);
    const sectionByLocationId = this.indexSectionsByLocation(
      state?.forumSections ?? [],
    );
    const feedPosts = state?.venueFeedPosts ?? [];

    for (const entry of this.anchors) {
      const model = this.buildModel(
        entry,
        socialPosts,
        selectedLocationId,
        heatmapBySectionId,
        hasLiveHeatmap,
        sectionByLocationId,
        feedPosts,
      );
      const html = renderSocialMapMarkerHtml(model);

      try {
        const handle = this.mapView.Markers.add(
          entry.anchor as never,
          html,
        ) as MarkerHandle;
        if (handle) {
          this.markers.push({ anchorId: entry.id, handle });
        }
      } catch (error) {
        appLog(
          'SocialMarkers',
          `Failed: ${entry.name}`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    appLog('SocialMarkers', `Placed ${this.markers.length} marker(s)`);
    return this.markers.length;
  }

  private indexSectionsByLocation(
    sections: AppState['forumSections'],
  ): Map<string, number> {
    const map = new Map<string, number>();
    for (const section of sections) {
      map.set(String(section.id), section.id);
      const nameSlug = slugifyLocationName(section.name);
      if (nameSlug) map.set(nameSlug, section.id);
      const codeSlug = section.code ? slugifyLocationName(section.code) : '';
      if (codeSlug) map.set(codeSlug, section.id);
    }
    return map;
  }

  private buildModel(
    entry: LocationAnchor,
    socialPosts: SocialPost[],
    selectedLocationId: string | null,
    heatmapBySectionId: Map<number, SectionHeatEntry>,
    hasLiveHeatmap: boolean,
    sectionByLocationId: Map<string, number>,
    feedPosts: AppState['venueFeedPosts'],
  ): SocialMarkerModel {
    const locationId = this.resolveLocationId(entry.name);
    const sectionId =
      sectionByLocationId.get(locationId) ??
      sectionByLocationId.get(slugifyLocationName(entry.name)) ??
      null;
    const heat = sectionId != null ? heatmapBySectionId.get(sectionId) : undefined;

    const locationFeedPosts = feedPosts.filter(
      (post) =>
        post.locationId === locationId ||
        (sectionId != null && post.locationId === String(sectionId)),
    );
    const locationSocialPosts = socialPosts.filter(
      (post) => post.locationId === locationId,
    );
    const knownLocation = SOCIAL_LOCATIONS_BY_ID[locationId];
    const count = hasLiveHeatmap
      ? (heat?.postCount ?? 0)
      : locationFeedPosts.length ||
        locationSocialPosts.length ||
        knownLocation?.postCount ||
        this.syntheticCount(entry.name);

    const category = this.resolveCategory(
      locationSocialPosts,
      locationFeedPosts,
      entry.name,
    );
    const visualState = hasLiveHeatmap
      ? heatVisualState(heat?.priority ?? null)
      : this.resolveVisualState(
          locationId,
          locationSocialPosts.length ? locationSocialPosts : locationFeedPosts,
          knownLocation?.postCount,
        );
    const selected = selectedLocationId === locationId;
    const previewPost =
      locationSocialPosts[0] ??
      (locationFeedPosts[0]
        ? {
            id: locationFeedPosts[0].id,
            author: locationFeedPosts[0].author,
            initials: locationFeedPosts[0].initials,
            avatarColor: locationFeedPosts[0].avatarColor,
            location: locationFeedPosts[0].location,
            locationId: locationFeedPosts[0].locationId,
            timeAgo: locationFeedPosts[0].timeAgo,
            category: 'vibe' as const,
            categoryLabel: locationFeedPosts[0].feedType,
            content: locationFeedPosts[0].content,
            upvotes: locationFeedPosts[0].upvotes,
            comments: locationFeedPosts[0].comments,
          }
        : undefined);

    return {
      anchorId: entry.id,
      locationId,
      label: entry.name,
      count,
      category,
      visualState,
      secondary: this.resolveSecondary(
        visualState,
        locationSocialPosts,
        category,
      ),
      selected,
      previewPost,
    };
  }

  private resolveLocationId(name: string): string {
    const slug = slugifyLocationName(name);
    if (SOCIAL_LOCATIONS_BY_ID[slug]) return slug;

    const matched = SOCIAL_LOCATIONS.find(
      (location) => slugifyLocationName(location.label) === slug,
    );
    return matched?.id ?? slug;
  }

  private resolveCategory(
    socialPosts: SocialPost[],
    feedPosts: AppState['venueFeedPosts'],
    name: string,
  ): SocialMarkerCategory | null {
    if (socialPosts.length) return socialPosts[0].category;
    const feedSlug = feedPosts[0]?.feedType ?? '';
    if (feedSlug.includes('food')) return 'food';
    if (feedSlug.includes('lines')) return 'lines';
    if (feedSlug.includes('vibe') || feedSlug.includes('hype')) return 'vibe';
    if (feedSlug === 'help') return 'lines';

    const slug = slugifyLocationName(name);
    if (slug.includes('food') || slug.includes('restaurant') || slug.includes('stall')) {
      return 'food';
    }
    if (slug.includes('gate') || slug.includes('entrance') || slug.includes('washroom')) {
      return 'lines';
    }
    if (slug.includes('section') || slug.includes('store')) {
      return 'vibe';
    }
    return null;
  }

  private resolveVisualState(
    locationId: string,
    posts: Array<{ timeAgo: string; upvotes: number; comments: number }>,
    knownCount?: number,
  ): SocialMarkerVisualState {
    if (this.viewedLocationIds.has(locationId) && !posts.length) {
      return 'viewed';
    }

    if (posts.some((post) => this.isRecent(post.timeAgo))) {
      return 'live';
    }

    const totalEngagement = posts.reduce(
      (sum, post) => sum + post.upvotes + post.comments,
      0,
    );
    if (totalEngagement >= 40 || (knownCount ?? 0) >= 30) {
      return 'trending';
    }

    if (posts.length && !this.viewedLocationIds.has(locationId)) {
      return 'new';
    }

    if (this.viewedLocationIds.has(locationId)) {
      return 'viewed';
    }

    return 'default';
  }

  private resolveSecondary(
    visualState: SocialMarkerVisualState,
    posts: SocialPost[],
    _category: SocialMarkerCategory | null,
  ): string {
    switch (visualState) {
      case 'heat-high':
        return 'hot';
      case 'heat-medium':
        return 'warm';
      case 'heat-low':
        return 'mild';
      case 'heat-neutral':
        return 'quiet';
      case 'live':
        return 'live';
      case 'trending':
        return 'trending';
      case 'new':
        return 'new';
      case 'viewed':
        return posts[0]?.timeAgo ?? 'live';
      default:
        return 'live';
    }
  }

  private isRecent(timeAgo: string): boolean {
    const match = timeAgo.match(/^(\d+)\s*m/i);
    if (!match) return false;
    return Number(match[1]) <= 5;
  }

  private syntheticCount(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    }
    return (hash % 12) + 1;
  }

  private clearMarkers(): void {
    for (const marker of this.markers) {
      try {
        marker.handle.remove?.();
      } catch {
        /* ignore */
      }
    }
    this.markers = [];
  }
}

export function scheduleSocialMapMarkers(
  mapView: MapView,
  mapData: MapData,
  mapContainer: HTMLElement,
  onLocationSelect: LocationCardSelectHandler,
): SocialMapMarkerService {
  const service = new SocialMapMarkerService(mapView, mapData, onLocationSelect);
  window.setTimeout(() => {
    try {
      service.install(mapContainer);
    } catch (error) {
      appLog('SocialMarkers', 'Install failed', error);
    }
  }, 0);
  return service;
}
