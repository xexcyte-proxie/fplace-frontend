import type { SectionHeatPriority, SocialPost } from '../types';

export type SocialMarkerCategory = 'vibe' | 'lines' | 'food';
export type SocialMarkerVisualState =
  | 'default'
  | 'live'
  | 'trending'
  | 'new'
  | 'viewed'
  | 'heat-high'
  | 'heat-medium'
  | 'heat-low'
  | 'heat-neutral';

export interface SocialMarkerModel {
  anchorId: string;
  locationId: string;
  label: string;
  count: number;
  category: SocialMarkerCategory | null;
  visualState: SocialMarkerVisualState;
  secondary: string;
  selected: boolean;
  previewPost?: SocialPost;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function shortenLabel(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 16) return trimmed;
  return trimmed.replace(/^Store\s+/i, 'St ').slice(0, 16);
}

export function heatVisualState(
  priority: SectionHeatPriority | null,
): SocialMarkerVisualState {
  if (!priority) return 'heat-neutral';
  return `heat-${priority}`;
}

function classNames(model: SocialMarkerModel): string {
  const classes = ['social-map-marker', 'social-map-marker--default'];
  if (model.selected) classes.push('social-map-marker--selected');
  if (model.category) classes.push(`social-map-marker--${model.category}`);
  if (model.visualState.startsWith('heat-')) {
    classes.push(`social-map-marker--${model.visualState}`);
  } else if (model.visualState === 'viewed') {
    classes.push('social-map-marker--viewed');
  } else if (model.visualState === 'trending') {
    classes.push('social-map-marker--trending');
  } else if (model.visualState === 'new') {
    classes.push('social-map-marker--new');
  } else {
    classes.push('social-map-marker--live');
  }
  return classes.join(' ');
}

function previewHtml(model: SocialMarkerModel): string {
  if (!model.selected || !model.previewPost) return '';
  const post = model.previewPost;
  return `
    <div class="social-map-marker__preview">
      <div class="social-map-marker__avatar-stack">
        <span class="social-map-marker__avatar" style="--sm-avatar-bg:${escapeHtml(post.avatarColor)}">${escapeHtml(post.initials)}</span>
      </div>
      <p class="social-map-marker__preview-snippet">${escapeHtml(post.content)}</p>
      <div class="social-map-marker__preview-meta">${escapeHtml(post.timeAgo)} · ${escapeHtml(post.categoryLabel)}</div>
    </div>
  `;
}

function leadingIcon(model: SocialMarkerModel): string {
  if (
    model.visualState === 'trending' ||
    model.visualState === 'heat-high'
  ) {
    return '<span class="social-map-marker__trend-icon" aria-hidden="true">🔥</span>';
  }
  return '<span class="social-map-marker__status-dot" aria-hidden="true"></span>';
}

function secondaryLine(model: SocialMarkerModel): string {
  const text = model.secondary || 'live';
  return `<div class="social-map-marker__secondary">${escapeHtml(text)}</div>`;
}

export function renderSocialMapMarkerHtml(model: SocialMarkerModel): string {
  const label = shortenLabel(model.label);
  const aria = `${label}, ${model.count} posts${model.secondary ? `, ${model.secondary}` : ''}`;

  return `
    <div
      class="${classNames(model)}"
      style="transform:translate(-50%,-100%);overflow:visible;"
    >
      ${previewHtml(model)}
      <div class="social-map-marker__stage">
        <div
          class="social-map-marker__halo"
          aria-hidden="true"
          style="width:72px;height:72px;border-radius:50%;background:rgba(237,196,168,0.52);"
        ></div>
        <div
          class="social-map-marker__card"
          data-anchor-id="${escapeHtml(model.anchorId)}"
          data-social-location="${escapeHtml(model.locationId)}"
          role="button"
          tabindex="0"
          aria-label="${escapeHtml(aria)}"
        >
          ${leadingIcon(model)}
          <div class="social-map-marker__body">
            <div class="social-map-marker__primary">
              <span class="social-map-marker__location">${escapeHtml(label)}</span>
              <span class="social-map-marker__sep" aria-hidden="true">·</span>
              <span class="social-map-marker__metric">${model.count}</span>
            </div>
            ${secondaryLine(model)}
          </div>
        </div>
      </div>
      <div class="social-map-marker__anchor" aria-hidden="true"></div>
    </div>
  `;
}
