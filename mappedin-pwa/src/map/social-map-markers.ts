import type { MapData, MapView } from '@mappedin/mappedin-js';

import type { AppState, SocialPost } from '../types';
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
    const count = this.renderAll(null, null);
    this.lastMarkerSyncKey = this.markerSyncKey(null, []);
    return count;
  }

  syncState(state: AppState): void {
    if (!this.installed) return;

    const syncKey = this.markerSyncKey(state.socialLocation, state.socialPosts);
    if (syncKey === this.lastMarkerSyncKey) return;

    this.lastMarkerSyncKey = syncKey;
    this.renderAll(state.socialLocation, state.socialPosts);
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
  ): string {
    const posts = socialPosts.length ? socialPosts : INITIAL_SOCIAL_POSTS;
    const postKey = posts.map((post) => `${post.id}:${post.upvotes}`).join('|');
    return `${socialLocation ?? ''}::${postKey}`;
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

  private renderAll(
    selectedLocationId: string | null,
    socialPosts: SocialPost[] | null,
  ): number {
    this.clearMarkers();
    if (!this.mapView.Markers?.add) return 0;

    const posts = socialPosts?.length ? socialPosts : INITIAL_SOCIAL_POSTS;

    for (const entry of this.anchors) {
      const model = this.buildModel(entry, posts, selectedLocationId);
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

  private buildModel(
    entry: LocationAnchor,
    posts: SocialPost[],
    selectedLocationId: string | null,
  ): SocialMarkerModel {
    const locationId = this.resolveLocationId(entry.name);
    const locationPosts = posts.filter((post) => post.locationId === locationId);
    const knownLocation = SOCIAL_LOCATIONS_BY_ID[locationId];
    const count =
      locationPosts.length ||
      knownLocation?.postCount ||
      this.syntheticCount(entry.name);

    const category = this.resolveCategory(locationPosts, entry.name);
    const visualState = this.resolveVisualState(
      locationId,
      locationPosts,
      knownLocation?.postCount,
    );
    const selected = selectedLocationId === locationId;
    const previewPost = locationPosts[0];

    return {
      anchorId: entry.id,
      locationId,
      label: entry.name,
      count,
      category,
      visualState,
      secondary: this.resolveSecondary(visualState, locationPosts, category),
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
    posts: SocialPost[],
    name: string,
  ): SocialMarkerCategory | null {
    if (posts.length) return posts[0].category;

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
    posts: SocialPost[],
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
