/**
 * Data: sample mean luma + contrast from the live camera (video or XR canvas).
 */
(function () {
  const SAMPLE_W = 32;
  const SAMPLE_H = 24;
  let scratch = null;
  let scratchCtx = null;

  function ensureScratch() {
    if (scratch) return scratchCtx;
    scratch = document.createElement('canvas');
    scratch.width = SAMPLE_W;
    scratch.height = SAMPLE_H;
    scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
    return scratchCtx;
  }

  function statsFromImageData(data) {
    const pixels = data.length / 4;
    if (!pixels) return null;
    let sum = 0;
    const lumas = new Array(pixels);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      lumas[p] = luma;
      sum += luma;
    }
    const mean = sum / pixels;
    let variance = 0;
    for (let p = 0; p < pixels; p += 1) {
      const d = lumas[p] - mean;
      variance += d * d;
    }
    return {
      luma: mean,
      contrast: Math.sqrt(variance / pixels),
    };
  }

  function sampleFromSource(source, sw, sh) {
    if (!source || !sw || !sh) return null;
    const ctx = ensureScratch();
    if (!ctx) return null;
    try {
      ctx.drawImage(source, 0, 0, SAMPLE_W, SAMPLE_H);
      const image = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);
      return statsFromImageData(image.data);
    } catch {
      return null;
    }
  }

  function isLikelyDesktopCanvasBlack(stats) {
    if (!stats) return false;
    const desktop = !window.FplacesFallbackNav?.isMobileHandset?.();
    return desktop && stats.luma < 4 && stats.contrast < 2;
  }

  function sample() {
    const video = document.getElementById('camera');
    if (video && video.videoWidth > 8 && video.readyState >= 2) {
      const stats = sampleFromSource(video, video.videoWidth, video.videoHeight);
      if (stats && !isLikelyDesktopCanvasBlack(stats) && stats.luma >= 2) {
        return stats;
      }
    }

    // Do not sample the XR WebGL canvas. drawImage/readPixels there is often
    // solid black even when SLAM is tracking, which falsely trips compass mode.
    return null;
  }

  window.FplacesCameraLumaSampler = {
    sample,
  };
})();
