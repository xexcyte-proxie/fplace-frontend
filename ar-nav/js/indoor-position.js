/**
 * Mappedin / PWA indoor position fusion helpers for AR navigation.
 */
(function () {
  const VENUE_SOURCES = new Set(['pwa', 'mappedin', 'flutter', 'simulator']);

  window.FplacesIndoorPosition = {
    isVenueSource(source) {
      return VENUE_SOURCES.has(source || '');
    },

    isVenueFeed(cfg, positionSource, lastExternalAt) {
      const staleMs = cfg.externalPositionTimeoutMs ?? 3500;
      if (!this.isVenueSource(positionSource)) return false;
      if (!lastExternalAt) return true;
      return performance.now() - lastExternalAt <= staleMs;
    },

    isTrustworthy(lastPosition, positionSource) {
      if (!this.isVenueSource(positionSource)) return false;
      const accuracy = lastPosition?.accuracy;
      return accuracy == null || accuracy <= 35;
    },

    offRouteThresholdMeters(lastPosition, positionSource) {
      const accuracy = lastPosition?.accuracy ?? 15;
      if (this.isVenueSource(positionSource)) {
        return Math.max(10, accuracy * 1.15);
      }
      return Math.max(25, accuracy * 2);
    },

    snapOptions(lastPosition, positionSource) {
      return {
        floorId: lastPosition?.floorId || null,
        preferVenue: this.isVenueSource(positionSource),
      };
    },
  };
})();
