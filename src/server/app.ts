import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { RenderRequestSchema } from '../shared/types';
import { JobStatus } from '../shared/types';
import { renderComposition } from '../renderer/renderPipeline';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const OUTPUT_DIR = process.env.OUTPUT_DIR ?? './output';

// ── In-memory job store (POC — replace with Redis in prod) ────────────────────
const jobs = new Map<string, JobStatus>();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/render
// Body: { composition: {...}, dynamicFields?: { dynamicText: "Hello" } }
// Returns: { jobId: string }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/render', async (req: Request, res: Response) => {
    // Validate input
    const parsed = RenderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({
            error: 'Invalid request body',
            details: parsed.error.flatten(),
        });
        return;
    }

    const { composition, dynamicFields } = parsed.data;
    const jobId = uuidv4();
    const now = new Date();

    // Register job
    jobs.set(jobId, {
        jobId,
        status: 'processing',
        progress: 0,
        createdAt: now,
        updatedAt: now,
    });

    console.log(`[API] New render job: ${jobId}`);

    // Run synchronously in POC mode (fire-and-respond-async pattern)
    res.json({ jobId, message: 'Render started. Poll /api/render/:jobId/status for updates.' });

    // Process asynchronously (non-blocking response already sent)
    (async () => {
        try {
            const outputPath = await renderComposition({
                jobId,
                composition,
                dynamicFields,
                onProgress: (pct) => {
                    const job = jobs.get(jobId)!;
                    job.progress = pct;
                    job.updatedAt = new Date();
                },
            });

            const job = jobs.get(jobId)!;
            job.status = 'completed';
            job.progress = 100;
            job.outputPath = outputPath;
            job.updatedAt = new Date();
            console.log(`[API] Job ${jobId} completed: ${outputPath}`);
        } catch (err) {
            const job = jobs.get(jobId)!;
            job.status = 'failed';
            job.error = err instanceof Error ? err.message : String(err);
            job.updatedAt = new Date();
            console.error(`[API] Job ${jobId} failed:`, job.error);
        }
    })();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/render/:jobId/status
// Returns: { jobId, status, progress, error? }
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/render/:jobId/status', (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
    }

    res.json({
        jobId: job.jobId,
        status: job.status,
        progress: job.progress,
        error: job.error,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        downloadUrl: job.status === 'completed' ? `/api/render/${jobId}/download` : undefined,
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/render/:jobId/download
// Streams the MP4 file as a binary response
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/render/:jobId/download', (req: Request, res: Response) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
    }

    if (job.status !== 'completed' || !job.outputPath) {
        res.status(400).json({ error: 'Video not ready yet', status: job.status });
        return;
    }

    const filePath = path.resolve(job.outputPath);
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Output file not found on disk' });
        return;
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${jobId}.mp4"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', () => res.status(500).end());
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', jobs: jobs.size });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

export default app;
