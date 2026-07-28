const NARROW_MAX_WIDTH = 600;
const DESKTOP_X_TICKS = 12;
const DESKTOP_X_FONT = 10;
const DESKTOP_Y_FONT = 10;
const NARROW_X_TICKS = 6;
const NARROW_X_FONT = 9;
const NARROW_Y_FONT = 9;

export function chartTickScale(width) {
  const narrow = typeof width === "number" && width <= NARROW_MAX_WIDTH;
  return {
    xMaxTicks: narrow ? NARROW_X_TICKS : DESKTOP_X_TICKS,
    xFont: narrow ? NARROW_X_FONT : DESKTOP_X_FONT,
    yFont: narrow ? NARROW_Y_FONT : DESKTOP_Y_FONT,
  };
}

export function modelHeaderLabels(labelTexts) {
  if (!Array.isArray(labelTexts)) return [];
  const out = [];
  for (let i = 0; i < labelTexts.length; i++) {
    out.push(String(labelTexts[i] ?? "").trim());
  }
  return out;
}