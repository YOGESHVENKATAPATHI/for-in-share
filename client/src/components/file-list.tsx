import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import type { FileWithChunks } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { File, Download, Trash2, FileText, User, Eye, Tag as TagIcon, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { ImageWithProxy } from "@/components/image-with-proxy";

interface FileListProps {
  files: FileWithChunks[];
  isLoading: boolean;
  forumId: string;
  onPreview?: (file: FileWithChunks) => void;
  ws?: WebSocket | null;
  isLoadingMore?: boolean;
}

export function FileList({ files, isLoading, forumId, onPreview, ws, isLoadingMore = false }: FileListProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [downloadingFiles, setDownloadingFiles] = useState<Record<string, {
    progress: number;
    bytesDownloaded: number;
    totalBytes: number;
    speed: number;
    startTime: number;
    eta: number;
  }>>({});

  const [uploadingFiles, setUploadingFiles] = useState<Record<string, {
    progress: number;
    fileName: string;
    bytesUploaded: number;
    totalBytes: number;
  }>>({});

  const [processingFiles, setProcessingFiles] = useState<Record<string, boolean>>({});
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState<string>("");

  // Handle WebSocket registration and messages for download progress
  useEffect(() => {
    if (!ws || !user?.id) return;

    // Register userId with backend WebSocket server
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'register', userId: user.id }));
      console.log('[FileList] Sent WebSocket registration for user:', user.id);
    };

    const handleMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === 'download_progress') {
        console.log('[FileList] Received download_progress event:', data);
        const percent = typeof data.progress === 'number' ? data.progress : Number(data.progress) || 0;
        console.log(`[FileList] Download progress for file ${data.fileId}: ${percent}%`);
        setDownloadingFiles((prev) => ({
          ...prev,
          [data.fileId]: {
            progress: percent,
            bytesDownloaded: percent, // Still approximate unless backend sends bytes
            totalBytes: 100, // Placeholder
            speed: 0,
            startTime: Date.now(),
            eta: 0,
          },
        }));
        setProcessingFiles((prev) => ({
          ...prev,
          [data.fileId]: true,
        }));
      } else if (data.type === 'upload_progress') {
        console.log('[FileList] Received upload_progress event:', data.data);
        const { uploadId, progress, fileName, bytesUploaded, totalBytes } = data.data;
        setUploadingFiles((prev) => ({
          ...prev,
          [uploadId]: {
            progress: progress || 0,
            fileName: fileName || 'Unknown file',
            bytesUploaded: bytesUploaded || 0,
            totalBytes: totalBytes || 100,
          },
        }));
      } else if (data.type === 'file_uploaded') {
        console.log('[FileList] File uploaded:', data.data);
        // Remove from uploading files when complete
        setUploadingFiles((prev) => {
          const newUploading = { ...prev };
          // Find and remove the upload that matches this file
          Object.keys(newUploading).forEach(uploadId => {
            if (newUploading[uploadId].fileName === data.data.filename) {
              delete newUploading[uploadId];
            }
          });
          return newUploading;
        });
      } else if (data.type === 'download_complete') {
        console.log(`[FileList] Download completed for file ${data.fileId}`);
        setDownloadingFiles((prev) => {
          const { [data.fileId]: _, ...rest } = prev;
          return rest;
        });
        setProcessingFiles((prev) => {
          const { [data.fileId]: _, ...rest } = prev;
          return rest;
        });
        setProcessingFiles((prev) => {
          const { [data.fileId]: _, ...rest } = prev;
          return rest;
        });
      } else if (data.type === 'download_error' && data.userId === user?.id) {
        console.error(`[FileList] Download error for file ${data.fileId}:`, data.error);
        setDownloadingFiles((prev) => {
          const { [data.fileId]: _, ...rest } = prev;
          return rest;
        });
        setProcessingFiles((prev) => {
          const { [data.fileId]: _, ...rest } = prev;
          return rest;
        });
        toast({
          title: "Download failed",
          description: data.error || "An error occurred during download",
          variant: "destructive",
        });
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, user?.id, toast]);

  const downloadMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (file && (file.mimeType?.startsWith('application/x-mpegurl') || file.fileName.toLowerCase().endsWith('.m3u8'))) {
        setProcessingFiles((prev) => ({ ...prev, [fileId]: 'Transcoding M3U8 to MP4...' }));
      }

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const file = files.find((f) => f.id === fileId);
        const totalBytes = file?.fileSize || 0;
        const startTime = Date.now();
        let lastBytesDownloaded = 0;
        let lastTime = startTime;

        xhr.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const bytesDownloaded = e.loaded;
            const percentComplete = (bytesDownloaded / totalBytes) * 100;
            const currentTime = Date.now();
            const timeElapsed = (currentTime - lastTime) / 1000; // seconds

            // Calculate speed (bytes per second)
            const bytesDelta = bytesDownloaded - lastBytesDownloaded;
            const speed = timeElapsed > 0 ? bytesDelta / timeElapsed : 0;

            // Calculate ETA (estimated time of arrival)
            const remainingBytes = totalBytes - bytesDownloaded;
            const eta = speed > 0 ? remainingBytes / speed : 0;

            setDownloadingFiles((prev) => ({
              ...prev,
              [fileId]: {
                progress: percentComplete,
                bytesDownloaded,
                totalBytes,
                speed,
                startTime,
                eta,
              },
            }));

            lastBytesDownloaded = bytesDownloaded;
            lastTime = currentTime;
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const blob = xhr.response;
            const url = window.URL.createObjectURL(blob);
            
            const a = document.createElement("a");
            a.href = url;
            a.download = file?.fileName || "download";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            setDownloadingFiles((prev) => {
              const { [fileId]: _, ...rest } = prev;
              return rest;
            });

            setProcessingFiles((prev) => {
              const { [fileId]: _, ...rest } = prev;
              return rest;
            });

            resolve(null);
          } else {
            reject(new Error(`Download failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Download failed"));
        });

        xhr.responseType = "blob";
        xhr.open("GET", `/api/files/${fileId}/download`);
        xhr.send();
      });
    },
    onError: (error: Error, fileId: string) => {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
      setDownloadingFiles((prev) => {
        const { [fileId]: _, ...rest } = prev;
        return rest;
      });
      setProcessingFiles((prev) => {
        const { [fileId]: _, ...rest } = prev;
        return rest;
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest("DELETE", `/api/files/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forums", forumId, "files"] });
      toast({
        title: "File deleted",
        description: "File has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateExtractedTagsMutation = useMutation({
    mutationFn: async ({ fileId, tags }: { fileId: string; tags: string[] }) => {
      const extractedId = fileId.replace('extracted_', '');
      await apiRequest("POST", `/api/files/update-extracted-tags`, {
        id: extractedId,
        tags: tags.join(',')
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forums", forumId, "files"] });
      toast({
        title: "Tags updated",
        description: "Tags have been updated successfully.",
      });
      setEditingTags(null);
      setTagInput("");
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number) => {
    if (bytesPerSecond === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return Math.round((bytesPerSecond / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatTime = (seconds: number) => {
    if (seconds === 0 || !isFinite(seconds)) return "--";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-9 w-9 rounded-md" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No files yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Upload files to share them with forum members
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Show uploading files */}
      {Object.entries(uploadingFiles).map(([uploadId, uploadInfo]) => (
        <Card key={uploadId} className="border-zinc-800 bg-zinc-900 rounded-none">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="p-2 rounded-none bg-zinc-800 shrink-0">
                <File className="h-6 w-6 text-zinc-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium mb-1 text-zinc-100 break-words hyphens-auto" style={{wordBreak: 'break-word', overflowWrap: 'anywhere'}}>
                  Uploading: {uploadInfo.fileName}
                </p>
                <div className="mt-2 sm:mt-3 space-y-1 sm:space-y-2">
                  <Progress value={uploadInfo.progress} className="h-1.5 sm:h-2 bg-zinc-800" />
                  <div className="flex justify-between items-center text-xs text-zinc-400">
                    <span className="text-xs">
                      {formatBytes(uploadInfo.bytesUploaded)} / {formatBytes(uploadInfo.totalBytes)}
                    </span>
                    <span className="text-xs">{Math.round(uploadInfo.progress)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {files.map((file) => {
        const downloadInfo = downloadingFiles[file.id];
        const isDownloading = !!downloadInfo;

        return (
          <>
            <Card key={file.id} className="border-zinc-800 bg-zinc-900 rounded-none hover:bg-zinc-800 transition-colors" data-testid={`file-${file.id}`}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-start gap-2 sm:gap-3">
                {file.adminThumbnailUrl ? (
                  <ImageWithProxy
                    src={file.adminThumbnailUrl}
                    alt={file.fileName}
                    className="w-20 h-22 object-cover rounded-md shrink-0 cursor-pointer sm:hidden border border-zinc-700"
                    onClick={() => onPreview?.(file)}
                  />
                ) : file.mimeType?.startsWith("video/") ? (
                  file.thumbnail ? (
                    <ImageWithProxy
                      src={file.thumbnail}
                      alt={file.fileName}
                      className="w-20 h-22 object-cover rounded-md shrink-0 cursor-pointer sm:hidden border border-zinc-700"
                      onClick={() => onPreview?.(file)}
                    />
                  ) : (
                    <VideoThumbnail
                      file={file}
                      size={"sm"}
                      className="shrink-0 cursor-pointer sm:hidden"
                      onClick={() => onPreview?.(file)}
                    />
                  )
                ) : file.mimeType?.startsWith("image/") ? (
                  file.thumbnail ? (
                    <ImageWithProxy
                      src={file.thumbnail}
                      alt={file.fileName}
                      className="w-20 h-22 object-cover rounded-md shrink-0 cursor-pointer sm:hidden border border-zinc-700"
                      onClick={() => onPreview?.(file)}
                    />
                  ) : (
                    <div className="w-20 h-22 rounded-md bg-zinc-800 shrink-0 sm:hidden flex items-center justify-center cursor-pointer" onClick={() => onPreview?.(file)}>
                      <File className="h-20 w-20 text-zinc-400" />
                    </div>
                  )
                ) : (
                  <div className="p-1.5 sm:p-2 rounded-none bg-zinc-800 shrink-0 sm:hidden">
                    <File className="h-20 w-20 sm:h-6 sm:w-6 text-zinc-400" />
                  </div>
                )}
                {file.adminThumbnailUrl ? (
                  <ImageWithProxy
                    src={file.adminThumbnailUrl}
                    alt={file.fileName}
                    className="w-20 h-22 object-cover rounded-md shrink-0 cursor-pointer hidden sm:block border border-zinc-700"
                    onClick={() => onPreview?.(file)}
                  />
                ) : file.mimeType?.startsWith("video/") ? (
                  file.thumbnail ? (
                    <ImageWithProxy
                      src={file.thumbnail}
                      alt={file.fileName}
                      className="w-20 h-22 object-cover rounded-md shrink-0 cursor-pointer hidden sm:block border border-zinc-700"
                      onClick={() => onPreview?.(file)}
                    />
                  ) : (
                    <VideoThumbnail
                      file={file}
                      size={"md"}
                      className="shrink-0 cursor-pointer hidden sm:block"
                      onClick={() => onPreview?.(file)}
                    />
                  )
                ) : file.mimeType?.startsWith("image/") ? (
                  file.thumbnail ? (
                    <ImageWithProxy
                      src={file.thumbnail}
                      alt={file.fileName}
                      className="w-20 h-22 object-cover rounded-md shrink-0 cursor-pointer hidden sm:block border border-zinc-700"
                      onClick={() => onPreview?.(file)}
                    />
                  ) : (
                    <div className="w-20 h-22 rounded-md bg-zinc-800 shrink-0 flex items-center justify-center cursor-pointer" onClick={() => onPreview?.(file)}>
                      <File className="h-8 w-8 text-zinc-400" />
                    </div>
                  )
                ) : (
                  <div className="p-2 rounded-none bg-zinc-800 shrink-0 hidden sm:block">
                    <File className="h-6 w-6 text-zinc-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium mb-1 text-zinc-100 break-words hyphens-auto" style={{wordBreak: 'break-word', overflowWrap: 'anywhere'}}>{file.fileName}</p>
                  <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1 sm:gap-x-3 sm:gap-y-1 text-xs text-zinc-400">
                    {!(file.mimeType?.startsWith("application/x-mpegurl") || file.fileName.toLowerCase().endsWith('.m3u8')) && file.fileSize > 0 && (
                      <span>{formatBytes(file.fileSize)}</span>
                    )}
                    {file.mimeType && (
                      <span>{file.mimeType}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      <span className="truncate max-w-20 sm:max-w-none">
                        {file.adminCreatedBy || file.user.username}
                      </span>
                    </span>
                    <span className="text-xs">{formatDistanceToNow(new Date(file.uploadedAt), { addSuffix: true })}</span>
                  </div>

                  {(isDownloading || processingFiles[file.id]) && (
                    <div className="mt-2 sm:mt-3 space-y-1 sm:space-y-2">
                      <Progress value={downloadInfo?.progress || 0} className="h-1.5 sm:h-2 bg-zinc-800" />
                      <div className="flex justify-between items-center text-xs text-zinc-400">
                        <span className="text-xs">
                          {formatBytes(downloadInfo?.bytesDownloaded || 0)} / {formatBytes(downloadInfo?.totalBytes || 0)}
                        </span>
                        <span className="text-xs">{Math.round(downloadInfo?.progress || 0)}%</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-zinc-400">
                        <span className="text-xs">Speed: {formatSpeed(downloadInfo?.speed || 0)}</span>
                        <span className="text-xs">ETA: {formatTime(downloadInfo?.eta || 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-0.5 sm:gap-1 shrink-0">
                  {onPreview && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onPreview(file)}
                      data-testid={`button-preview-${file.id}`}
                      className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 h-8 w-8 sm:h-9 sm:w-9 p-1 sm:p-2"
                    >
                      <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  )}
                  {!(file.mimeType?.startsWith("application/x-mpegurl") || file.fileName.toLowerCase().endsWith('.m3u8')) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadMutation.mutate(file.id)}
                      disabled={isDownloading || downloadMutation.isPending || !!processingFiles[file.id]}
                      data-testid={`button-download-${file.id}`}
                      className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 h-8 w-8 sm:h-9 sm:w-9 p-1 sm:p-2"
                    >
                      <Download className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  )}
                  {user?.id === file.userId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(file.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${file.id}`}
                      className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 h-8 w-8 sm:h-9 sm:w-9 p-1 sm:p-2"
                    >
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          {file.extractedTags && file.extractedTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {file.extractedTags.map((tag, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="text-xs"
                  style={{ backgroundColor: "#6b7280", color: "white" }}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          </>
        );
      })}
      {isLoadingMore && (
        <div className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-zinc-400"></div>
            Loading more files...
          </div>
        </div>
      )}
    </div>
  );
}