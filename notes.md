What we implemented vs. what was planned
They are the same thing — but it's worth understanding exactly how.

The stale note was describing a future plan. We built exactly that plan.
Here's the precise mechanism we use, which is 100% FFmpeg-native:

Step 1 — Puppeteer renders ONCE (static) Each layer (text, list, table, image) is rendered once to a transparent PNG at the start of the job. This PNG is static — no animation logic in Puppeteer at all.

Step 2 — FFmpeg animates during encode (per-frame) Inside 

animationBuilder.ts
, we generate FFmpeg math expression strings that FFmpeg evaluates on every frame during encoding:

# Fade: geq filter (uses T = current time in seconds)
[2:v]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(1-pow(1-clip((T-0)/0.8,0,1),3))'[t0_alpha]
# Slide: overlay x/y expressions (uses t = FFmpeg time variable)  
[canvas][t0_alpha]overlay=x='160-(560)*(1-easing)':y='80':enable='between(t,0,8)'[after_t0]
Key point: No Remotion-style per-frame browser rendering. FFmpeg handles all animation math natively in C code, which is orders of magnitude faster.

Approach	How animations run
Remotion	Chrome re-renders React component tree 30×/sec, Puppeteer screenshots each frame
Our approach	Puppeteer renders once → FFmpeg solves a math equation per frame (nanoseconds)
