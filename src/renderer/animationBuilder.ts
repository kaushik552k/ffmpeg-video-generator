/**
 * animationBuilder.ts
 *
 * Generates FFmpeg filter_complex fragments for layer animations.
 *
 * ─── HOW IT WORKS ──────────────────────────────────────────────────────────────
 * The FFmpeg overlay filter evaluates x/y as per-frame expressions.
 * `t` = current timestamp in seconds from stream start.
 *
 * For FADE/ZOOM animations we use the `overlay` filter's built-in `alpha`
 * blending mode — but since libx264 needs yuv420p (no alpha in final output),
 * we instead apply a global alpha modifier to the overlay PNG using
 * colorchannelmixer's `aa` parameter, which scales the alpha channel.
 *
 * colorchannelmixer=aa=<expr> is evaluated once per-frame via the `setpts` trick:
 * We actually use the `sendcmd` approach — but the SIMPLEST correct approach is:
 * apply format=rgba to the still PNG, then use `overlay` with `alpha=1` option
 * and vary transparency via `lut` filter's alpha channel.
 *
 * HOWEVER the simplest approach that actually works cross-platform in FFmpeg is:
 * Use a `geq` filter on the PNG stream: geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*<factor>'
 * where <factor> is a constant evaluated per-clip (not per-frame).
 *
 * For TRUE per-frame alpha, we use the overlay filter's `x` and `y` dynamic
 * expressions for slide animations, and for fade/zoom we apply the `lut` filter
 * with `a` channel scaled by the time expression using `geq` correctly.
 *
 * ─── CORRECT geq SYNTAX ────────────────────────────────────────────────────────
 * [in]geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='clip(alpha(X,Y)*(EXPR),0,255)'[out]
 *   where EXPR uses T (geq time variable) not t (overlay variable)
 *   geq time variable: T = current time in seconds (available in geq)
 *
 * ─── SUPPORTED ANIMATIONS ──────────────────────────────────────────────────────
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
  layerLabel: string;  // e.g. "t0"
  inputLabel: string;  // e.g. "[2:v]"
}): {
  xExpr: string;
  yExpr: string;
  /**
   * Extra filter segments to prepend to the main filters array.
   * Each segment is a full "label filter label" string ready to push into filters[].
   */
  extraFilters: string[];
  /** The label to use as input to the overlay filter (may differ after alpha chain) */
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

  const inAnim = animation.in;
  const outAnim = animation.out;
  const inDur = inAnim ? inAnim.duration / 1000 : 0;
  const outDur = outAnim ? outAnim.duration / 1000 : 0;

  // ── Easing expressions using overlay's `t` variable ────────────────────────
  // p_in: normalized [0,1] progress through entrance (0=start, 1=done)
  // p_out: normalized [0,1] progress through exit (0=not started, 1=done)
  const inStart = fromSec;
  const outStart = toSec - outDur;

  // ease-out cubic for in (fast arrive), ease-in cubic for out (fast leave)
  const p_in_linear = inDur > 0
    ? `clip((t-${inStart.toFixed(3)})/${inDur.toFixed(3)},0,1)`
    : '1';
  const p_out_linear = outDur > 0
    ? `clip((t-${outStart.toFixed(3)})/${outDur.toFixed(3)},0,1)`
    : '0';

  // Eased: ease-out-cubic = 1-(1-p)^3, ease-in-cubic = p^3
  const eased_in = inDur > 0
    ? `(1-pow(1-${p_in_linear},3))`
    : '1';
  const eased_out = outDur > 0
    ? `pow(${p_out_linear},3)`
    : '0';

  // ── X / Y position expressions ──────────────────────────────────────────────
  let xExpr = String(Math.round(x));
  let yExpr = String(Math.round(y));

  const inType = inAnim?.type;
  const outType = outAnim?.type;

  // IN position animations
  if (inType === 'slideInLeft') {
    // Start off-screen left, slide to x
    xExpr = `${Math.round(x)}-(${Math.round(x + w)})*(1-${eased_in})`;
  } else if (inType === 'slideInRight') {
    // Start off-screen right, slide to x
    xExpr = `${Math.round(x)}+(1920-${Math.round(x)})*(1-${eased_in})`;
  } else if (inType === 'slideInTop') {
    yExpr = `${Math.round(y)}-(${Math.round(y + h)})*(1-${eased_in})`;
  } else if (inType === 'slideInBottom') {
    yExpr = `${Math.round(y)}+(1080-${Math.round(y)})*(1-${eased_in})`;
  }

  // OUT position animations (additive to in)
  if (outType === 'slideOutLeft') {
    xExpr = `(${xExpr})-(${Math.round(x + w)})*${eased_out}`;
  } else if (outType === 'slideOutRight') {
    xExpr = `(${xExpr})+(1920-${Math.round(x)})*${eased_out}`;
  } else if (outType === 'slideOutTop') {
    yExpr = `(${yExpr})-(${Math.round(y + h)})*${eased_out}`;
  } else if (outType === 'slideOutBottom') {
    yExpr = `(${yExpr})+(1080-${Math.round(y)})*${eased_out}`;
  }

  // ── Alpha (fade/zoom) via geq filter ───────────────────────────────────────
  const needsAlpha =
    inType === 'fadeIn' || inType === 'zoomIn' ||
    outType === 'fadeOut' || outType === 'zoomOut';

  const extraFilters: string[] = [];
  let overlayInputLabel = inputLabel;

  if (needsAlpha) {
    let inAlphaExpr = '1';
    let outAlphaExpr = '1';

    if (inType === 'fadeIn' || inType === 'zoomIn') {
      inAlphaExpr = `(1-pow(1-clip((T-${inStart.toFixed(3)})/${inDur > 0 ? inDur.toFixed(3) : '0.001'},0,1),3))`;
    }
    if (outType === 'fadeOut' || outType === 'zoomOut') {
      outAlphaExpr = `(1-pow(clip((T-${outStart.toFixed(3)})/${outDur > 0 ? outDur.toFixed(3) : '0.001'},0,1),3))`;
    }

    // Combined alpha: both in and out active when relevant
    const alphaExpr = `clip(${inAlphaExpr}*${outAlphaExpr},0,1)`;
    const alphaLabel = `[${layerLabel}_alpha]`;

    // geq: T is the current timestamp in seconds (geq's time variable)
    // alpha(X,Y) returns pixel's alpha value (0-255 range in geq)
    extraFilters.push(
      `${inputLabel}format=rgba,geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='alpha(X\\,Y)*${alphaExpr}'${alphaLabel}`
    );
    overlayInputLabel = alphaLabel;
  }

  return { xExpr, yExpr, extraFilters, overlayInputLabel };
}
