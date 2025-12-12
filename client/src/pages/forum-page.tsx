import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useSearch, useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useEntityTagManager } from "@/hooks/use-tags";
import { queryClient } from "@/lib/queryClient";
import type { Forum, MessageWithUser, FileWithChunks } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Send, Upload as UploadIcon, Users, X,
  MessageSquare, FileText, Tag as TagIcon, Edit3,
  Search, X as XIcon
} from "lucide-react";
import { FileUpload } from "@/components/file-upload";
import { FileList } from "@/components/file-list";
import { FilePreviewDialog } from "@/components/file-preview-dialog";
import { UnifiedTimeline } from "@/components/unified-timeline";
import { PartialUploadsManager } from "@/components/partial-uploads-manager";
import { PeoplePanel } from "@/components/people-panel";
import { AccessRequestsManager } from "@/components/access-requests-manager";
import { TagInput } from "@/components/tag-input";
import { StructuredData } from "@/components/structured-data";
import { MetaTags } from "@/components/meta-tags";
import { useIsMobile } from "@/hooks/use-mobile";
import { generateStructuredData } from "@/lib/seo-utils";

interface TagItem {
  id: string;
  name: string;
  color?: string | null;
}

function TagList({ tags }: { tags?: TagItem[] }) {
  const isMobile = useIsMobile();
  const limit = isMobile ? 1 : 3;
  const safeTags = tags || [];
  const displayTags = safeTags.slice(0, limit);
  const remaining = Math.max(0, safeTags.length - limit);

  return (
    <div className="flex flex-wrap gap-1 items-center min-h-6">
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

export default function ForumPage() {
  const [, params] = useRoute("/forum/:id");
  const search = useSearch();
  const forumId = params?.id;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
    const { data: forum, isLoading: forumLoading } = useQuery<Forum>({
      queryKey: ["/api/forums", forumId],
      enabled: !!forumId,
    });

    // Redirect to /auth if forum is private and user is not authenticated
    useEffect(() => {
      if (forum && !forum.isPublic && !user) {
        window.location.replace('/auth');
      }
    }, [forum, user]);
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [message, setMessage] = useState("");
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [showPeoplePanel, setShowPeoplePanel] = useState(false);
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{
    uploadId: string;
    progress: number;
    status: string;
    error?: string;
  } | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [messages, setMessages] = useState<MessageWithUser[]>([]);
  const [viewMode, setViewMode] = useState<"timeline" | "files">("timeline");
  const [previewFile, setPreviewFile] = useState<FileWithChunks | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingForumTags, setEditingForumTags] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [filesLimit, setFilesLimit] = useState(10);
  const [filesOffset, setFilesOffset] = useState(0);
  const [allFiles, setAllFiles] = useState<FileWithChunks[]>([]);
  const [hasMoreFiles, setHasMoreFiles] = useState(true);
  const [totalFilesCount, setTotalFilesCount] = useState<number | null>(null);
  const [extractedFilesCount, setExtractedFilesCount] = useState<number | null>(null);

  // Debounce search query for performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Parse URL parameters for deep linking
  const urlParams = new URLSearchParams(search);
  const scrollToMessage = urlParams.get('message');
  const scrollToFile = urlParams.get('file');

  const { data: initialMessages, isLoading: messagesLoading } = useQuery<MessageWithUser[]>({
    queryKey: ["/api/forums", forumId, "messages"],
    enabled: !!forumId,
  });

  const { data: files, isLoading: filesLoading, refetch: refetchFiles } = useQuery<FileWithChunks[]>({
    queryKey: ["/api/forums", forumId, "files", filesLimit, filesOffset],
    queryFn: async () => {
      const response = await fetch(`/api/forums/${forumId}/files?limit=${filesLimit}&offset=${filesOffset}`);
      if (!response.ok) throw new Error('Failed to fetch files');
      return response.json();
    },
    enabled: !!forumId,
    keepPreviousData: true,
  });

  // Global search query for when user searches
  const includeExtracted = forum?.name === 'Xmaster';

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["/api/search", debouncedSearchQuery, forumId],
    queryFn: async () => {
      const q = encodeURIComponent(debouncedSearchQuery);
      const res = await fetch(`/api/search?q=${q}${forumId ? `&forumId=${forumId}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch search results');
      return res.json();
    },
    enabled: !!debouncedSearchQuery.trim(),
    onSuccess: (data) => {
      console.log('[ForumPage] Search results loaded:', data);
      (data.files || []).forEach((f: any) => fetchAndMergeFile(f));
      // Merge search results into forum files view for immediate availability
      try {
        setAllFiles(prev => {
          const map: Record<string, any> = {};
          prev.forEach((f: any) => { map[f.id] = f; });
          (data.files || []).forEach((f: any) => {
            if (f.forumId === forumId || String(f.id).startsWith('extracted_')) {
              if (!map[f.id]) map[f.id] = f;
            }
          });
          return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        });
      } catch (err) {
        console.warn('Failed merging search results into allFiles', err);
      }
    },
    onError: (error) => console.log('[ForumPage] Search error:', error),
  });

  // Paginated aggregated search state (merged local + extracted)
  const [searchFiles, setSearchFiles] = useState<any[]>([]);
  // Track totals separately to avoid "Showing 9 of 0" when extracted files exist
  const [searchLocalTotalFiles, setSearchLocalTotalFiles] = useState<number>(0);
  const [searchExtractedTotalFiles, setSearchExtractedTotalFiles] = useState<number>(0);
  const [searchTotalFiles, setSearchTotalFiles] = useState<number>(0);
  const [searchOffset, setSearchOffset] = useState<number>(0);
  const searchLimit = 20;
  const [isLoadingSearchPage, setIsLoadingSearchPage] = useState(false);

  const fetchSearchPage = async (offset: number) => {
    if (!debouncedSearchQuery.trim()) return;
    setIsLoadingSearchPage(true);
    try {
      const q = encodeURIComponent(debouncedSearchQuery);
      const res = await fetch(`/api/search?q=${q}${forumId ? `&forumId=${forumId}` : ''}&limit=${searchLimit}&offset=${offset}`);
      if (!res.ok) throw new Error('Failed to fetch search results');
      const data = await res.json();
      // data.files, data.totalFiles, data.forums, data.messages
      // Append new files while deduping
      setSearchFiles(prev => {
        const map: Record<string, any> = {};
        prev.forEach(f => { map[f.id] = f; });
        (data.files || []).forEach((f: any) => { map[f.id] = map[f.id] || f; });
        // Maintain ordering by uploadedAt desc
        return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      });
      // Start prefetching details for incoming files if necessary
      (data.files || []).forEach((f: any) => fetchAndMergeFile(f));
      // Also merge returned search files into the forum's file list (so they appear on the page)
      try {
        setAllFiles(prev => {
          const map: Record<string, any> = {};
          prev.forEach((f: any) => { map[f.id] = f; });
          (data.files || []).forEach((f: any) => {
            // Only add files that belong to this forum (or extracted)
            if (f.forumId === forumId || String(f.id).startsWith('extracted_')) {
              if (!map[f.id]) map[f.id] = f;
            }
          });
          // Sort by uploadedAt desc
          return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        });
      } catch (err) {
        console.warn('Failed to merge search results into allFiles', err);
      }
      setSearchLocalTotalFiles(data.totalFiles || 0);
      setSearchOffset(offset + (data.files || []).length);
    } catch (err) {
      console.error('Search page fetch failed', err);
    } finally {
      setIsLoadingSearchPage(false);
    }
  };

  // Reset and load first page when query changes
  useEffect(() => {
    if (!debouncedSearchQuery.trim()) {
      setSearchFiles([]);
      setSearchLocalTotalFiles(0);
      setSearchExtractedTotalFiles(0);
      setSearchTotalFiles(0);
      setSearchOffset(0);
      return;
    }
    setSearchFiles([]);
    setSearchLocalTotalFiles(0);
    setSearchExtractedTotalFiles(0);
    setSearchTotalFiles(0);
    setSearchOffset(0);
    fetchSearchPage(0);
  }, [debouncedSearchQuery, forumId]);

  // Recalculate the combined total whenever local/extracted totals change
  useEffect(() => {
    setSearchTotalFiles((searchLocalTotalFiles || 0) + (searchExtractedTotalFiles || 0));
  }, [searchLocalTotalFiles, searchExtractedTotalFiles]);

  // Load more search results
  const loadMoreSearchResults = async () => {
    if (isLoadingSearchPage) return;
    await fetchSearchPage(searchOffset);
  };

  // Extracted (neon) DB search for live updates or Xmaster forum
  const { data: extractedSearchResults, isLoading: isSearchingExtracted } = useQuery({
    queryKey: ["/api/search/extracted", debouncedSearchQuery, forumId],
    queryFn: async () => {
      const q = encodeURIComponent(debouncedSearchQuery);
      const res = await fetch(`/api/search/extracted?q=${q}${forumId ? `&forumId=${forumId}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch extracted search results');
      return res.json();
    },
    enabled: !!debouncedSearchQuery.trim() && includeExtracted,
    onSuccess: (data) => {
      console.log('[ForumPage] Extracted search results loaded:', data);
      // Merge extracted results and update extracted total
      if (data && Array.isArray(data.files)) {
        setSearchFiles(prev => {
          const map: Record<string, any> = {};
          prev.forEach(f => { map[f.id] = f; });
          (data.files || []).forEach((f: any) => { map[f.id] = map[f.id] || f; });
          return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        });
      }
      // Prefetch details for each extracted file (no-op for extracted but keeps UI consistent)
      (data.files || []).forEach((f: any) => fetchAndMergeFile(f));
      // Merge into forum file list so extracted results are visible in the forum view
      try {
        setAllFiles(prev => {
          const map: Record<string, any> = {};
          prev.forEach((f: any) => { map[f.id] = f; });
          (data.files || []).forEach((f: any) => { if (!map[f.id]) map[f.id] = f; });
          return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        });
      } catch (err) {
        console.warn('Failed merging extracted results into allFiles', err);
      }
      setSearchExtractedTotalFiles(data.totalFiles || 0);
    },
    onError: (error) => console.log('[ForumPage] Extracted search error:', error),
  });

  const [streamedExtractedResults, setStreamedExtractedResults] = useState<any[]>([]);
  const extractedSSERef = useRef<EventSource | null>(null);
  const [isStreamingExtracted, setIsStreamingExtracted] = useState(false);
  const [streamedLocalResults, setStreamedLocalResults] = useState<any[]>([]);
  const localSSERef = useRef<EventSource | null>(null);
  const [isStreamingLocal, setIsStreamingLocal] = useState(false);

  // Setup SSE streaming for extracted DB search
  useEffect(() => {
    // Close existing SSE if any
    if (extractedSSERef.current) {
      extractedSSERef.current.close();
      extractedSSERef.current = null;
    }
    setStreamedExtractedResults([]);

    if (!debouncedSearchQuery.trim() || !includeExtracted) return;

    const q = encodeURIComponent(debouncedSearchQuery);
    const url = `/api/search/extracted/stream?q=${q}${forumId ? `&forumId=${forumId}` : ''}`;
    try {
      setIsStreamingExtracted(true);
      const es = new EventSource(url);
      extractedSSERef.current = es;
      es.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed && parsed.type === 'file' && parsed.data) {
            // Merge and fetch details as needed
            fetchAndMergeFile(parsed.data);
          }
        } catch (err) {
          console.error('Failed to parse SSE message', err);
        }
      };
      // Listen for count events to show incremental totals
      es.addEventListener('count', (ev: MessageEvent) => {
        try {
          const payload = JSON.parse((ev as any).data || '{}');
          if (payload && typeof payload.count === 'number') {
            setSearchExtractedTotalFiles(payload.count);
          }
        } catch (err) {
          console.warn('Failed to parse extracted count event', err);
        }
      });
      es.addEventListener('done', () => {
        es.close();
        extractedSSERef.current = null;
        setIsStreamingExtracted(false);
      });
      es.onerror = (e) => {
        console.warn('Extracted SSE error', e);
        es.close();
        extractedSSERef.current = null;
        setIsStreamingExtracted(false);
      };
    } catch (e) {
      console.error('Failed to open extracted SSE', e);
    }
    return () => {
      if (extractedSSERef.current) {
        extractedSSERef.current.close();
        extractedSSERef.current = null;
      }
    };
  }, [debouncedSearchQuery, includeExtracted, forumId]);

  // Setup SSE streaming for local DB search results
  useEffect(() => {
    if (localSSERef.current) {
      localSSERef.current.close();
      localSSERef.current = null;
    }
    setStreamedLocalResults([]);

    if (!debouncedSearchQuery.trim()) return;
    const q = encodeURIComponent(debouncedSearchQuery);
    const url = `/api/search/stream?q=${q}${forumId ? `&forumId=${forumId}` : ''}`;
    try {
      setIsStreamingLocal(true);
      const es = new EventSource(url);
      localSSERef.current = es;
      es.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed && parsed.type === 'file' && parsed.data) {
            // Merge and fetch details as needed
            fetchAndMergeFile(parsed.data);
          }
        } catch (err) {
          console.error('Failed to parse local SSE message', err);
        }
      };
      // Listen for count events from local SSE
      es.addEventListener('count', (ev: MessageEvent) => {
        try {
          const payload = JSON.parse((ev as any).data || '{}');
          if (payload && typeof payload.count === 'number') {
            setSearchLocalTotalFiles(payload.count);
          }
        } catch (err) {
          console.warn('Failed to parse local count event', err);
        }
      });
      es.addEventListener('done', () => { es.close(); localSSERef.current = null; setIsStreamingLocal(false); });
      es.onerror = (e) => { console.warn('Local SSE error', e); es.close(); localSSERef.current = null; setIsStreamingLocal(false); };
    } catch (e) {
      console.error('Failed to open local SSE', e);
    }
    return () => {
      if (localSSERef.current) {
        localSSERef.current.close();
        localSSERef.current = null;
      }
    };
  }, [debouncedSearchQuery, forumId]);

  // Merge streamed SSE results into paginated search list as they arrive
  useEffect(() => {
    if (!debouncedSearchQuery.trim()) return;
    if (streamedLocalResults.length === 0 && streamedExtractedResults.length === 0) return;

    setSearchFiles(prev => {
      const map: Record<string, any> = {};
      prev.forEach(f => { map[f.id] = f; });
      // Prepend streamed results so they appear at top
      [...streamedExtractedResults, ...streamedLocalResults].forEach((f: any) => {
        if (!map[f.id]) map[f.id] = f;
      });
      return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    });
  }, [streamedLocalResults, streamedExtractedResults, debouncedSearchQuery]);

  // Keep a ref of IDs being fetched to avoid duplicate fetches
  const fetchingFileIdsRef = useRef<Set<string>>(new Set());

  // Helper: fetch full file details and merge into the search results
  const fetchAndMergeFile = async (incoming: any) => {
    if (!incoming || !incoming.id) return;
    const id = incoming.id;
    // If it's extracted, the SSE data already has enough info; still merge but don't fetch
    const isExtracted = id.startsWith('extracted_');
    // If we already have a file with chunks or directDownloadUrl present, skip fetching
    const existing = searchFiles.find(f => f.id === id) || streamedLocalResults.find(f => f.id === id) || streamedExtractedResults.find(f => f.id === id);
    if (existing && (existing.chunks?.length > 0 || existing.directDownloadUrl || isExtracted)) {
      // Merge incoming minimally if needed and return
      setSearchFiles(prev => {
        const map: Record<string, any> = {};
        prev.forEach(f => map[f.id] = f);
        if (!map[id]) map[id] = incoming;
        return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      });
      return;
    }

    if (isExtracted) {
      // Merge extracted file object as-is
      setSearchFiles(prev => {
        const map: Record<string, any> = {};
        prev.forEach(f => map[f.id] = f);
        map[id] = incoming;
        return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      });
      return;
    }

    // For local files, fetch full details from server to include chunks etc.
    if (fetchingFileIdsRef.current.has(id)) return;
    fetchingFileIdsRef.current.add(id);
    try {
      const res = await fetch(`/api/files/${id}`);
      if (!res.ok) {
        // If server doesn't have full file route available, fall back to merging incoming
        setSearchFiles(prev => {
          const map: Record<string, any> = {};
          prev.forEach(f => map[f.id] = f);
          map[id] = map[id] || incoming;
          return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        });
        return;
      }
      const fullFile = await res.json();
      setSearchFiles(prev => {
        const map: Record<string, any> = {};
        prev.forEach(f => map[f.id] = f);
        map[id] = { ...map[id], ...fullFile };
        return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      });
    } catch (err) {
      console.warn('Failed to fetch file details for', id, err);
      setSearchFiles(prev => {
        const map: Record<string, any> = {};
        prev.forEach(f => map[f.id] = f);
        map[id] = map[id] || incoming;
        return Object.values(map).sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      });
    } finally {
      fetchingFileIdsRef.current.delete(id);
    }
  };

  // Fetch specific file when file parameter is present
  const { data: specificFile, isLoading: specificFileLoading } = useQuery<FileWithChunks>({
    queryKey: ["/api/files", scrollToFile],
    queryFn: async () => {
      const response = await fetch(`/api/files/${scrollToFile}`);
      if (!response.ok) throw new Error('Failed to fetch file');
      return response.json();
    },
    enabled: !!scrollToFile,
  });

  // Fetch related files when specific file is loaded
  const { data: relatedFiles, isLoading: relatedFilesLoading } = useQuery<FileWithChunks[]>({
    queryKey: ["/api/files", scrollToFile, "related"],
    queryFn: async () => {
      const response = await fetch(`/api/files/${scrollToFile}/related`);
      if (!response.ok) throw new Error('Failed to fetch related files');
      return response.json();
    },
    enabled: !!scrollToFile && !!specificFile,
  });

  // Accumulate files when new data arrives
  useEffect(() => {
    if (files) {
      if (allFiles.length === 0) {
        setAllFiles(files);
      } else {
        // Deduplicate files by ID before appending
        const existingIds = new Set(allFiles.map(f => f.id));
        const newFiles = files.filter(f => !existingIds.has(f.id));
        setAllFiles(prev => [...prev, ...newFiles]);
      }
      setHasMoreFiles(files.length === filesLimit);
    }
  }, [files, filesLimit]);

  // Include specific file and related files when file parameter is present
  useEffect(() => {
    if (scrollToFile && specificFile && relatedFiles) {
      const combinedFiles = [specificFile, ...relatedFiles];
      // Remove duplicates
      const existingIds = new Set(allFiles.map(f => f.id));
      const newFiles = combinedFiles.filter(f => !existingIds.has(f.id));
      if (newFiles.length > 0) {
        setAllFiles(prev => [...prev, ...newFiles]);
      }
    }
  }, [scrollToFile, specificFile, relatedFiles, allFiles]);

  const loadMoreFiles = async () => {
    setFilesOffset(prev => prev + filesLimit);
  };

  useEffect(() => {
    if (!forumId) return;
    const fetchCounts = async () => {
      try {
        const res = await fetch(`/api/forums/${forumId}/files/count`);
        if (!res.ok) throw new Error('Failed to fetch file counts');
        const data = await res.json();
        setTotalFilesCount(data.total || 0);
        setExtractedFilesCount(data.extractedCount || 0);
      } catch (err) {
        console.error('Failed to fetch file counts:', err);
      }
    };
    fetchCounts();
  }, [forumId, filesOffset]);

  // Do not eagerly fetch all forum tags on page load (can be expensive).
  // `ForumTagsSection` will fetch tags on demand when editing.
  const forumTags: any[] = [];


  // Initialize messages from query data
  useEffect(() => {
    if (initialMessages) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  // WebSocket connection for real-time messages
  useEffect(() => {
    if (!forumId || !user) return;
    // Only connect WebSocket if user is authenticated
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "join", forumId }));
    };
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message" && data.forumId === forumId) {
        setMessages((prev) => [...prev, data.message]);
      } else if (data.type === "upload_progress") {
        console.log('[Client] Received upload_progress:', data.data);
        setUploadProgress(data.data);
      } else if (data.type === "upload_error") {
        setUploadProgress({
          uploadId: data.data.uploadId,
          progress: 0,
          status: 'error',
          error: data.data.error
        });
      } else if (data.type === "access_request_update" && data.forumId === forumId) {
        queryClient.invalidateQueries({ queryKey: ["/api/forums", forumId] });
        queryClient.invalidateQueries({ queryKey: ["/api/forums", forumId, "members"] });
        queryClient.invalidateQueries({ queryKey: ["/api/forums", forumId, "access-requests"] });
      } else if (data.type === 'comment_created' && data.forumId === forumId) {
        const comment = data.comment;
        if (comment) {
          // Invalidate comments for the specific entity
          queryClient.invalidateQueries({ queryKey: ["/api/comments", comment.entityType, comment.entityId] });

          // Also refresh messages/files if needed so UI that shows counts or previews updates
          if (comment.entityType === 'message') {
            queryClient.invalidateQueries({ queryKey: ["/api/forums", forumId, "messages"] });
          } else if (comment.entityType === 'file') {
            queryClient.invalidateQueries({ queryKey: ["/api/forums", forumId, "files"] });
          }

          // Optionally show a subtle toast for comments created by others
          if (comment.userId !== user?.id) {
            toast({
              title: 'New comment',
              description: `New comment on ${comment.entityType}`,
            });
          }
        }
      } else if (data.type === 'comment_updated' && data.forumId === forumId) {
        const comment = data.comment;
        if (comment) {
          queryClient.invalidateQueries({ queryKey: ["/api/comments", comment.entityType, comment.entityId] });
        }
      } else if (data.type === 'comment_deleted' && data.forumId === forumId) {
        const { entityType, entityId } = data;
        if (entityType && entityId) {
          queryClient.invalidateQueries({ queryKey: ["/api/comments", entityType, entityId] });
        }
      } else if (data.type === "file_uploaded" && data.forumId === forumId) {
        // Refresh files list when a new file is uploaded
        console.log("File uploaded:", data.file);
        // Invalidate any files query for this forum (supports paginated keys)
        queryClient.invalidateQueries({ predicate: (query) => {
          const k = query.queryKey as any[];
          return Array.isArray(k) && k[0] === "/api/forums" && k[1] === forumId && k[2] === "files";
        }});
        // Also refresh partial uploads as one might have completed
        queryClient.invalidateQueries({ queryKey: ["/api/partial-uploads"] });
        // Optimistically merge the file into the local files list
        if (data.file) {
          setAllFiles(prev => {
            if (prev.some(f => f.id === data.file.id)) return prev;
            return [data.file, ...prev];
          });
        }
      } else if (data.type === "file_deleted" && data.forumId === forumId) {
        console.log('File deleted:', data.fileId);
        // Invalidate file queries for this forum
        queryClient.invalidateQueries({ predicate: (query) => {
          const k = query.queryKey as any[];
          return Array.isArray(k) && k[0] === "/api/forums" && k[1] === forumId && k[2] === "files";
        }});
        // Remove from local list immediately for snappy UI
        setAllFiles(prev => prev.filter(f => f.id !== data.fileId));
      } else if (data.type === "member_added" && data.forumId === forumId) {
        // Refresh members list when a new member is added
        console.log("Member added:", data);
        queryClient.invalidateQueries({ queryKey: ["/api/forums", forumId, "members"] });
      } else if (data.type === "comment_created" && data.forumId === forumId) {
        // Refresh comments for the entity when a new comment is created
        console.log("Comment created:", data.comment);
        queryClient.invalidateQueries({ queryKey: ["/api/comments", data.comment.entityType, data.comment.entityId] });
      } else if (data.type === "comment_updated" && data.forumId === forumId) {
        // Refresh comments for the entity when a comment is updated
        console.log("Comment updated:", data.comment);
        queryClient.invalidateQueries({ queryKey: ["/api/comments", data.comment.entityType, data.comment.entityId] });
      } else if (data.type === "comment_deleted" && data.forumId === forumId) {
        // Refresh comments for the entity when a comment is deleted
        console.log("Comment deleted:", data.commentId);
        queryClient.invalidateQueries({ queryKey: ["/api/comments", data.entityType, data.entityId] });
      } else if (data.type === "tag_created") {
        // Refresh tags when a new tag is created
        console.log("Tag created:", data.tag);
        queryClient.invalidateQueries({ queryKey: ['tags'] });
      } else if (data.type === "tag_updated") {
        // Refresh tags when a tag is updated
        console.log("Tag updated:", data.tag);
        queryClient.invalidateQueries({ queryKey: ['tags'] });
      } else if (data.type === "tag_deleted") {
        // Refresh tags when a tag is deleted
        console.log("Tag deleted:", data.tagId);
        queryClient.invalidateQueries({ queryKey: ['tags'] });
      } else if (data.type === "tags_assigned" && data.forumId === forumId) {
        // Refresh entity tags when tags are assigned
        console.log("Tags assigned:", data);
        queryClient.invalidateQueries({ queryKey: ['tags', 'entity', data.entityType, data.entityId] });
      } else if (data.type === "tag_removed" && data.forumId === forumId) {
        // Refresh entity tags when a tag is removed
        console.log("Tag removed:", data);
        queryClient.invalidateQueries({ queryKey: ['tags', 'entity', data.entityType, data.entityId] });
      } else if (data.type === "error") {
        console.error("WebSocket error:", data.message);
        // You could show a toast notification here
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
    };

    setWs(socket);

    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [forumId, user]);

  const handleSendMessage = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!user) {
      window.location.replace('/auth');
      return;
    }
    if (!message.trim() || !ws || !forumId) return;
    ws.send(JSON.stringify({
      type: "message",
      forumId,
      content: message,
    }));
    setMessage("");
  };

  const handlePreview = (file: FileWithChunks) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  // Close overlays when navigating away (popstate/back button) or when forumId clears
  useEffect(() => {
    const onPop = () => {
      setShowPeoplePanel(false);
      setPreviewOpen(false);
      setShowFileUpload(false);
      setEditingForumTags(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!forumId) {
      setShowPeoplePanel(false);
      setPreviewOpen(false);
      setShowFileUpload(false);
      setEditingForumTags(false);
    }
  }, [forumId]);

  const handleClosePreview = () => {
    setPreviewOpen(false);
    setPreviewFile(null);
  };

  const handleBack = (e?: React.MouseEvent) => {
    e?.preventDefault();
    // Prefer history.back when possible (preserves navigation history on mobile)
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    // Fallback to navigating to home
    setLocation('/');
  };

  // Tag-based filtering removed — no entity tag fetching needed

  // Filter messages and files based on selected tags
  const filteredMessages = React.useMemo(() => {
    return messages || [];
  }, [messages]);

  const filteredFiles = React.useMemo(() => {
    return allFiles;
  }, [allFiles]);

  // Apply search filtering to already tag-filtered results
  const searchFilteredMessages = React.useMemo(() => {
    if (searchQuery.trim()) {
      // When searching, use search results if available, otherwise filter loaded messages
      const searchMessages = searchResults?.messages || [];
      if (searchMessages.length > 0) {
        return searchMessages;
      }
      // Fall back to filtering loaded messages if search didn't return results
      const query = searchQuery.toLowerCase().trim();
      return filteredMessages.filter(message => {
        return (
          message.content.toLowerCase().includes(query) ||
          (message.user?.username || '').toLowerCase().includes(query)
        );
      });
    }
    
    return filteredMessages;
  }, [filteredMessages, searchQuery, searchResults]);

  const searchFilteredFiles = React.useMemo(() => {
    console.log('[ForumPage] searchFilteredFiles computing, debouncedSearchQuery:', debouncedSearchQuery, 'searchResults:', searchResults);
    if (debouncedSearchQuery.trim()) {
      // When searching, use paginated backend searchFiles (merged local + extracted) if available
      if (searchFiles && searchFiles.length > 0) {
        const forumSearchFiles = searchFiles.filter(f => f.id.startsWith('extracted_') || f.forumId === forumId);
        console.log('[ForumPage] Using paginated backend search results (filtered to forum):', forumSearchFiles.map(f => ({ id: f.id, name: f.fileName, tags: f.extractedTags })));
        return forumSearchFiles;
      }

      // Fall back to older combined immediate results if present
      const searchFilesFallback = [...(searchResults?.files || []), ...streamedLocalResults, ...(extractedSearchResults?.files || []), ...streamedExtractedResults];
      if (searchFilesFallback.length > 0) {
        const dedupedMap: Record<string, any> = {};
        for (const f of searchFilesFallback) {
          dedupedMap[f.id] = f;
        }
        const uniqueSearchFiles = Object.values(dedupedMap);
        const forumSearchFiles = uniqueSearchFiles.filter(f => f.id.startsWith('extracted_') || f.forumId === forumId);
        console.log('[ForumPage] Using backend fallback search results (filtered to forum):', forumSearchFiles.map(f => ({ id: f.id, name: f.fileName, tags: f.extractedTags })));
        return forumSearchFiles;
      }

      // Fall back to filtering loaded files if search didn't return results
      const query = debouncedSearchQuery.toLowerCase().trim();
      const filtered = allFiles.filter(file => {
        return (
          file.fileName.toLowerCase().includes(query) ||
          (file.user?.username || file.adminCreatedBy || '').toLowerCase().includes(query) ||
          (file.extractedTags || []).some((tag: string) => tag.toLowerCase().includes(query))
        );
      });
      console.log('[ForumPage] Using local filtering on loaded files:', filtered.map(f => ({ id: f.id, name: f.fileName, tags: f.extractedTags })));
      return filtered;
    }
    console.log('[ForumPage] No search query, showing filteredFiles:', filteredFiles.map(f => ({ id: f.id, name: f.fileName, tags: f.extractedTags })));
    return filteredFiles;
  }, [filteredFiles, debouncedSearchQuery, searchResults, extractedSearchResults, allFiles, forumId]);

  // Forum Tags Section Component
  const ForumTagsSection = ({
    forumId,
    isCreator,
    editing,
    onEditingChange
  }: {
    forumId: string;
    isCreator: boolean;
    editing: boolean;
    onEditingChange: (editing: boolean) => void;
  }) => {
    const {
      selectedTags = [],
      availableTags = [],
      handleTagsChange,
      handleCreateTag,
      isUpdating,
    } = useEntityTagManager('forum', forumId, { includeExtracted: editing }) || {};

    if (editing) {
      return (
        <div className="mt-2 p-3 border rounded-lg bg-muted/50">
          <TagInput
            selectedTags={selectedTags}
            onTagsChange={handleTagsChange}
            availableTags={availableTags}
            onCreateTag={handleCreateTag}
            placeholder="Add tags to this forum..."
            maxTags={20}
          />
          <div className="flex justify-end mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEditingChange(false)}
              disabled={isUpdating}
            >
              Done
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 mt-2 min-h-6">
        {selectedTags.length > 0 && <TagList tags={selectedTags} />}
        {isCreator && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onEditingChange(true)}
          >
            <TagIcon className="h-3 w-3 mr-1" />
            {selectedTags.length > 0 ? 'Edit' : 'Add Tags'}
          </Button>
        )}
      </div>
    );
  };

  if (forumLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Skeleton className="h-8 w-64 mx-auto mb-4 bg-zinc-800" />
          <Skeleton className="h-4 w-48 mx-auto bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!forum) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2 text-zinc-100">Forum not found</h2>
          <p className="text-zinc-400 mb-6">The forum you're looking for doesn't exist.</p>
          <Link href="/">
            <Button className="bg-zinc-100 text-zinc-950 hover:bg-zinc-200">Back to Forums</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Forum Header */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <Button onClick={handleBack} variant="ghost" size="icon" data-testid="button-back" className="shrink-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold truncate text-zinc-100">{forum.name}</h1>
                {forum.description && (
                  <p className="text-sm text-zinc-400 truncate md:whitespace-normal">{forum.description}</p>
                )}

                {/* Forum Tags */}
                {forumId && (
                  <ForumTagsSection
                    forumId={forumId}
                    isCreator={forum.creatorId === user?.id}
                    editing={editingForumTags}
                    onEditingChange={setEditingForumTags}
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Search Input */}
              <div className="relative flex-1 md:w-64 lg:w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  type="text"
                  placeholder="Search messages and files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 w-full bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-zinc-700 rounded-none"
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-zinc-400 hover:text-zinc-100"
                    onClick={() => setSearchQuery("")}
                  >
                    <XIcon className="h-3 w-3" />
                  </Button>
                )}
              </div>
              {searchQuery && (
                <Badge variant="secondary" className="text-xs shrink-0 hidden sm:inline-flex bg-zinc-900 text-zinc-400 border-zinc-800">
                  {searchFilteredMessages.length + searchFilteredFiles.length} results
                  {isSearchingExtracted && (
                    <span className="ml-2 inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-zinc-700"></span>
                  )}
                </Badge>
              )}
              
              {/* Load more button for paginated search results */}
              {debouncedSearchQuery.trim() && searchFiles.length > 0 && searchFiles.length < searchTotalFiles && (
                <>
                  <div className="ml-2 hidden sm:block">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={loadMoreSearchResults}
                      disabled={isLoadingSearchPage}
                      className="rounded-full px-3 py-1 text-xs"
                    >
                      {isLoadingSearchPage ? 'Loading...' : `Load more (${Math.min(searchLimit, searchTotalFiles - searchFiles.length)})`}
                    </Button>
                  </div>
                  {/* Mobile load-more is rendered inline inside the results area to avoid header layout jumps */}
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPeoplePanel(true)}
                data-testid="button-show-people"
                className="shrink-0 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              >
                <Users className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* View Mode Tabs + Tag Filter */}
        <div className="border-b border-zinc-800">
          <div className="container mx-auto px-4">
            <div className="flex gap-0 items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("timeline")}
                className={`rounded-none border-b-2 hover:bg-zinc-900 ${viewMode === "timeline" ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-100"}`}
              >
                Timeline
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("files")}
                className={`rounded-none border-b-2 hover:bg-zinc-900 ${viewMode === "files" ? "border-zinc-100 text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-100"}`}
              >
                Files ({searchFilteredFiles.length})
              </Button>
              {/* Tag filter removed */}
            </div>
          </div>
        </div>
      </header>



      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col bg-zinc-950">
        {viewMode === "timeline" ? (
          <>
            {/* Unified Timeline */}
            {/* Show skeletons only when initial data is still loading and there are no partial/streamed
               search results available. This lets streamed files appear immediately while the full
               backend search (which may take long) runs in the background. */}
            {messagesLoading || (filesLoading && filesOffset === 0) || (isSearching && searchFilteredMessages.length === 0 && searchFilteredFiles.length === 0) ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-full shrink-0 bg-zinc-800" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-24 bg-zinc-800" />
                      <Skeleton className="h-16 w-full max-w-md bg-zinc-800" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pb-24">
                {/* Mobile-only in-content Load more for search to keep header stable */}
                {debouncedSearchQuery.trim() && searchFiles.length > 0 && searchFiles.length < searchTotalFiles && (
                  <div className="sm:hidden px-4 pb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={loadMoreSearchResults}
                      disabled={isLoadingSearchPage}
                      className="w-full rounded-full px-3 py-2 text-sm"
                    >
                      {isLoadingSearchPage ? 'Loading...' : `Load more (${Math.min(searchLimit, searchTotalFiles - searchFiles.length)})`}
                    </Button>
                  </div>
                )}
                <UnifiedTimeline
                  messages={searchFilteredMessages}
                  files={searchFilteredFiles}
                  forumId={forumId!}
                  scrollToMessage={scrollToMessage}
                  scrollToFile={scrollToFile}
                  ws={ws}
                  uploadProgress={uploadProgress}
                  onLoadMore={loadMoreFiles}
                  hasMore={hasMoreFiles}
                  isLoadingMore={filesLoading && filesOffset > 0 && !searchQuery.trim()}
                  totalFiles={totalFilesCount}
                  extractedCount={extractedFilesCount}
                />
              </div>
            )}
          </>
        ) : (
          /* Files List View */
          <div className="flex-1 overflow-y-auto p-4 pb-24">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-100">Files</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!user) {
                    window.location.replace('/auth');
                  } else {
                    setShowFileUpload(!showFileUpload);
                  }
                }}
                className="border-zinc-800 text-zinc-100 hover:bg-zinc-900"
              >
                <UploadIcon className="h-4 w-4 mr-2" />
                Upload File
              </Button>
            </div>

              {/* Mobile-only Load more for search inside Files view to avoid header instability */}
              {debouncedSearchQuery.trim() && searchFiles.length > 0 && searchFiles.length < searchTotalFiles && (
                <div className="sm:hidden mb-4 px-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={loadMoreSearchResults}
                    disabled={isLoadingSearchPage}
                    className="w-full rounded-full px-3 py-2 text-sm"
                  >
                    {isLoadingSearchPage ? 'Loading...' : `Load more (${Math.min(searchLimit, searchTotalFiles - searchFiles.length)})`}
                  </Button>
                </div>
              )}

            {showFileUpload && (
              <div className="mb-6">
                <FileUpload
                  forumId={forumId!}
                  onUploadComplete={() => {
                    setShowFileUpload(false);
                    setPastedFile(null);
                  }}
                  uploadProgress={uploadProgress}
                  onUploadProgressChange={setUploadProgress}
                  pastedFile={pastedFile}
                />
              </div>
            )}

            <FileList
              files={searchFilteredFiles}
              isLoading={filesLoading && filesOffset === 0 && !searchQuery.trim()}
              forumId={forumId!}
              onPreview={handlePreview}
              ws={ws}
              isLoadingMore={filesLoading && filesOffset > 0}
            />

            {hasMoreFiles && !filesLoading && !searchQuery.trim() && (
              <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-3 mt-6" aria-live="polite">
                <div className="flex items-center gap-3 bg-gradient-to-r from-zinc-900 to-zinc-800 border border-zinc-800 px-3 py-2 rounded-full shadow-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="text-[11px] text-muted-foreground leading-none uppercase tracking-wide">Total files</div>
                  <div className="text-lg sm:text-xl font-semibold text-zinc-100">{totalFilesCount}</div>
                </div>
                {typeof extractedFilesCount === 'number' && extractedFilesCount > 0 && (
                  <div className="text-xs text-muted-foreground">Includes <span className="font-medium text-zinc-100">{extractedFilesCount}</span> extracted</div>
                )}
                <div className="text-xs text-muted-foreground">Showing <span className="font-medium text-zinc-100">{allFiles.length}</span> files</div>
                <Button
                  onClick={loadMoreFiles}
                  variant="outline"
                  className="bg-zinc-800 border-zinc-700 hover:bg-zinc-700 min-w-[140px] rounded-full px-4"
                >
                  Load More Files
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed Message Input - Only show in timeline view */}
      {viewMode === "timeline" && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950 z-20">
          <div className="container mx-auto px-4 py-3">
            <PartialUploadsManager
              forumId={forumId!}
              onResumeUpload={(partialUpload) => {
                toast({
                  title: "Resume Upload",
                  description: `To resume uploading "${partialUpload.fileName}", please select the same file again in the upload area.`,
                });
              }}
            />

            {showFileUpload && (
              <div className="mb-3 p-4 rounded-none bg-zinc-900 border border-zinc-800">
                <FileUpload
                  forumId={forumId!}
                  onUploadComplete={() => {
                    setShowFileUpload(false);
                    setPastedFile(null);
                  }}
                  uploadProgress={uploadProgress}
                  onUploadProgressChange={setUploadProgress}
                  pastedFile={pastedFile}
                />
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  if (!user) {
                    window.location.replace('/auth');
                  } else {
                    setShowFileUpload(!showFileUpload);
                  }
                }}
                data-testid="button-toggle-file-upload"
                className="h-12 w-12 rounded-none border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
              >
                {showFileUpload ? <X className="h-5 w-5" /> : <UploadIcon className="h-5 w-5" />}
              </Button>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isMobile ? "Type a message... (Ctrl+Enter to send)" : "Type a message"}
                className="flex-1 min-h-[48px] max-h-32 resize-none rounded-none bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-zinc-700"
                data-testid="input-message"
                onPaste={async (e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;

                  for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.kind === 'file') {
                      const file = item.getAsFile();
                      if (file) {
                        // Check file size (10MB limit)
                        if (file.size > 10 * 1024 * 1024) {
                          toast({
                            title: "File too large",
                            description: "Files must be smaller than 10MB.",
                            variant: "destructive",
                          });
                          continue;
                        }

                        // Set the pasted file and show upload area
                        setPastedFile(file);
                        setShowFileUpload(true);
                        toast({
                          title: "File pasted",
                          description: `${file.name} is ready to upload. Click the upload button to proceed.`,
                        });
                      }
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (isMobile) {
                      // On mobile: Enter creates new line, Ctrl+Enter sends
                      if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                      // Let Enter create new line naturally
                    } else {
                      // On desktop: Shift+Enter creates new line, Enter sends
                      if (!e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }
                  }
                }}
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!message.trim()} 
                data-testid="button-send"
                className="h-12 w-12 rounded-none bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
              >
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* People Panel Side Sheet */}
      <Sheet open={showPeoplePanel} onOpenChange={setShowPeoplePanel}>
        <SheetContent side="right" className="w-full sm:w-[400px] p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>People</SheetTitle>
          </SheetHeader>
          <PeoplePanel
            forumId={forumId!}
            isCreator={forum.creatorId === user?.id}
          />
        </SheetContent>
      </Sheet>

      {/* File Preview Dialog */}
      <FilePreviewDialog
        file={previewFile}
        open={previewOpen}
        onClose={handleClosePreview}
        onDownload={(fileId) => {
          // Handle download through the same logic as timeline
          const xhr = new XMLHttpRequest();
          const file = files?.find((f) => f.id === fileId);

          xhr.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const percentComplete = (e.loaded / e.total) * 100;
              // Could add download progress here if needed
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
            }
          });

          xhr.responseType = "blob";
          xhr.open("GET", `/api/files/${fileId}/download`);
          xhr.send();
        }}
      />

      {/* Structured Data for SEO */}
      {forum && (
        <>
          <MetaTags
            title={forum.metaTitle || forum.name}
            description={(forum.metaDescription || forum.description) || undefined}
            keywords={forum.keywords || undefined}
            image={forum.ogImage || undefined}
            url={window.location.href}
            type="website"
          />
          <StructuredData
            data={generateStructuredData('forum', {
              id: forum.id,
              title: forum.name,
              description: forum.description || undefined,
              url: window.location.href,
              author: user ? { name: user.username, id: user.id } : undefined,
              tags: forumTags.map(tag => ({
                id: tag.id,
                name: tag.name,
                description: tag.description || null,
                color: tag.color || null,
                createdAt: new Date(tag.createdAt)
              })),
              createdAt: forum.createdAt.toString(),
              image: forum.ogImage || undefined,
            })}
          />
        </>
      )}
    </div>
  );
}
