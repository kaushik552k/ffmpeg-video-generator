/**
 * animationBuilder.ts
 *
 * Generates FFmpeg filter_complex fragments for layer animations.
 *
 * ─── ARCHITECTURE ─────────────────────────────────────────────────────────────
 *
 * FADE / ZOOM animations  →  FFmpeg native `fade` filter
 *   The previous implementation used `geq` which evaluates a math expression
 *   PER PIXEL PER FRAME: for 1920×1080 @ 30fps that is ~1.86 BILLION evals
 *   for a 30-second video. The native `fade` filter uses SIMD CPU instructions
 *   (SSE/AVX) to process 16–32 pixels simultaneously — orders of magnitude faster.
 *
 *   Syntax:
 *     fade=type=in:start_time=<sec>:duration=<sec>:alpha=1    ← entrance fade
 *     fade=type=out:start_time=<sec>:duration=<sec>:alpha=1   ← exit fade
 *   Two fades are chained when both in + out are fade-based.
 *
 * SLIDE animations  →  overlay x/y per-frame expressions
 *   The `overlay` filter evaluates x/y once per FRAME (not per pixel), so it
 *   is already efficient. We keep cubic easing expressions here.
 *   `t` = current timestamp in seconds (overlay filter variable)
 *
 * COMBINATION  →  fade can be chained with slide:
 *   If a layer has slideInLeft + fadeOut, we apply:
 *   1. native fade (for the out-fade portion)
 *   2. overlay x expression (for the in-slide portion)
 *
 * ─── SUPPORTED ANIMATIONS ─────────────────────────────────────────────────────
 * in:  fadeIn | slideInLeft | slideInRight | slideInTop | slideInBottom | zoomIn
 * out: fadeOut | slideOutLeft | slideOutRight | slideOutTop | slideOutBottom | zoomOut
 */

import { LayerAnimation } from '../shared/types';

export function buildAnimationExpressions(params: {
  animation: LayerAnimation | undefined;
  x: number;
  y: number;
  w: number;
  h: number;
  fromSec: number;
  toSec: number;
  layerLabel: string;   // e.g. "t0"
  inputLabel: string;   // e.g. "[2:v]"
}): {
  xExpr: string;
  yExpr: string;
  /** Extra filter segments to insert before the overlay, in order. */
  extraFilters: string[];
  /** The label to feed into the overlay filter (may change after fade chain). */
  overlayInputLabel: string;
} {
  const { animation, x, y, w, h, fromSec, toSec, layerLabel, inputLabel } = params;

  if (!animation) {
    return {
      xExpr: String(Math.round(x)),
      yExpr: String(Math.round(y)),
      extraFilters: [],
      overlayInputLabel: inputLabel,
    };
  }

  const inAnim  = animation.in;
  const outAnim = animation.out;
  const inDur   = inAnim  ? inAnim.duration  / 1000 : 0;
  const outDur  = outAnim ? outAnim.duration / 1000 : 0;

  const inStart  = fromSec;
  const outStart = toSec - outDur;

  // ── Per-frame easing expressions (overlay t variable) ─────────────────────
  // Used only by slide animations (per-frame, already fast).
  const p_in_linear = inDur > 0
    ? `clip((t-${inStart.toFixed(3)})/${inDur.toFixed(3)},0,1)`
    : '1';
  const p_out_linear = outDur > 0
    ? `clip((t-${outStart.toFixed(3)})/${outDur.toFixed(3)},0,1)`
    : '0';

  const eased_in  = inDur  > 0 ? `(1-pow(1-${p_in_linear},3))` : '1';
  const eased_out = outDur > 0 ? `pow(${p_out_linear},3)` : '0';

  // ── X / Y position expressions (slide animations) ─────────────────────────
  let xExpr = String(Math.round(x));
  let yExpr = String(Math.round(y));

  const inType  = inAnim?.type;
  const outType = outAnim?.type;

  if (inType === 'slideInLeft') {
    xExpr = `${Math.round(x)}-(${Math.round(x + w)})*(1-${eased_in})`;
  } else if (inType === 'slideInRight') {
    xExpr = `${Math.round(x)}+(1920-${Math.round(x)})*(1-${eased_in})`;
  } else if (inType === 'slideInTop') {
    yExpr = `${Math.round(y)}-(${Math.round(y + h)})*(1-${eased_in})`;
  } else if (inType === 'slideInBottom') {
    yExpr = `${Math.round(y)}+(1080-${Math.round(y)})*(1-${eased_in})`;
  }

  if (outType === 'slideOutLeft') {
    xExpr = `(${xExpr})-(${Math.round(x + w)})*${eased_out}`;
  } else if (outType === 'slideOutRight') {
    xExpr = `(${xExpr})+(1920-${Math.round(x)})*${eased_out}`;
  } else if (outType === 'slideOutTop') {
    yExpr = `(${yExpr})-(${Math.round(y + h)})*${eased_out}`;
  } else if (outType === 'slideOutBottom') {
    yExpr = `(${yExpr})+(1080-${Math.round(y)})*${eased_out}`;
  }

  // ── Native fade filter (replaces per-pixel geq) ───────────────────────────
  //
  // FFmpeg's `fade` filter is SIMD-optimised (SSE/AVX) and processes entire
  // scanlines in vectorised batches — not pixel-by-pixel like geq.
  // `alpha=1` tells FFmpeg to fade the alpha channel rather than the luma,
  // so transparently-composited overlays fade in/out smoothly.
  //
  // Chain:  [inputLabel] → format=rgba → fade-in → fade-out → [layerLabel_f]
  //
  const needsFade =
    inType  === 'fadeIn'  || inType  === 'zoomIn'  ||
    outType === 'fadeOut' || outType === 'zoomOut';

  const extraFilters: string[] = [];
  let overlayInputLabel = inputLabel;

  if (needsFade) {
    // Always start from an rgba stream so the alpha channel exists.
    const rgbaLabel  = `[${layerLabel}_rgba]`;
    const fadeLabel  = `[${layerLabel}_f]`;

    // Build the fade chain as a single filter string.
    // Multiple `fade` filters can be chained with commas inside one [] block.
    const fadeParts: string[] = ['format=rgba'];

    if (inType === 'fadeIn' || inType === 'zoomIn') {
      fadeParts.push(`fade=type=in:start_time=${inStart.toFixed(3)}:duration=${Math.max(inDur, 0.001).toFixed(3)}:alpha=1`);
    }
    if (outType === 'fadeOut' || outType === 'zoomOut') {
      fadeParts.push(`fade=type=out:start_time=${outStart.toFixed(3)}:duration=${Math.max(outDur, 0.001).toFixed(3)}:alpha=1`);
    }

    extraFilters.push(`${inputLabel}${fadeParts.join(',')}${fadeLabel}`);
    overlayInputLabel = fadeLabel;
  }

  return { xExpr, yExpr, extraFilters, overlayInputLabel };
}
