import { z } from 'zod';

// ─── Animation ─────────────────────────────────────────────────────────────────
/**
 * Entrance/exit animation for a single direction (in or out).
 * All durations are in milliseconds.
 */
export const AnimationConfigSchema = z.object({
    /**
     * Animation type:
     * IN:  fadeIn | slideInLeft | slideInRight | slideInTop | slideInBottom | zoomIn
     * OUT: fadeOut | slideOutLeft | slideOutRight | slideOutTop | slideOutBottom | zoomOut
     */
    type: z.enum([
        'fadeIn', 'slideInLeft', 'slideInRight', 'slideInTop', 'slideInBottom', 'zoomIn',
        'fadeOut', 'slideOutLeft', 'slideOutRight', 'slideOutTop', 'slideOutBottom', 'zoomOut',
    ]),
    /** Duration in milliseconds (e.g. 500 = 0.5s) */
    duration: z.number().min(0),
});

export const LayerAnimationSchema = z.object({
    /** Entrance animation (runs from display.from → display.from + duration) */
    in: AnimationConfigSchema.optional(),
    /** Exit animation (runs from display.to - duration → display.to) */
    out: AnimationConfigSchema.optional(),
});

// ─── Box Shadow ────────────────────────────────────────────────────────────────
export const BoxShadowSchema = z.object({
    blur: z.number(),
    color: z.string(),
    x: z.number(),
    y: z.number(),
});

// ─── Shared position/size fields ───────────────────────────────────────────────
const BaseDetailsSchema = z.object({
    left: z.string(),
    top: z.string(),
    width: z.number(),
    height: z.number(),
    opacity: z.number().min(0).max(100),
    transform: z.string().optional(),
    backgroundColor: z.string().optional(),
    borderColor: z.string().optional(),
    borderWidth: z.number().optional(),
    borderRadius: z.number().optional(),
    boxShadow: BoxShadowSchema.optional(),
});

// ─── Text Details ──────────────────────────────────────────────────────────────
export const TextDetailsSchema = BaseDetailsSchema.extend({
    WebkitTextStrokeColor: z.string().optional(),
    WebkitTextStrokeWidth: z.string().optional(),
    border: z.string().optional(),
    color: z.string(),
    fontFamily: z.string(),
    fontSize: z.number(),
    fontStyle: z.string().optional(),
    fontUrl: z.string().url(),
    fontWeight: z.string().optional(),
    letterSpacing: z.string().optional(),
    lineHeight: z.string().optional(),
    skewX: z.number().optional(),
    skewY: z.number().optional(),
    text: z.string(),
    textAlign: z.string().optional(),
    textDecoration: z.string().optional(),
    textShadow: z.string().optional(),
    textTransform: z.string().optional(),
    wordBreak: z.string().optional(),
    wordSpacing: z.string().optional(),
    wordWrap: z.string().optional(),
});

// ─── List Details ──────────────────────────────────────────────────────────────
export const ListDetailsSchema = BaseDetailsSchema.extend({
    /** "disc" (bullet), "decimal" (numbered), "circle", "square", "none" */
    listStyle: z.string().default('disc'),
    items: z.array(z.string()),
    color: z.string().default('#ffffff'),
    fontFamily: z.string(),
    fontUrl: z.string().url(),
    fontSize: z.number(),
    fontWeight: z.string().optional(),
    fontStyle: z.string().optional(),
    lineHeight: z.string().optional(),
    letterSpacing: z.string().optional(),
    /** Gap between items in px */
    itemSpacing: z.number().optional(),
    /** Bullet/number color (defaults to text color) */
    markerColor: z.string().optional(),
});

// ─── Table Details ─────────────────────────────────────────────────────────────
export const TableDetailsSchema = BaseDetailsSchema.extend({
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    color: z.string().default('#ffffff'),
    fontFamily: z.string(),
    fontUrl: z.string().url(),
    fontSize: z.number(),
    fontWeight: z.string().optional(),
    fontStyle: z.string().optional(),
    /** Background color for header row */
    headerBgColor: z.string().optional(),
    /** Background color for data rows */
    rowBgColor: z.string().optional(),
    /** Alternating row background color */
    rowAltBgColor: z.string().optional(),
    /** Table cell text alignment */
    textAlign: z.string().optional(),
    /** Table cell padding in px */
    cellPadding: z.number().optional(),
});

// ─── Image Details ─────────────────────────────────────────────────────────────
export const ImageDetailsSchema = BaseDetailsSchema.extend({
    src: z.string(),
    /** CSS object-fit: "cover" | "contain" | "fill" | "none" */
    objectFit: z.string().optional(),
});

// ─── Video Details ─────────────────────────────────────────────────────────────
export const VideoDetailsSchema = z.object({
    borderColor: z.string().optional(),
    borderRadius: z.number().optional(),
    borderWidth: z.number().optional(),
    boxShadow: BoxShadowSchema.optional(),
    height: z.number().optional(),
    left: z.string(),
    opacity: z.number().min(0).max(100),
    src: z.string(),
    top: z.string(),
    transform: z.string().optional(),
    volume: z.number().optional(),
    width: z.number().optional(),
});

// ─── Track Item Display ────────────────────────────────────────────────────────
export const DisplaySchema = z.object({
    from: z.number(), // milliseconds
    to: z.number(),   // milliseconds
});

export const TrimSchema = z.object({
    from: z.number(),
    to: z.number(),
});

// ─── Track Items Map Entries ───────────────────────────────────────────────────
export const TextTrackItemSchema = z.object({
    details: TextDetailsSchema,
    display: DisplaySchema,
    id: z.string(),
    isMain: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
    name: z.string().optional(),
    type: z.literal('text'),
    animation: LayerAnimationSchema.optional(),
});

export const ListTrackItemSchema = z.object({
    details: ListDetailsSchema,
    display: DisplaySchema,
    id: z.string(),
    name: z.string().optional(),
    type: z.literal('list'),
    animation: LayerAnimationSchema.optional(),
});

export const TableTrackItemSchema = z.object({
    details: TableDetailsSchema,
    display: DisplaySchema,
    id: z.string(),
    name: z.string().optional(),
    type: z.literal('table'),
    animation: LayerAnimationSchema.optional(),
});

export const ImageTrackItemSchema = z.object({
    details: ImageDetailsSchema,
    display: DisplaySchema,
    id: z.string(),
    name: z.string().optional(),
    type: z.literal('image'),
    animation: LayerAnimationSchema.optional(),
});

export const VideoTrackItemSchema = z.object({
    details: VideoDetailsSchema,
    display: DisplaySchema,
    duration: z.number().optional(),
    id: z.string(),
    isMain: z.boolean().optional(),
    name: z.string().optional(),
    playbackRate: z.number().optional(),
    trim: TrimSchema.optional(),
    type: z.literal('video'),
});

export const TrackItemSchema = z.discriminatedUnion('type', [
    TextTrackItemSchema,
    ListTrackItemSchema,
    TableTrackItemSchema,
    ImageTrackItemSchema,
    VideoTrackItemSchema,
]);

// ─── Track ─────────────────────────────────────────────────────────────────────
export const TrackSchema = z.object({
    accepts: z.array(z.string()).optional(),
    id: z.string(),
    items: z.array(z.string()),
    magnetic: z.boolean().optional(),
    static: z.boolean().optional(),
    type: z.string(),
});

// ─── Root Composition Schema ───────────────────────────────────────────────────
export const CompositionSchema = z.object({
    fps: z.number(),
    id: z.string(),
    size: z.object({
        height: z.number(),
        width: z.number(),
    }),
    trackItemIds: z.array(z.string()).optional(),
    trackItemsMap: z.record(TrackItemSchema),
    tracks: z.array(TrackSchema),
    transitionIds: z.array(z.string()).optional(),
    transitionsMap: z.record(z.unknown()).optional(),
});

// ─── Render Request ────────────────────────────────────────────────────────────
export const RenderRequestSchema = z.object({
    composition: CompositionSchema,
    /** Optional map of {{variable}} replacements */
    dynamicFields: z.record(z.string()).optional(),
});

// ─── TypeScript Types ──────────────────────────────────────────────────────────
export type BoxShadow = z.infer<typeof BoxShadowSchema>;
export type AnimationConfig = z.infer<typeof AnimationConfigSchema>;
export type LayerAnimation = z.infer<typeof LayerAnimationSchema>;
export type TextDetails = z.infer<typeof TextDetailsSchema>;
export type ListDetails = z.infer<typeof ListDetailsSchema>;
export type TableDetails = z.infer<typeof TableDetailsSchema>;
export type ImageDetails = z.infer<typeof ImageDetailsSchema>;
export type VideoDetails = z.infer<typeof VideoDetailsSchema>;
export type TextTrackItem = z.infer<typeof TextTrackItemSchema>;
export type ListTrackItem = z.infer<typeof ListTrackItemSchema>;
export type TableTrackItem = z.infer<typeof TableTrackItemSchema>;
export type ImageTrackItem = z.infer<typeof ImageTrackItemSchema>;
export type VideoTrackItem = z.infer<typeof VideoTrackItemSchema>;
export type TrackItem = z.infer<typeof TrackItemSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Composition = z.infer<typeof CompositionSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;

export interface RenderJob {
    jobId: string;
    composition: Composition;
    dynamicFields?: Record<string, string>;
    outputPath: string;
}

export interface JobStatus {
    jobId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress: number;
    outputPath?: string;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
}
