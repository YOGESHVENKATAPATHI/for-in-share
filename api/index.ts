import { Request, Response } from 'express';
import { app, initApp } from '../server/index';

export default async function handler(req: Request, res: Response) {
  // Ensure the app and its routes are fully initialized 
  // before handling the very first serverless request.
  await initApp();
  
  // Delegate the handling to the Express application
  return app(req, res);
}