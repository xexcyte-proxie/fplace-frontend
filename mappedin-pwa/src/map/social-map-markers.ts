import type { MapData, MapView } from "@mappedin/mappedin-js";

import type { AppState, SectionHeatEntry } from "../types";
import { appLog } from "../utils/logger";
import { buildSectionLocationIndex } from "../forum/domain/section-locations";
import {
  collectLocationAnchors,
  slugifyLocationName,
  type LocationAnchor,
} from "./location-anchors";
import {
  heatVisualState,
  renderSocialMapMarkerHtml,
  type SocialMarkerCategory,
  type SocialMarkerModel,
  type SocialMarkerVisualState,
} from "./social-map-marker-html";
import { resolveSocialMarkerLiveSource } from "./social-marker-live-source";
import {
  clientPointToCanvasPoint,
  pickNearestScreenAnchorId,
  resolveMapCanvasRect,
} from "./map-tap-screen";
import {
  socialMarkerSyncInputsFromState,
  socialMarkerSyncInputsUnchanged,
  type SocialMarkerSyncInputs,
} from "./social-marker-sync-inputs";
import { serializeCoordinate } from "../utils/route-helpers";

type MarkerHandle = { remove?: () => void };

interface InstalledMarker {
  anchorId: string;
  handle: MarkerHandle;
  html: string;
}

export type LocationCardSelection = {
  locationId: string;
  name: string;
  anchor: unknown;
};

export type LocationCardSelectHandler = (
  selection: LocationCardSelection,
) => void;

export class SocialMapMarkerService {
  private markers: InstalledMarker[] = [];
  private anchors: LocationAnchor[] = [];
  private anchorById = new Map<string, LocationAnchor>();
  private viewedLocationIds = new Set<string>();
  private mapContainer: HTMLElement | null = null;
  private latestState: AppState | null = null;
  private heatReceivedAt: number | null = null;
  private heatDisconnected = false;
  private freshnessTimer: ReturnType<typeof setInterval> | null = null;
  private lastMarkerInputs: SocialMarkerSyncInputs | null = null;
  private installed = false;
  private disposed = false;

  constructor(
    private readonly mapView: MapView,
    private readonly mapData: MapData,
    private readonly onLocationSelect: LocationCardSelectHandler,
  ) {}

  install(mapContainer: HTMLElement): number {
    if (this.disposed || this.installed) return this.markers.length;
    this.mapContainer = mapContainer;
    this.anchors = collectLocationAnchors(this.mapData);
    this.anchorById = new Map(this.anchors.map((entry) => [entry.id, entry]));
    this.installed = true;
    const count = this.renderAll(this.latestState);
    this.freshnessTimer = setInterval(() => {
      if (this.latestState) this.renderAll(this.latestState);
    }, 30_000);
    return count;
  }

  syncState(state: AppState): void {
    if (this.disposed) return;
    const previous = this.latestState;
    if (state.selectedVenueId !== previous?.selectedVenueId) {
      this.viewedLocationIds.clear();
      this.heatReceivedAt = null;
      this.heatDisconnected = false;
    }
    if (!state.sectionHeatmapActive) {
      this.heatReceivedAt = null;
      this.heatDisconnected = false;
    } else if (state.sectionHeatmap !== previous?.sectionHeatmap) {
      this.heatReceivedAt = Date.now();
      this.heatDisconnected = false;
    }
    if (state.venueLiveStatus !== "connected") this.heatDisconnected = true;
    this.latestState = state;
    if (!this.installed) return;
    const nextInputs = socialMarkerSyncInputsFromState(state);
    if (socialMarkerSyncInputsUnchanged(this.lastMarkerInputs, nextInputs)) return;
    this.lastMarkerInputs = nextInputs;
    this.renderAll(state);
  }

  /** Re-collect anchors after Mappedin language packs update location names. */
  refreshForLanguageChange(state: AppState | null = this.latestState): void {
    if (!this.installed || !this.mapContainer) return;
    this.anchors = collectLocationAnchors(this.mapData);
    this.anchorById = new Map(this.anchors.map((entry) => [entry.id, entry]));
    this.clearMarkers();
    this.lastMarkerInputs = null;
    this.renderAll(state);
  }

  destroy(): void {
    this.disposed = true;
    this.clearMarkers();
    this.mapContainer = null;
    this.installed = false;
    if (this.freshnessTimer !== null) clearInterval(this.freshnessTimer);
    this.freshnessTimer = null;
    this.latestState = null;
    this.lastMarkerInputs = null;
  }

  /**
   * Open a location when the tap is near a pill's map anchor on screen.
   * Uses Mappedin screen projection (not DOM boxes) so HTML transforms cannot
   * send a left-edge tap to a right-edge location.
   */
  trySelectAtClientPoint(clientX: number, clientY: number): boolean {
    if (!this.installed || !this.mapContainer) return false;

    const canvasPoint = clientPointToCanvasPoint(
      clientX,
      clientY,
      resolveMapCanvasRect(this.mapContainer),
    );
    if (!canvasPoint) return false;

    const projected = this.anchors.map((entry) => ({
      id: entry.id,
      screen: this.screenPointForAnchor(entry),
    }));
    const anchorId = pickNearestScreenAnchorId(
      projected,
      canvasPoint.x,
      canvasPoint.y,
    );
    if (!anchorId) return false;

    const entry = this.anchorById.get(anchorId);
    if (!entry) return false;

    this.viewedLocationIds.add(entry.locationId);
    this.onLocationSelect({
      locationId: entry.locationId,
      name: entry.name,
      anchor: entry.anchor,
    });
    return true;
  }

  private screenPointForAnchor(
    entry: LocationAnchor,
  ): { x: number; y: number } | null {
    try {
      const anchor = entry.anchor;
      if (anchor && typeof anchor === "object" && "center" in anchor) {
        const center = (anchor as { center?: unknown }).center;
        if (center) {
          return (
            this.mapView.getScreenCoordinateFromCoordinate?.(center as never) ??
            null
          );
        }
      }

      const serialized = serializeCoordinate(anchor);
      if (!serialized || !this.mapView.createCoordinate) return null;
      const floor =
        serialized.floorId && serialized.floorId !== "unknown"
          ? this.mapData.getById("floor", serialized.floorId)
          : this.mapView.currentFloor;
      const coordinate = this.mapView.createCoordinate(
        serialized.latitude,
        serialized.longitude,
        floor ?? undefined,
      );
      if (!coordinate) return null;
      return (
        this.mapView.getScreenCoordinateFromCoordinate?.(coordinate) ?? null
      );
    } catch {
      return null;
    }
  }

  private renderAll(state: AppState | null): number {
    if (!this.mapView.Markers?.add) return 0;

    const live = resolveSocialMarkerLiveSource(state);
    const selectedLocationId = state?.socialLocation ?? null;
    const heatmapBySectionId = new Map(
      (state?.sectionHeatmap ?? []).map((entry) => [entry.sectionId, entry]),
    );
    const hasLiveHeatmap = Boolean(state?.sectionHeatmapActive);
    const sectionByLocationId = this.indexSectionsByLocation(
      state?.forumSections ?? [],
    );
    const feedPosts = state?.venueFeedPosts ?? [];
    const heatStale = hasLiveHeatmap && (
      this.heatDisconnected || this.heatReceivedAt === null ||
      Date.now() - this.heatReceivedAt >= 5 * 60_000
    );

    const installedById = new Map(this.markers.map((marker) => [marker.anchorId, marker]));
    for (const entry of this.anchors) {
      const model = this.buildModel(
        entry,
        selectedLocationId,
        heatmapBySectionId,
        hasLiveHeatmap,
        sectionByLocationId,
        feedPosts,
        live.socketLive,
      );
      if (heatStale) {
        model.visualState = "heat-stale";
        model.secondary = "out of date";
      }
      const html = renderSocialMapMarkerHtml(model);
      const existing = installedById.get(entry.id);
      if (existing?.html === html) continue;

      try {
        // Non-interactive + CSS pointer-events:none: Mappedin keeps full pan
        // control. Pill taps use trySelectAtClientPoint screen hit-testing.
        const handle = this.mapView.Markers.add(
          entry.anchor as never,
          html,
        ) as MarkerHandle;
        if (handle) {
          existing?.handle.remove?.();
          this.markers = this.markers.filter((marker) => marker !== existing);
          this.markers.push({ anchorId: entry.id, handle, html });
        }
      } catch (error) {
        appLog(
          "SocialMarkers",
          `Failed: ${entry.name}`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    appLog("SocialMarkers", `Placed ${this.markers.length} marker(s)`);
    return this.markers.length;
  }

  private indexSectionsByLocation(
    sections: AppState["forumSections"],
  ): Map<string, number> {
    return buildSectionLocationIndex(sections);
  }

  private buildModel(
    entry: LocationAnchor,
    selectedLocationId: string | null,
    heatmapBySectionId: Map<number, SectionHeatEntry>,
    hasLiveHeatmap: boolean,
    sectionByLocationId: Map<string, number>,
    feedPosts: AppState["venueFeedPosts"],
    socketLive: boolean,
  ): SocialMarkerModel {
    const locationId = entry.locationId;
    const sectionId = sectionByLocationId.get(locationId) ?? null;
    const heat =
      sectionId != null ? heatmapBySectionId.get(sectionId) : undefined;

    const locationFeedPosts = feedPosts.filter(
      (post) =>
        post.kind !== "conversation" &&
        (post.locationId === locationId ||
          (sectionId != null && post.locationId === String(sectionId))),
    );
    const count = hasLiveHeatmap
      ? (heat?.postCount ?? 0)
      : locationFeedPosts.length;

    const category = this.resolveCategory(locationFeedPosts, entry.name);
    // "live" is only claimed for real venue-feed data: either the venue
    // WebSocket is connected right now, or a post landed within ~5 minutes.
    const visualState = hasLiveHeatmap
      ? heatVisualState(heat?.priority ?? null, count)
      : this.resolveVisualState(
          locationId,
          locationFeedPosts,
          locationFeedPosts.length,
          { allowLive: true, socketLive },
        );
    const selected = selectedLocationId === locationId;
    const previewPost = locationFeedPosts[0]
      ? {
          id: locationFeedPosts[0].id,
          author: locationFeedPosts[0].author,
          initials: locationFeedPosts[0].initials,
          avatarColor: locationFeedPosts[0].avatarColor,
          location: locationFeedPosts[0].location,
          locationId: locationFeedPosts[0].locationId,
          timeAgo: locationFeedPosts[0].timeAgo,
          category: "vibe" as const,
          categoryLabel: locationFeedPosts[0].feedType,
          content: locationFeedPosts[0].content,
          upvotes: locationFeedPosts[0].upvotes,
          comments: locationFeedPosts[0].comments,
        }
      : undefined;

    return {
      anchorId: entry.id,
      locationId,
      label: entry.name,
      count,
      category,
      visualState,
      secondary: this.resolveSecondary(visualState, locationFeedPosts),
      selected,
      previewPost,
    };
  }

  private resolveCategory(
    feedPosts: AppState["venueFeedPosts"],
    name: string,
  ): SocialMarkerCategory | null {
    if (feedPosts.length) {
      const feedSlug = feedPosts[0]?.feedType ?? "";
      if (feedSlug === "conversation") {
        // Section chat has no post category; fall through to name heuristics.
      } else {
        if (feedSlug.includes("food")) return "food";
        if (feedSlug.includes("lines")) return "lines";
        if (feedSlug.includes("vibe") || feedSlug.includes("hype"))
          return "vibe";
        if (feedSlug === "help") return "lines";
      }
    }

    const slug = slugifyLocationName(name);
    if (
      slug.includes("food") ||
      slug.includes("restaurant") ||
      slug.includes("stall")
    ) {
      return "food";
    }
    if (
      slug.includes("gate") ||
      slug.includes("entrance") ||
      slug.includes("washroom")
    ) {
      return "lines";
    }
    if (slug.includes("section") || slug.includes("store")) {
      return "vibe";
    }
    return null;
  }

  private resolveVisualState(
    locationId: string,
    posts: Array<{
      timeAgo: string;
      upvotes: number;
      comments: number;
      createdAt?: string;
    }>,
    knownCount: number | undefined,
    liveness: { allowLive: boolean; socketLive?: boolean },
  ): SocialMarkerVisualState {
    if (this.viewedLocationIds.has(locationId) && !posts.length) {
      return "viewed";
    }

    if (
      liveness.allowLive &&
      posts.length &&
      (liveness.socketLive || posts.some((post) => this.isRecent(post)))
    ) {
      return "live";
    }

    const totalEngagement = posts.reduce(
      (sum, post) => sum + post.upvotes + post.comments,
      0,
    );
    if (totalEngagement >= 40 || (knownCount ?? 0) >= 30) {
      return "trending";
    }

    if (posts.length && !this.viewedLocationIds.has(locationId)) {
      return "new";
    }

    if (this.viewedLocationIds.has(locationId)) {
      return "viewed";
    }

    return "default";
  }

  private resolveSecondary(
    visualState: SocialMarkerVisualState,
    posts: Array<{ timeAgo: string }>,
  ): string {
    switch (visualState) {
      case "heat-high":
        return "hot";
      case "heat-medium":
        return "warm";
      case "heat-low":
        return "mild";
      case "heat-neutral":
        return "quiet";
      case "live":
        return "live";
      case "trending":
        return "trending";
      case "new":
        return "new";
      case "viewed":
        return posts[0]?.timeAgo ?? "";
      default:
        return "";
    }
  }

  /** Recent = posted within the last 5 minutes (prefer the real timestamp). */
  private isRecent(post: { timeAgo: string; createdAt?: string }): boolean {
    if (post.createdAt) {
      const created = new Date(post.createdAt).getTime();
      if (!Number.isNaN(created)) {
        return Date.now() - created <= 5 * 60 * 1000;
      }
    }
    if (/just now/i.test(post.timeAgo)) return true;
    const match = post.timeAgo.match(/^(\d+)\s*m/i);
    if (!match) return false;
    return Number(match[1]) <= 5;
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
  const service = new SocialMapMarkerService(
    mapView,
    mapData,
    onLocationSelect,
  );
  window.setTimeout(() => {
    try {
      service.install(mapContainer);
    } catch (error) {
      appLog("SocialMarkers", "Install failed", error);
    }
  }, 0);
  return service;
}
