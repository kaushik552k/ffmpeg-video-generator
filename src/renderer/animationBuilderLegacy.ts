/**
 * animationBuilderLegacy.ts — OLD geq-based implementation (for benchmarking only)
 *
 * ⚠️  DO NOT USE IN PRODUCTION ⚠️
 *
 * This is the ORIGINAL implementation that used FFmpeg's `geq` filter for fade/zoom.
 * `geq` evaluates a per-PIXEL expression: for a 1920×1080 frame that is 2,073,600
 * evaluations PER FRAME. At 30fps over 30 seconds = ~1.86 BILLION evaluations per
 * animated layer.
 *
 * Kept here ONLY as a comparison baseline for benchmark demos.
 * The production implementation is in animationBuilder.ts (uses native `fade` filter).
 */

import { LayerAnimation } from '../shared/types';

export function buildAnimationExpressionsGeq(params: {
  animation: LayerAnimation | undefined;
  x: number; y: number; w: number; h: number;
  fromSec: number; toSec: number;
  layerLabel: string;
  inputLabel: string;
}): {
  xExpr: string;
  yExpr: string;
  extraFilters: string[];
  overlayInputLabel: string;
} {
  const { animation, x, y, w, h, fromSec, toSec, layerLabel, inputLabel } = params;

  if (!animation) {
    return { xExpr: String(Math.round(x)), yExpr: String(Math.round(y)), extraFilters: [], overlayInputLabel: inputLabel };
  }

  const inAnim  = animation.in;
  const outAnim = animation.out;
  const inDur   = inAnim  ? inAnim.duration  / 1000 : 0;
  const outDur  = outAnim ? outAnim.duration / 1000 : 0;
  const inStart  = fromSec;
  const outStart = toSec - outDur;

  const p_in_linear  = inDur  > 0 ? `clip((t-${inStart.toFixed(3)})/${inDur.toFixed(3)},0,1)` : '1';
  const p_out_linear = outDur > 0 ? `clip((t-${outStart.toFixed(3)})/${outDur.toFixed(3)},0,1)` : '0';
  const eased_in  = inDur  > 0 ? `(1-pow(1-${p_in_linear},3))`  : '1';
  const eased_out = outDur > 0 ? `pow(${p_out_linear},3)` : '0';

  let xExpr = String(Math.round(x));
  let yExpr = String(Math.round(y));

  const inType  = inAnim?.type;
  const outType = outAnim?.type;

  if (inType === 'slideInLeft')        xExpr = `${Math.round(x)}-(${Math.round(x + w)})*(1-${eased_in})`;
  else if (inType === 'slideInRight')  xExpr = `${Math.round(x)}+(1920-${Math.round(x)})*(1-${eased_in})`;
  else if (inType === 'slideInTop')    yExpr = `${Math.round(y)}-(${Math.round(y + h)})*(1-${eased_in})`;
  else if (inType === 'slideInBottom') yExpr = `${Math.round(y)}+(1080-${Math.round(y)})*(1-${eased_in})`;

  if (outType === 'slideOutLeft')        xExpr = `(${xExpr})-(${Math.round(x + w)})*${eased_out}`;
  else if (outType === 'slideOutRight')  xExpr = `(${xExpr})+(1920-${Math.round(x)})*${eased_out}`;
  else if (outType === 'slideOutTop')    yExpr = `(${yExpr})-(${Math.round(y + h)})*${eased_out}`;
  else if (outType === 'slideOutBottom') yExpr = `(${yExpr})+(1080-${Math.round(y)})*${eased_out}`;

  // ── OLD geq alpha filter — evaluated PER PIXEL PER FRAME ──────────────────
  // For a 30s video: 1920×1080 × 900 frames × this fn = ~1.86 BILLION calls
  const needsAlpha = inType === 'fadeIn' || inType === 'zoomIn' || outType === 'fadeOut' || outType === 'zoomOut';
  const extraFilters: string[] = [];
  let overlayInputLabel = inputLabel;

  if (needsAlpha) {
    let inAlphaExpr  = '1';
    let outAlphaExpr = '1';
    if (inType === 'fadeIn'  || inType === 'zoomIn')
      inAlphaExpr  = `(1-pow(1-clip((T-${inStart.toFixed(3)})/${inDur  > 0 ? inDur.toFixed(3)  : '0.001'},0,1),3))`;
    if (outType === 'fadeOut' || outType === 'zoomOut')
      outAlphaExpr = `(1-pow(clip((T-${outStart.toFixed(3)})/${outDur > 0 ? outDur.toFixed(3) : '0.001'},0,1),3))`;

    const alphaExpr = `clip(${inAlphaExpr}*${outAlphaExpr},0,1)`;
    const alphaLabel = `[${layerLabel}_alpha]`;
    // geq runs for EVERY PIXEL: r(X,Y), g(X,Y), b(X,Y), alpha(X,Y) each called separately
    extraFilters.push(
      `${inputLabel}format=rgba,geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='alpha(X\\,Y)*${alphaExpr}'${alphaLabel}`
    );
    overlayInputLabel = alphaLabel;
  }

  return { xExpr, yExpr, extraFilters, overlayInputLabel };
}
