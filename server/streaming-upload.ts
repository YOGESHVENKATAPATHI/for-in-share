import multer from "multer";
import { Transform } from "stream";
import { createHash } from "crypto";
import { createReadStream, createWriteStream, unlink } from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';
import { path as ffprobePath } from '@ffprobe-installer/ffprobe';

// Configure ffmpeg paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Streaming chunk processor
export class ChunkProcessor extends Transform {
  private chunkIndex = 0;
  private hasher = createHash('sha256');
  private chunks: Buffer[] = [];
  private totalSize = 0;

  constructor(
    private chunkSize = 5 * 1024 * 1024, // 5MB chunks
    private onChunk?: (chunkInfo: ChunkInfo) => Promise<void>
  ) {
    super();
  }

  _transform(chunk: Buffer, encoding: string, callback: (error?: Error) => void) {
    this.hasher.update(chunk);
    this.chunks.push(chunk);
    this.totalSize += chunk.length;

    // Process chunk when we have enough data
    if (this.getBufferSize() >= this.chunkSize) {
      this.processChunk().then(() => callback()).catch((error) => callback(error));
    } else {
      callback();
    }
  }

  _flush(callback: (error?: Error) => void) {
    if (this.chunks.length > 0) {
      this.processChunk().then(() => callback()).catch((error) => callback(error));
    } else {
      callback();
    }
  }

  private getBufferSize(): number {
    return this.chunks.reduce((size, chunk) => size + chunk.length, 0);
  }

  private async processChunk() {
    const chunkData = Buffer.concat(this.chunks);
    
    const chunkInfo: ChunkInfo = {
      index: this.chunkIndex++,
      data: chunkData,
      checksum: createHash('sha256').update(chunkData).digest('hex'),
      size: chunkData.length
    };

    // Emit chunk for processing
    this.emit('chunk', chunkInfo);

    // Call callback if provided
    if (this.onChunk) {
      await this.onChunk(chunkInfo);
    }

    // Clear chunks for next batch
    this.chunks = [];
  }

  getFileChecksum(): string {
    return this.hasher.digest('hex');
  }

  getTotalSize(): number {
    return this.totalSize;
  }
}

export interface ChunkInfo {
  index: number;
  data: Buffer;
  checksum: string;
  size: number;
}

export interface StreamingUploadResult {
  fileId: string;
  checksum: string;
  totalSize: number;
  chunkCount: number;
  uploadTime: number;
}

// Memory-efficient multer configuration
export const streamingUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Use system temp directory
      const tempDir = os.tmpdir();
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename with timestamp
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `upload-${uniqueSuffix}-${file.originalname}`);
    }
  }),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max file size
    files: 10, // Max 10 files per request
    fieldSize: 50 * 1024 * 1024, // 50MB field size
    parts: 1000 // Max 1000 parts
  }
});

// Process uploaded file in streaming fashion
export async function processStreamingUpload(
  filePath: string,
  originalName: string,
  forumId: string,
  userId: string,
  dropboxManager: any,
  storage: any,
  onProgress?: (progress: number) => void
): Promise<StreamingUploadResult> {
  const startTime = Date.now();
  let uploadedChunks = 0;
  let totalChunks = 0;
  
  try {
    const uploadPromises: Promise<any>[] = [];
    const processor = new ChunkProcessor(5 * 1024 * 1024); // 5MB chunks

    // Handle chunk processing
    processor.on('chunk', async (chunkInfo: ChunkInfo) => {
      totalChunks++;
      
      const uploadPromise = dropboxManager.uploadChunkStreaming(
        chunkInfo.data,
        chunkInfo.index,
        chunkInfo.checksum,
        originalName
      ).then((result: any) => {
        uploadedChunks++;
        
        // Report progress
        if (onProgress) {
          const progress = Math.round((uploadedChunks / totalChunks) * 100);
          onProgress(progress);
        }
        
        return {
          chunkIndex: chunkInfo.index,
          dropboxFileId: result.dropboxFileId,
          dropboxPath: result.dropboxPath,
          checksum: chunkInfo.checksum,
          size: chunkInfo.size,
          dropboxAccountId: result.accountId,
          downloadUrl: result.downloadUrl
        };
      });
      
      uploadPromises.push(uploadPromise);
    });

    // Process file in streaming fashion
    const readStream = createReadStream(filePath);
    await pipeline(readStream, processor);

    // Wait for all chunk uploads to complete
    const chunkResults = await Promise.all(uploadPromises);

    // Get file stats
    const fs = await import('fs/promises');
    const stats = await fs.stat(filePath);

    // Generate thumbnail for images and videos
    let thumbnail: string | undefined;
    const mimeType = getMimeType(originalName);
    if (mimeType.startsWith('image/')) {
      try {
        const thumbnailBuffer = await sharp(filePath)
          .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        thumbnail = `data:${mimeType};base64,${thumbnailBuffer.toString('base64')}`;
        console.log(`✅ Generated thumbnail for ${originalName}`);
      } catch (error) {
        console.warn(`Failed to generate thumbnail for ${originalName}:`, error);
      }
    } else if (mimeType.startsWith('video/')) {
      try {
        // Generate video thumbnail using ffmpeg
        const thumbnailBuffer = await generateVideoThumbnail(filePath);
        if (thumbnailBuffer) {
          thumbnail = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;
          console.log(`✅ Generated video thumbnail for ${originalName}`);
        }
      } catch (error) {
        console.warn(`Failed to generate video thumbnail for ${originalName}:`, error);
      }
    }

    // Create file record in database
    const fileRecord = await storage.createFile(
      forumId,
      userId,
      path.basename(originalName),
      stats.size,
      mimeType,
      thumbnail,
      {
        isAdminCreated: false, // Explicitly mark as user upload
        adminNotes: "Uploaded via User Portal", // Identifier for user uploads
        metaTitle: originalName,
        metaDescription: `File uploaded to forum`,
        keywords: path.extname(originalName).slice(1)
      }
    );
    console.log(`✅ Created file record in database: ${fileRecord.id}`);

    // Create file chunks records
    for (const chunk of chunkResults) {
      try {
        await storage.createFileChunk(
          fileRecord.id,
          chunk.chunkIndex,
          chunk.size,
          chunk.checksum,
          chunk.dropboxAccountId,
          chunk.dropboxPath,
          chunk.dropboxFileId,
          chunk.downloadUrl
        );
        console.log(`✅ Saved chunk ${chunk.chunkIndex} to database`);
      } catch (chunkError) {
        console.error(`❌ Failed to save chunk ${chunk.chunkIndex} to database:`, chunkError);
        throw chunkError; // Re-throw to fail the upload
      }
    }

    return {
      fileId: fileRecord.id,
      checksum: processor.getFileChecksum(),
      totalSize: processor.getTotalSize(),
      chunkCount: chunkResults.length,
      uploadTime: Date.now() - startTime
    };

  } finally {
    // Always cleanup temporary file
    try {
      await new Promise<void>((resolve) => {
        unlink(filePath, () => resolve()); // Ignore errors, file might not exist
      });
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }
}

// Simple mime type detection
function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

// Progress tracking for uploads
export class UploadProgressTracker {
  private progressMap = new Map<string, UploadProgress>();

  setProgress(uploadId: string, progress: Partial<UploadProgress>) {
    const current = this.progressMap.get(uploadId) || {
      progress: 0,
      status: 'queued',
      startTime: new Date()
    };
    
    this.progressMap.set(uploadId, { ...current, ...progress });
  }

  getProgress(uploadId: string): UploadProgress | null {
    return this.progressMap.get(uploadId) || null;
  }

  removeProgress(uploadId: string) {
    this.progressMap.delete(uploadId);
  }

  getAllProgress(): Map<string, UploadProgress> {
    return new Map(this.progressMap);
  }

  // Cleanup old progress entries
  cleanup() {
    const now = Date.now();
    const entries = Array.from(this.progressMap.entries());
    for (const [uploadId, progress] of entries) {
      // Remove entries older than 1 hour
      if (now - progress.startTime.getTime() > 3600000) {
        this.progressMap.delete(uploadId);
      }
    }
  }
}

export interface UploadProgress {
  progress: number;
  status: 'queued' | 'processing' | 'completed' | 'error';
  startTime: Date;
  error?: string;
  server?: string;
  bytesUploaded?: number;
  totalBytes?: number;
}

// Video thumbnail generation function
async function generateVideoThumbnail(videoPath: string): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const tempThumbnailPath = `${videoPath}.thumb.jpg`;
    
    ffmpeg(videoPath)
      .screenshots({
        count: 1,
        folder: path.dirname(videoPath),
        filename: path.basename(tempThumbnailPath),
        timemarks: ['10%'], // Take thumbnail at 10% of video duration
        size: '300x300'
      })
      .on('end', async () => {
        try {
          // Read the generated thumbnail
          const fs = await import('fs/promises');
          const thumbnailBuffer = await fs.readFile(tempThumbnailPath);
          
          // Clean up temp file
          await fs.unlink(tempThumbnailPath);
          
          resolve(thumbnailBuffer);
        } catch (error) {
          console.warn('Failed to read/cleanup video thumbnail:', error);
          resolve(null);
        }
      })
      .on('error', (error) => {
        console.warn('FFmpeg thumbnail generation failed:', error);
        resolve(null);
      });
  });
}

// Cleanup utility for temp files
export class TempFileManager {
  private tempFiles = new Set<string>();

  addTempFile(filePath: string) {
    this.tempFiles.add(filePath);
  }

  async cleanupFile(filePath: string) {
    try {
      await new Promise<void>((resolve, reject) => {
        unlink(filePath, (err) => {
          if (err && err.code !== 'ENOENT') {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      this.tempFiles.delete(filePath);
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }

  async cleanupAll() {
    const cleanupPromises = Array.from(this.tempFiles).map(filePath => 
      this.cleanupFile(filePath)
    );
    await Promise.allSettled(cleanupPromises);
  }
}

export const tempFileManager = new TempFileManager();
