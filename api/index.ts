import type { Request, Response } from 'express';

export default async function handler(req: Request, res: Response) {
  try {
    // Lazy-load server modules so import-time crashes are surfaced as JSON.
    const { app, initApp } = await import('../server/index');

    // Ensure the app and its routes are fully initialized
    // before handling the very first serverless request.
    await initApp();

    // Delegate the handling to the Express application
    return app(req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    console.error('Vercel API startup failure:', error);
    return res.status(500).json({
      ok: false,
      source: 'api/index.ts',
      message,
      stack: process.env.NODE_ENV === 'development' ? stack : undefined,
    });
  }
}