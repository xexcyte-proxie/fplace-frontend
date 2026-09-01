import { buildProductTourCardView } from '../tour/presentation/product-tour-view';
import type { ProductTourStep } from '../tour/domain/entities';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderProductTour(options: {
  step: ProductTourStep;
  index: number;
  total: number;
}): string {
  const view = buildProductTourCardView(options);
  const dots = Array.from({ length: view.total }, (_, i) => {
    const active = i === view.index ? ' is-active' : '';
    return `<span class="product-tour-dot${active}" aria-hidden="true"></span>`;
  }).join('');

  return `
    <div
      class="product-tour${view.targetSelector ? '' : ' product-tour--center'}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-tour-title"
      aria-describedby="product-tour-body"
      data-tour-target="${escapeHtml(view.targetSelector)}"
      data-tour-placement="${escapeHtml(view.placement)}"
    >
      <div class="product-tour-scrim" id="product-tour-scrim"></div>
      <div class="product-tour-spotlight" hidden></div>
      <div class="product-tour-card" data-tour-card>
        <div class="product-tour-card-top">
          <p class="product-tour-step-label">${escapeHtml(view.stepLabel)}</p>
          <button type="button" id="product-tour-skip-btn" class="product-tour-skip">
            Skip
          </button>
        </div>
        <h2 id="product-tour-title" class="product-tour-title">${escapeHtml(view.title)}</h2>
        <p id="product-tour-body" class="product-tour-body">${escapeHtml(view.body)}</p>
        <div class="product-tour-dots" aria-hidden="true">${dots}</div>
        <div class="product-tour-actions">
          ${
            view.showBack
              ? `<button type="button" id="product-tour-back-btn" class="product-tour-back">Back</button>`
              : ''
          }
          <button type="button" id="product-tour-next-btn" class="product-tour-next">
            ${escapeHtml(view.primaryLabel)}
          </button>
        </div>
      </div>
    </div>
  `;
}

const SPOTLIGHT_PAD = 8;
const CARD_GAP = 14;
const VIEW_PAD = 16;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Position the spotlight hole and tooltip against the live target after render.
 */
export function layoutProductTourOverlay(root: HTMLElement): void {
  const overlay = root.querySelector<HTMLElement>('.product-tour');
  if (!overlay) return;

  const spotlight = overlay.querySelector<HTMLElement>('.product-tour-spotlight');
  const card = overlay.querySelector<HTMLElement>('[data-tour-card]');
  if (!spotlight || !card) return;

  const selector = overlay.dataset.tourTarget ?? '';
  const placement = overlay.dataset.tourPlacement ?? 'bottom';
  const target = selector
    ? (root.querySelector<HTMLElement>(selector) ??
      document.querySelector<HTMLElement>(selector))
    : null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardWidth = Math.min(340, vw - VIEW_PAD * 2);
  card.style.width = `${cardWidth}px`;

    if (!target) {
    overlay.classList.add('product-tour--center');
    spotlight.hidden = true;
    card.style.top = `${Math.round(vh / 2)}px`;
    card.style.left = `${Math.round(vw / 2)}px`;
    card.style.transform = 'translate(-50%, -50%)';
    overlay.dataset.tourAligned = 'center';
    return;
  }

  overlay.classList.remove('product-tour--center');
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });

  const rect = target.getBoundingClientRect();
  const radius = Math.min(
    22,
    Math.max(12, parseFloat(getComputedStyle(target).borderRadius) || 16),
  );
  const hole = {
    top: Math.max(0, rect.top - SPOTLIGHT_PAD),
    left: Math.max(0, rect.left - SPOTLIGHT_PAD),
    width: Math.min(vw, rect.width + SPOTLIGHT_PAD * 2),
    height: Math.min(vh, rect.height + SPOTLIGHT_PAD * 2),
  };

  spotlight.hidden = false;
  spotlight.style.top = `${hole.top}px`;
  spotlight.style.left = `${hole.left}px`;
  spotlight.style.width = `${hole.width}px`;
  spotlight.style.height = `${hole.height}px`;
  spotlight.style.borderRadius = `${radius + 4}px`;

  const cardHeight = card.offsetHeight || 180;
  let top = hole.top + hole.height + CARD_GAP;
  let left = hole.left + hole.width / 2 - cardWidth / 2;
  let transform = 'translate(0, 0)';
  let aligned = placement;

  if (placement === 'top') {
    top = hole.top - cardHeight - CARD_GAP;
    if (top < VIEW_PAD + (window.visualViewport?.offsetTop ?? 0)) {
      top = hole.top + hole.height + CARD_GAP;
      aligned = 'bottom';
    }
  } else if (placement === 'left') {
    top = hole.top + hole.height / 2 - cardHeight / 2;
    left = hole.left - cardWidth - CARD_GAP;
    if (left < VIEW_PAD) {
      left = hole.left + hole.width / 2 - cardWidth / 2;
      top = hole.top - cardHeight - CARD_GAP;
      aligned = 'top';
      if (top < VIEW_PAD) {
        top = hole.top + hole.height + CARD_GAP;
        aligned = 'bottom';
      }
    }
  } else if (placement === 'center') {
    top = vh / 2;
    left = vw / 2;
    transform = 'translate(-50%, -50%)';
    aligned = 'center';
  } else {
    if (top + cardHeight > vh - VIEW_PAD) {
      top = hole.top - cardHeight - CARD_GAP;
      aligned = 'top';
      if (top < VIEW_PAD) {
        top = clamp(hole.top + hole.height + CARD_GAP, VIEW_PAD, vh - cardHeight - VIEW_PAD);
        aligned = 'bottom';
      }
    }
  }

  if (aligned !== 'center') {
    left = clamp(left, VIEW_PAD, vw - cardWidth - VIEW_PAD);
    top = clamp(top, VIEW_PAD, Math.max(VIEW_PAD, vh - cardHeight - VIEW_PAD));
  }

  card.style.top = `${Math.round(top)}px`;
  card.style.left = `${Math.round(left)}px`;
  card.style.transform = transform;
  overlay.dataset.tourAligned = aligned;
}
