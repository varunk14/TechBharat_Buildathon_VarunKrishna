// Geometry for cropping a captured screenshot to a user-drawn region. Pure and
// unit tested. captureVisibleTab returns an image at the display's device pixel
// ratio, while the drag rectangle is measured in CSS pixels, so every source
// coordinate is scaled by devicePixelRatio. Getting this wrong offsets the crop
// on any retina or zoomed display.

// Smallest accepted region, in CSS pixels. A stray click produces a tiny
// rectangle that should be ignored rather than captured.
export const MIN_REGION_PX = 20;

// A rectangle dragged up or to the left arrives with negative width or height.
// Normalise so the origin is the top-left corner and both dimensions positive.
export function normalizeRect({ x, y, width, height }) {
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

// Convert a CSS-pixel rectangle to source coordinates in the screenshot's device
// pixels, ready to pass to drawImage/OffscreenCanvas.
export function sourceRect(rect, dpr) {
  const r = normalizeRect(rect);
  return {
    sx: Math.round(r.x * dpr),
    sy: Math.round(r.y * dpr),
    sw: Math.round(r.width * dpr),
    sh: Math.round(r.height * dpr),
  };
}

export function isValidRect(rect, minSize = MIN_REGION_PX) {
  const r = normalizeRect(rect);
  return r.width >= minSize && r.height >= minSize;
}
