import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import type { MessageWithUser, FileWithChunks } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useEntityTagManager } from "@/hooks/use-tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { CommentsSection } from "@/components/comments-section";
import { TagInput } from "@/components/tag-input";
import { VideoThumbnail } from "@/components/video-thumbnail";
import { ImageWithProxy } from "@/components/image-with-proxy";
import { 
  File, Download, Copy, Check, Eye,
  FileText, Image as ImageIcon, FileVideo, 
  FileArchive, User, Tag as TagIcon, Edit3,
  Share2
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type TimelineItem = {
  type: "message" | "file";
  date: Date;
  data: MessageWithUser | FileWithChunks;
};

interface UnifiedTimelineProps {
  messages: MessageWithUser[];
  files: FileWithChunks[];
  forumId: string;
  scrollToMessage?: string | null;
  scrollToFile?: string | null;
  ws?: WebSocket | null;
  uploadProgress?: any;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  totalFiles?: number | null;
  // Number of extracted neon db items (only included for Xmaster forum)
  extractedCount?: number | null;
}

// Separate component for timeline items to properly handle hooks
function TimelineItem({ 
  item, 
  index, 
  copiedId, 
  setCopiedId, 
  downloadingFiles, 
  setDownloadingFiles, 
  previewFile, 
  setPreviewFile, 
  setPreviewOpen, 
  editingTags, 
  setEditingTags,
  downloadMutation,
  handleCopyMessage,
  handleShareItem,
  getInitials,
  getFileIcon,
  formatFileSize,
  renderMessageContent,
  handlePreview,
  forumId
}: {
  item: TimelineItem;
  index: number;
  copiedId: string | null;
  setCopiedId: (id: string | null) => void;
  downloadingFiles: Record<string, number>;
  setDownloadingFiles: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  previewFile: FileWithChunks | null;
  setPreviewFile: (file: FileWithChunks | null) => void;
  setPreviewOpen: (open: boolean) => void;
  editingTags: string | null;
  setEditingTags: (id: string | null) => void;
  downloadMutation: any;
  handleCopyMessage: (content: string, id: string) => void;
  handleShareItem: (type: 'message' | 'file', id: string) => void;
  getInitials: (username: string) => string;
  getFileIcon: (mimeType?: string | null) => JSX.Element;
  formatFileSize: (bytes: number) => string;
  renderMessageContent: (content: string) => JSX.Element;
  handlePreview: (file: FileWithChunks) => void;
  forumId: string;
}) {
  if (item.type === "message") {
    const message = item.data as MessageWithUser;
    const isCopied = copiedId === message.id;

    return (
      <div key={`msg-${message.id}`} id={`message-${message.id}`} className="flex gap-3 group max-w-full">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {getInitials(message.user?.username || 'Unknown')}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 max-w-full overflow-hidden">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-sm">
              {message.user?.username || 'Unknown'}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
            </span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-none px-3 py-2 flex items-start gap-2 group/message hover:bg-zinc-800 transition-colors max-w-full">
            <div className="text-sm break-words break-all word-wrap overflow-wrap-anywhere flex-1 min-w-0 text-zinc-100 message-content">
              {renderMessageContent(message.content)}
            </div>
            <div className="flex gap-1 flex-shrink-0 mt-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="opacity-70 sm:opacity-0 sm:group-hover/message:opacity-100 transition-opacity h-6 w-6 p-0 text-zinc-400 hover:text-zinc-100"
                onClick={() => handleCopyMessage(message.content, message.id)}
                title="Copy message"
              >
                {isCopied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-70 sm:opacity-0 sm:group-hover/message:opacity-100 transition-opacity h-6 w-6 p-0 text-zinc-400 hover:text-zinc-100"
                onClick={() => handleShareItem('message', message.id)}
                title="Share message"
              >
                <Share2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
          
          {/* Tags section */}
          <MessageTagsSection
            messageId={message.id}
            editingTags={editingTags}
            setEditingTags={setEditingTags}
          />
          
          <CommentsSection
            entityType="message"
            entityId={message.id}
            forumId={forumId}
            initialCommentCount={message.commentCount || 0}
          />
        </div>
      </div>
    );
  } else {
    const file = item.data as FileWithChunks & { isUploading?: boolean; uploadProgress?: number; bytesUploaded?: number; totalBytes?: number };
    const isUploading = file.isUploading || false;
    const uploadProgress = file.uploadProgress || 0;
    const isDownloading = file.id in downloadingFiles;
    const downloadProgress = downloadingFiles[file.id] || 0;
    const canPreview = !isUploading && (file.mimeType?.startsWith("image/") || 
                     file.mimeType === "application/pdf" || 
                     file.mimeType?.startsWith("video/") ||
                     file.mimeType?.startsWith("application/x-mpegurl") ||
                     file.fileName.toLowerCase().endsWith(".m3u8"));

    return (
      <div key={`file-${file.id}`} id={`file-${file.id}`} className="flex gap-3 max-w-full">
        <Avatar className="h-10 w-10 flex-shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground">
            {getInitials(file.user?.username || file.adminCreatedBy || 'Unknown')}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 max-w-full overflow-hidden">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-sm">
              {file.user?.username || file.adminCreatedBy || 'Unknown'}
            </span>
            <span className="text-xs text-muted-foreground">
              uploaded {formatDistanceToNow(new Date(file.uploadedAt), { addSuffix: true })}
            </span>
          </div>
          <Card 
            className={`overflow-hidden transition-shadow rounded-none bg-zinc-900 border-zinc-800 ${canPreview ? 'cursor-pointer hover:bg-zinc-800' : ''}`}
            onClick={() => canPreview && handlePreview(file)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                  {file.adminThumbnailUrl ? (
                    <ImageWithProxy
                      src={file.adminThumbnailUrl}
                      alt={file.fileName}
                      className="w-28 h-28 object-cover rounded border border-zinc-700 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(file);
                      }}
                    />
                  ) : (file.mimeType?.startsWith("image/") || file.mimeType?.startsWith("video/")) && file.thumbnail ? (
                    <ImageWithProxy
                      src={file.thumbnail}
                      alt={file.fileName}
                      className="w-28 h-28 object-cover rounded border border-zinc-700 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(file);
                      }}
                    />
                  ) : file.mimeType?.startsWith("video/") && !(file.mimeType === "application/x-mpegurl" || file.fileName.toLowerCase().endsWith('.m3u8')) ? (
                    <VideoThumbnail
                      file={file}
                      size="lg"
                      className="cursor-pointer"
                      onClick={() => {
                        handlePreview(file);
                      }}
                    />
                  ) : (
                    <div className="text-zinc-400">
                      {getFileIcon(file.mimeType)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate text-zinc-100" title={file.fileName}>
                    {file.fileName}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    {!(file.mimeType?.startsWith("application/x-mpegurl") || file.fileName.toLowerCase().endsWith('.m3u8')) && (
                      <span>{formatFileSize(file.fileSize)}</span>
                    )}
                    {canPreview && (
                      <>
                        {!(file.mimeType?.startsWith("application/x-mpegurl") || file.fileName.toLowerCase().endsWith('.m3u8')) && <span>•</span>}
                        
                      </>
                    )}
                  </div>

                  {/* Upload progress for uploading files */}
                  {isUploading && (
                    <div className="mt-2 space-y-1">
                      <Progress value={uploadProgress} className="h-1.5 bg-zinc-800" />
                      <div className="flex justify-between items-center text-xs text-zinc-400">
                        <span>{formatFileSize(file.bytesUploaded || 0)} / {formatFileSize(file.totalBytes || 0)}</span>
                        <span>{Math.round(uploadProgress)}%</span>
                      </div>
                    </div>
                  )}

                  {/* Download progress */}
                  {isDownloading && (
                    <div className="mt-2 space-y-1">
                      <Progress value={downloadProgress} className="h-1.5 bg-zinc-800" />
                      <div className="text-xs text-zinc-400 text-center">
                        Downloading... {Math.round(downloadProgress)}%
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {canPreview && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-zinc-400 hover:text-zinc-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(file);
                      }}
                    >
                      <Eye className="h-4 w-4 md:mr-1" />
                      <span className="hidden md:inline">Preview</span>
                    </Button>
                  )}
                  {!(file.mimeType?.startsWith("application/x-mpegurl") || file.fileName.toLowerCase().endsWith('.m3u8')) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadMutation.mutate(file.id);
                      }}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <span className="text-xs">{Math.round(downloadProgress)}%</span>
                      ) : (
                        <>
                          <Download className="h-4 w-4 md:mr-1" />
                          <span className="hidden md:inline">Download</span>
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-zinc-400 hover:text-zinc-100"
                    onClick={(e) => {
                      handleShareItem('file', file.id);
                    }}
                    title="Share file"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {isDownloading && (
                <Progress value={downloadProgress} className="mt-2 h-1 bg-zinc-800" />
              )}
            </CardContent>
          </Card>
          
          {/* Tags section */}
          <FileTagsSection
            fileId={file.id}
            editingTags={editingTags}
            setEditingTags={setEditingTags}
            file={file}
          />
          
          {/* Comments section - only for non-extracted files */}
          {!file.id.startsWith('extracted_') && (
            <CommentsSection
              entityType="file"
              entityId={file.id}
              forumId={forumId}
              initialCommentCount={file.commentCount || 0}
            />
          )}
        </div>
      </div>
    );
  }
}

import { useIsMobile } from "@/hooks/use-mobile";
import type { Tag } from "@shared/schema";

function TagList({ tags }: { tags: Tag[] }) {
  const isMobile = useIsMobile();
  // Show 1 tag in mobile, 2 tags in laptop/desktop
  const limit = isMobile ? 1 : 2;
  const displayTags = tags.slice(0, limit);
  const remaining = tags.length - limit;

  return (
    <div className="flex flex-wrap gap-1">
      {displayTags.map((tag) => (
        <Badge
          key={tag.id}
          variant="outline"
          className="text-xs"
          style={{ borderColor: tag.color || "#6b7280", color: tag.color || "#6b7280" }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full mr-1"
            style={{ backgroundColor: tag.color || "#6b7280" }}
          />
          {tag.name}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="outline" className="text-xs text-muted-foreground">
          +{remaining}...
        </Badge>
      )}
    </div>
  );
}

// Separate component for message tags to handle hooks properly
function MessageTagsSection({ 
  messageId, 
  editingTags, 
  setEditingTags 
}: { 
  messageId: string; 
  editingTags: string | null; 
  setEditingTags: (id: string | null) => void; 
}) {
  const {
    selectedTags,
    availableTags,
    handleTagsChange,
    handleCreateTag,
    isUpdating,
  } = useEntityTagManager('message', messageId);

  return (
    <div className="flex items-center gap-2 mt-1">
      {editingTags === `message-${messageId}` ? (
        <div className="mt-2 p-2 border rounded-lg bg-muted/50 w-full">
          <TagInput
            selectedTags={selectedTags}
            onTagsChange={handleTagsChange}
            availableTags={availableTags}
            onCreateTag={handleCreateTag}
            placeholder="Add tags..."
            maxTags={10}
          />
          <div className="flex justify-end mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingTags(null)}
              disabled={isUpdating}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <>
          {selectedTags.length > 0 && <TagList tags={selectedTags} />}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setEditingTags(`message-${messageId}`)}
          >
            <TagIcon className="h-3 w-3 mr-1" />
            {selectedTags.length > 0 ? 'Edit' : 'Tag'}
          </Button>
        </>
      )}
    </div>
  );
}

// Separate component for file tags to handle hooks properly
function FileTagsSection({ 
  fileId, 
  editingTags, 
  setEditingTags,
  file 
}: { 
  fileId: string; 
  editingTags: string | null; 
  setEditingTags: (id: string | null) => void;
  file: FileWithChunks;
}) {
  const {
    selectedTags,
    availableTags,
    handleTagsChange,
    handleCreateTag,
    isUpdating,
  } = useEntityTagManager('file', fileId);

  const isExtractedFile = fileId.startsWith('extracted_');
  const [tagInput, setTagInput] = useState<string>("");
  const isMobile = useIsMobile();

  const updateExtractedTagsMutation = useMutation({
    mutationFn: async ({ fileId, tags }: { fileId: string; tags: string[] }) => {
      const extractedId = fileId.replace('extracted_', '');
      await apiRequest("POST", `/api/files/update-extracted-tags`, {
        id: extractedId,
        tags: tags.join(',')
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/forums", "files"] });
      setEditingTags(null);
      setTagInput("");
    },
    onError: (error: Error) => {
      console.error('Failed to update extracted tags:', error);
    },
  });

  if (isExtractedFile) {
    // Handle extracted files with string-based tags
    return (
      <div className="flex items-center gap-2 mt-1">
        {editingTags === `file-${fileId}` ? (
          <div className="mt-2 p-2 border rounded-lg bg-muted/50 w-full">
            <div className="flex gap-2 mb-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag..."
                className="flex-1 h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    e.preventDefault();
                    const currentTags = (file as any).tags || [];
                    const newTags = [...currentTags, tagInput.trim()];
                    updateExtractedTagsMutation.mutate({ fileId: file.id, tags: newTags });
                  }
                }}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (tagInput.trim()) {
                    const currentTags = (file as any).tags || [];
                    const newTags = [...currentTags, tagInput.trim()];
                    updateExtractedTagsMutation.mutate({ fileId: file.id, tags: newTags });
                  }
                }}
                disabled={!tagInput.trim() || updateExtractedTagsMutation.isPending}
                className="h-8 px-2"
              >
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {((file as any).tags || []).map((tag: string, index: number) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="text-xs"
                  style={{ backgroundColor: "#6b7280", color: "white" }}
                >
                  {tag.trim()}
                </Badge>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingTags(null);
                  setTagInput("");
                }}
                disabled={updateExtractedTagsMutation.isPending}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
              {(file as any).tags && (file as any).tags.length > 0 && (
                (() => {
                  const tags = (file as any).tags || [];
                  const limit = isMobile ? 1 : 2;
                  const displayTags = tags.slice(0, limit);
                  const remaining = tags.length - limit;
                  return (
                    <div className="flex flex-wrap gap-1">
                      {displayTags.map((tag: string, index: number) => (
                        <Badge
                          key={index}
                          variant="secondary"
                          className="text-xs"
                          style={{ backgroundColor: "#6b7280", color: "white" }}
                        >
                          {tag.trim()}
                        </Badge>
                      ))}
                      {remaining > 0 && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          +{remaining}...
                        </Badge>
                      )}
                    </div>
                  );
                })()
              )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setEditingTags(`file-${fileId}`)}
            >
              
              {((file as any).tags || []).length > 0 ? 'Edit Tags' : 'Add Tags'}
            </Button>
          </>
        )}
      </div>
    );
  }

  // Handle regular files with Tag objects
  return (
    <div className="flex items-center gap-2 mt-1">
      {editingTags === `file-${fileId}` ? (
        <div className="mt-2 p-2 border rounded-lg bg-muted/50 w-full">
          <TagInput
            selectedTags={selectedTags}
            onTagsChange={handleTagsChange}
            availableTags={availableTags}
            onCreateTag={handleCreateTag}
            placeholder="Add tags..."
            maxTags={10}
            disableRemoval={isExtractedFile}
          />
          <div className="flex justify-end mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditingTags(null)}
              disabled={isUpdating}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <>
          {selectedTags.length > 0 && <TagList tags={selectedTags} />}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setEditingTags(`file-${fileId}`)}
          >
            <TagIcon className="h-3 w-3 mr-1" />
            {selectedTags.length > 0 ? 'Edit' : 'Tag'}
          </Button>
        </>
      )}
    </div>
  );
}

export function UnifiedTimeline({ messages, files, forumId, scrollToMessage, scrollToFile, ws, uploadProgress, onLoadMore, hasMore, isLoadingMore, totalFiles, extractedCount }: UnifiedTimelineProps) {
  // totalFiles is passed in via props destructuring
  // it may be undefined/null if not provided
  
  const { toast } = useToast();
  const { user } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingFiles, setDownloadingFiles] = useState<Record<string, number>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, {
    progress: number;
    fileName: string;
    bytesUploaded: number;
    totalBytes: number;
  }>>({});
  const [previewFile, setPreviewFile] = useState<FileWithChunks | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingTags, setEditingTags] = useState<string | null>(null);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  // Handle WebSocket messages for download progress
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === 'download_progress') {
        console.log(`[UnifiedTimeline] Download progress for file ${data.fileId}: ${data.progress}%`);
        setDownloadingFiles((prev) => ({
          ...prev,
          [data.fileId]: data.progress,
        }));
      } else if (data.type === 'upload_progress') {
        console.log('[UnifiedTimeline] Received upload_progress event:', data.data);
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
        console.log('[UnifiedTimeline] File uploaded:', data.data);
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
        console.log(`[UnifiedTimeline] Download completed for file ${data.fileId}`);
        setDownloadingFiles((prev) => {
          const { [data.fileId]: _, ...rest } = prev;
          return rest;
        });
      } else if (data.type === 'download_error') {
        console.error(`[UnifiedTimeline] Download error for file ${data.fileId}:`, data.error);
        setDownloadingFiles((prev) => {
          const { [data.fileId]: _, ...rest } = prev;
          return rest;
        });
        toast({
          title: "Download failed",
          description: data.error || "An error occurred during download",
          variant: "destructive",
        });
      } else if (data.type === 'file_deleted') {
        console.log('[UnifiedTimeline] File deleted:', data.fileId);
        queryClient.invalidateQueries({ predicate: (query) => {
          const k = query.queryKey as any[];
          return Array.isArray(k) && k[0] === '/api/forums' && k[1] === data.forumId && k[2] === 'files';
        }});
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, user?.id, toast]);

  const timelineItems: TimelineItem[] = [
    // Add uploading files at the top
    ...Object.entries(uploadingFiles).map(([uploadId, uploadInfo]) => ({
      type: "file" as const,
      date: new Date(), // Current time for uploading items
      data: {
        id: uploadId,
        fileName: uploadInfo.fileName,
        fileSize: uploadInfo.totalBytes,
        uploadedAt: new Date().toISOString(),
        user: { username: "Uploading...", id: "uploading" },
        mimeType: null,
        checksum: "",
        adminThumbnailUrl: null,
        thumbnail: null,
        isUploading: true,
        uploadProgress: uploadInfo.progress,
        bytesUploaded: uploadInfo.bytesUploaded,
        totalBytes: uploadInfo.totalBytes,
      } as FileWithChunks & { isUploading: boolean; uploadProgress: number; bytesUploaded: number; totalBytes: number },
    })),
    ...messages.map((msg) => ({
      type: "message" as const,
      date: new Date(msg.createdAt),
      data: msg,
    })),
    ...files.map((file) => ({
      type: "file" as const,
      date: new Date(file.uploadedAt),
      data: file,
    })),
  ].sort((a, b) => {
    // Keep uploading items at the top
    if ((a.data as any).isUploading) return -1;
    if ((b.data as any).isUploading) return 1;
    return b.date.getTime() - a.date.getTime();
  });

  const getInitials = (username: string) => {
    return username.slice(0, 2).toUpperCase();
  };

  const handleCopyMessage = (message: string, id: string) => {
    navigator.clipboard.writeText(message);
    setCopiedId(id);
    toast({
      title: "Copied!",
      description: "Message copied to clipboard",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleShareItem = async (type: 'message' | 'file', id: string) => {
    try {
      // Production-ready URL generation with fallback support
      const getBaseUrl = () => {
        // Check for custom base URL (useful for reverse proxy/CDN deployments)
        if (import.meta.env.VITE_BASE_URL) {
          return import.meta.env.VITE_BASE_URL;
        }
        // Fallback to current origin (works for most deployments)
        return window.location.origin;
      };

      const baseUrl = getBaseUrl();
      const forumUrl = `${baseUrl}/forum/${forumId}?${type}=${id}`;

      // Validate URL before copying
      try {
        new URL(forumUrl);
      } catch {
        throw new Error('Invalid URL generated');
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(forumUrl);

      toast({
        title: "Link copied!",
        description: `Shareable ${type} link copied to clipboard`,
      });
    } catch (error) {
      console.error('Failed to copy link to clipboard:', error);
      toast({
        title: "Copy failed",
        description: "Unable to copy link to clipboard. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getFileIcon = (mimeType?: string | null) => {
    if (!mimeType) return <File className="h-20 w-22 text-muted-foreground" />;
    
    if (mimeType.startsWith("image/")) {
      return <ImageIcon className="h-20 w-22 text-blue-500" />;
    } else if (mimeType.startsWith("video/")) {
      return <FileVideo className="h-20 w-22 text-purple-500" />;
    } else if (mimeType.includes("pdf")) {
      return <FileText className="h-20 w-22 text-red-500" />;
    } else if (mimeType.includes("zip") || mimeType.includes("archive")) {
      return <FileArchive className="h-20 w-22 text-yellow-500" />;
    }
    return <FileText className="h-20 w-22 text-muted-foreground" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderMessageContent = (content: string) => {
    // Simple code block detection and rendering
    const codeBlockRegex = /```([\s\S]*?)```/g;
    const inlineCodeRegex = /`([^`]+)`/g;
    
    // Split content by code blocks
    const parts = [];
    let lastIndex = 0;
    let match;
    
    // Handle code blocks
    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const beforeText = content.slice(lastIndex, match.index);
        if (beforeText.trim()) {
          parts.push(
            <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
              {renderInlineCode(beforeText)}
            </span>
          );
        }
      }
      
      // Add code block
      const codeContent = match[1];
      parts.push(
        <pre key={`code-${match.index}`} className="bg-gray-100 dark:bg-gray-800 rounded p-3 mt-2 mb-2 overflow-x-auto text-sm font-mono border max-w-full whitespace-pre-wrap break-words">
          <code className="whitespace-pre-wrap break-words">{codeContent}</code>
        </pre>
      );
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex);
      if (remainingText.trim()) {
        parts.push(
          <span key={`text-${lastIndex}`} className="whitespace-pre-wrap break-words">
            {renderInlineCode(remainingText)}
          </span>
        );
      }
    }
    
    // If no code blocks found, just render with preserved whitespace
    if (parts.length === 0) {
      return (
        <span className="whitespace-pre-wrap break-words">
          {renderInlineCode(content)}
        </span>
      );
    }
    
    return <>{parts}</>;
  };

  const renderInlineCode = (text: string) => {
    const inlineCodeRegex = /`([^`]+)`/g;
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const italicRegex = /\*([^*]+)\*/g;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    
    // First handle inline code
    let processedText = text.replace(inlineCodeRegex, '\u0000CODE:$1\u0000');
    
    // Then handle bold
    processedText = processedText.replace(boldRegex, '\u0001BOLD:$1\u0001');
    
    // Then handle italic
    processedText = processedText.replace(italicRegex, '\u0002ITALIC:$1\u0002');
    
    // Then handle URLs
    processedText = processedText.replace(urlRegex, '\u0003URL:$1\u0003');
    
    // Split by our markers and render
    const parts = processedText.split(/(\u0000[^\u0000]*\u0000|\u0001[^\u0001]*\u0001|\u0002[^\u0002]*\u0002|\u0003[^\u0003]*\u0003)/g);
    
    return parts.map((part, index) => {
      if (part.startsWith('\u0000CODE:') && part.endsWith('\u0000')) {
        const code = part.slice(6, -1);
        return (
          <code key={index} className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">
            {code}
          </code>
        );
      } else if (part.startsWith('\u0001BOLD:') && part.endsWith('\u0001')) {
        const boldText = part.slice(6, -1);
        return <strong key={index}>{boldText}</strong>;
      } else if (part.startsWith('\u0002ITALIC:') && part.endsWith('\u0002')) {
        const italicText = part.slice(8, -1);
        return <em key={index}>{italicText}</em>;
      } else if (part.startsWith('\u0003URL:') && part.endsWith('\u0003')) {
        const url = part.slice(5, -1);
        return (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            {url}
          </a>
        );
      } else {
        return part;
      }
    });
  };

  const downloadMutation = useMutation({
    mutationFn: async (fileId: string) => {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            setDownloadingFiles((prev) => ({
              ...prev,
              [fileId]: percentComplete,
            }));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const blob = xhr.response;
            const url = window.URL.createObjectURL(blob);
            const file = files.find((f) => f.id === fileId) as FileWithChunks;
            
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
    onError: (error: Error) => {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Download complete",
        description: "File downloaded successfully",
      });
    },
  });

  const handlePreview = (file: FileWithChunks) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    setTimeout(() => setPreviewFile(null), 300);
  };

  // Auto-scroll to bottom when new items are added
  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timelineItems.length]);

  // Auto-scroll to specific message or file when URL parameters are present
  useEffect(() => {
    if (scrollToMessage || scrollToFile) {
      // Small delay to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        const targetId = scrollToMessage ? `message-${scrollToMessage}` : `file-${scrollToFile}`;
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          // Add a highlight effect
          element.classList.add("ring-2", "ring-primary", "ring-opacity-50");
          setTimeout(() => {
            element.classList.remove("ring-2", "ring-primary", "ring-opacity-50");
          }, 3000);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [timelineItems.length, scrollToMessage, scrollToFile]);

  if (timelineItems.length === 0) {
    return (
      <div className="flex-1 flex items-start justify-center text-muted-foreground pt-20">
        <div className="text-center">
          <p className="text-lg mb-2">No messages or files yet</p>
          <p className="text-sm">Start a conversation or upload a file</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <FilePreviewDialog
        file={previewFile}
        open={previewOpen}
        onClose={handleClosePreview}
        onDownload={(fileId) => downloadMutation.mutate(fileId)}
      />
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-full">
        {timelineItems.map((item, index) => (
          <TimelineItem
            key={item.type === "message" ? `msg-${(item.data as MessageWithUser).id}` : `file-${(item.data as FileWithChunks).id}`}
            item={item}
            index={index}
            copiedId={copiedId}
            setCopiedId={setCopiedId}
            downloadingFiles={downloadingFiles}
            setDownloadingFiles={setDownloadingFiles}
            previewFile={previewFile}
            setPreviewFile={setPreviewFile}
            setPreviewOpen={setPreviewOpen}
            editingTags={editingTags}
            setEditingTags={setEditingTags}
            downloadMutation={downloadMutation}
            handleCopyMessage={handleCopyMessage}
            handleShareItem={handleShareItem}
            getInitials={getInitials}
            getFileIcon={getFileIcon}
            formatFileSize={formatFileSize}
            renderMessageContent={renderMessageContent}
            handlePreview={handlePreview}
            forumId={forumId}
          />
        ))}
        <div ref={timelineEndRef} />
        {hasMore && onLoadMore && (
          <div className="flex justify-center py-4">
            {typeof totalFiles === 'number' && (
              <div className="w-full flex flex-col sm:flex-row items-center sm:justify-center gap-3 mb-3" aria-live="polite">
                <div className="flex items-center gap-3 bg-gradient-to-r from-zinc-900 to-zinc-800 border border-zinc-800 px-3 py-2 rounded-full shadow-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="text-[11px] text-muted-foreground leading-none uppercase tracking-wide">Total files</div>
                  <div className="text-lg sm:text-xl font-semibold text-zinc-100">{totalFiles}</div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 items-center">
                  {typeof extractedCount === 'number' && extractedCount > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Includes <span className="font-medium text-zinc-100">{extractedCount}</span> extracted
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">Showing <span className="font-medium text-zinc-100">{files.length}</span> files</div>
                </div>
              </div>
            )}
            <Button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              variant="outline"
              size="sm"
              className="min-w-[140px] rounded-full px-4"
            >
              {isLoadingMore ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
