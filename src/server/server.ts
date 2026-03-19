import 'dotenv/config';
import app from './app';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const server = app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║      MP4 Video Generator — POC Server            ║
║   FFmpeg + Puppeteer Pipeline                    ║
╠══════════════════════════════════════════════════╣
║  Server:  http://localhost:${PORT}                   ║
║  Health:  GET  /api/health                       ║
║  Render:  POST /api/render                       ║
║  Status:  GET  /api/render/:jobId/status         ║
║  Download:GET  /api/render/:jobId/download       ║
╚══════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] Shutting down...');
    server.close();
    process.exit(0);
});
