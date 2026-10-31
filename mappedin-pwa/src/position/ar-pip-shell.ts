import type { ArPresentation } from './bridge';
import { appLog } from '../utils/logger';

const PIP_STORAGE_KEY = 'fplaces.ar.pipPosition';
const PIP_FALLBACK_WIDTH = 152;
const PIP_FALLBACK_HEIGHT = 216;

interface PipPosition {
  x: number;
  y: number;
}

let pipPosition: PipPosition | null = loadPipPosition();
let dragInstalled = false;

function loadPipPosition(): PipPosition | null {
  try {
    const raw = sessionStorage.getItem(PIP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PipPosition;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function savePipPosition(pos: PipPosition): void {
  pipPosition = pos;
  try {
    sessionStorage.setItem(PIP_STORAGE_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

function clearPipPosition(): void {
  pipPosition = null;
  try {
    sessionStorage.removeItem(PIP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function getShell(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.querySelector('#ar-pip-shell');
}

/** Presentation of the parent's already-confirmed arrival; never computes progress. */
export function setArArrivalPresentation(arrived: boolean): void {
  const shell = getShell();
  if (!shell) return;
  if (arrived) hideArBootOverlay();
  if (shell.classList?.contains('ar-pip-shell--arrived') !== arrived) shell.classList?.toggle('ar-pip-shell--arrived', arrived);
  const indicator = shell.querySelector?.<HTMLElement>('#ar-pip-arrival');
  if (indicator && indicator.hidden === arrived) indicator.hidden = !arrived;
  const drag = shell.querySelector?.<HTMLElement>('.ar-pip-drag-layer');
  if (drag) {
    const tabIndex = arrived ? 0 : -1;
    if (drag.tabIndex !== tabIndex) drag.tabIndex = tabIndex;
    const hidden = arrived ? 'false' : 'true';
    if (drag.getAttribute('aria-hidden') !== hidden) drag.setAttribute('aria-hidden', hidden);
    if (arrived) {
      if (drag.getAttribute('role') !== 'button') drag.setAttribute('role', 'button');
      if (drag.getAttribute('aria-label') !== 'Arrived. Expand Live View') drag.setAttribute('aria-label', 'Arrived. Expand Live View');
    }
  }
}

function getFrame(): HTMLIFrameElement | null {
  return document.querySelector('#ar-frame');
}

function getBootOverlay(): HTMLElement | null {
  return document.querySelector('#ar-boot-overlay');
}

let bootOverlayTimer: ReturnType<typeof setTimeout> | null = null;

export function showArBootOverlay(): void {
  const overlay = getBootOverlay();
  if (!overlay) return;
  overlay.hidden = false;
}

export function hideArBootOverlay(): void {
  if (bootOverlayTimer != null) {
    window.clearTimeout(bootOverlayTimer);
    bootOverlayTimer = null;
  }
  const overlay = getBootOverlay();
  if (overlay) overlay.hidden = true;
}

export function armArBootOverlayFallback(onTimeout: () => void, timeoutMs = 6000): void {
  if (bootOverlayTimer != null) window.clearTimeout(bootOverlayTimer);
  bootOverlayTimer = window.setTimeout(() => {
    bootOverlayTimer = null;
    onTimeout();
  }, timeoutMs);
}

function pipSize(shell: HTMLElement): { width: number; height: number } {
  const rect = shell.getBoundingClientRect();
  return {
    width: rect.width || shell.offsetWidth,
    height: rect.height || shell.offsetHeight,
  };
}

function clampPip(x: number, y: number, width: number, height: number): PipPosition {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, x)),
    y: Math.min(maxY, Math.max(margin, y)),
  };
}

function placeDefaultPip(shell: HTMLElement, width: number, height: number): PipPosition {
  shell.style.left = 'auto';
  shell.style.right = 'var(--ar-pip-gap)';
  shell.style.top = 'var(--ar-pip-stack-top)';
  shell.style.bottom = 'auto';
  void shell.offsetWidth;
  const rect = shell.getBoundingClientRect();
  return clampPip(rect.left, rect.top, width, height);
}

function measuredPipSize(shell: HTMLElement): { width: number; height: number } {
  const previousTransition = shell.style.transition;
  shell.style.transition = 'none';
  void shell.offsetWidth;
  const size = pipSize(shell);
  shell.style.transition = previousTransition;
  return {
    width: size.width || PIP_FALLBACK_WIDTH,
    height: size.height || PIP_FALLBACK_HEIGHT,
  };
}

export function applyPipShellLayout(mode: ArPresentation): void {
  const shell = getShell();
  const frame = getFrame();
  if (!shell || !frame) return;

  const map = document.getElementById('mappedin-map');
  map?.classList.toggle('is-ar-paused', mode === 'fullscreen');

  shell.classList.remove('ar-pip-shell--fullscreen', 'ar-pip-shell--minimized');
  shell.hidden = mode === 'closed';

  if (mode === 'closed') {
    // Keep the Live View document so 8th Wall / THREE stay warm for the next open.
    // Camera + XR are parked by the parent before this layout runs.
    hideArBootOverlay();
    clearPipPosition();
    shell.style.left = '';
    shell.style.top = '';
    shell.style.right = '';
    shell.style.bottom = '';
    return;
  }

  shell.hidden = false;
  frame.hidden = false;

  if (mode === 'fullscreen') {
    shell.classList.add('ar-pip-shell--fullscreen');
    shell.style.left = '';
    shell.style.top = '';
    shell.style.right = '';
    shell.style.bottom = '';
    return;
  }

  shell.classList.add('ar-pip-shell--minimized');
  const { width, height } = measuredPipSize(shell);
  const clamped = pipPosition
    ? clampPip(pipPosition.x, pipPosition.y, width, height)
    : placeDefaultPip(shell, width, height);
  shell.style.left = `${clamped.x}px`;
  shell.style.top = `${clamped.y}px`;
  shell.style.right = 'auto';
  shell.style.bottom = 'auto';
  savePipPosition(clamped);
}

export function isArShellVisible(): boolean {
  const shell = getShell();
  const frame = getFrame();
  if (!shell || shell.hidden || !frame?.contentWindow) return false;
  const src = frame.src;
  return src !== '' && src !== 'about:blank';
}

export function installArPipShell(handlers: {
  maximizeAr(): void;
  closeAr(): void;
}): void {
  const shell = getShell();
  if (!shell || dragInstalled) return;
  const dragLayer = shell.querySelector('.ar-pip-drag-layer');
  if (!dragLayer) return;
  dragInstalled = true;
  dragLayer.addEventListener('keydown', ((event: KeyboardEvent) => {
    if (!shell.classList.contains('ar-pip-shell--minimized') || !shell.classList.contains('ar-pip-shell--arrived')) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handlers.maximizeAr(); }
  }) as EventListener);

  shell.querySelector('#ar-pip-expand')?.addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.maximizeAr();
  });

  shell.querySelector('#ar-pip-close')?.addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.closeAr();
  });

  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let moved = false;

  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId || !shell.classList.contains('ar-pip-shell--minimized')) {
      return;
    }
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
    const { width, height } = pipSize(shell);
    const next = clampPip(originX + dx, originY + dy, width, height);
    shell.style.left = `${next.x}px`;
    shell.style.top = `${next.y}px`;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;

    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);

    if (shell.classList.contains('ar-pip-shell--minimized')) {
      const rect = shell.getBoundingClientRect();
      savePipPosition({ x: rect.left, y: rect.top });
      if (!moved) {
        handlers.maximizeAr();
      }
    }

    pointerId = null;
    moved = false;
  };

  dragLayer.addEventListener('pointerdown', ((event: PointerEvent) => {
    if (!shell.classList.contains('ar-pip-shell--minimized')) return;

    pointerId = event.pointerId;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    const rect = shell.getBoundingClientRect();
    originX = rect.left;
    originY = rect.top;
    (dragLayer as HTMLElement).setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    event.preventDefault();
  }) as EventListener);

  window.addEventListener('resize', () => {
    if (!shell.classList.contains('ar-pip-shell--minimized') || shell.hidden) return;
    const { width, height } = measuredPipSize(shell);
    const rect = shell.getBoundingClientRect();
    const clamped = clampPip(rect.left, rect.top, width, height);
    shell.style.left = `${clamped.x}px`;
    shell.style.top = `${clamped.y}px`;
    savePipPosition(clamped);
  });

  appLog('AR', 'PiP shell drag installed');
}
