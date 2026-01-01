import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Hls from "hls.js";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Loader2,
  AlertCircle,
  Wrench
} from "lucide-react";
import { cn } from "@/lib/utils";
import screenfull from "screenfull";
import type { FileWithChunks } from "@shared/schema";
import { usePriorityChunkProcessor, calculateChunkIndex } from "@/hooks/usePriorityChunkProcessor";

interface VideoPreviewProps {
  file: FileWithChunks;
  className?: string;
  autoPlay?: boolean;
  showControls?: boolean;
  onError?: (error: string) => void;
}

interface BufferedRange {
  start: number;
  end: number;
}

export function VideoPreview({
  file,
  className,
  autoPlay = false,
  showControls = true,
  onError
}: VideoPreviewProps) {
  // Only log on actual mount, not every re-render
  const mountedRef = useRef(false);
  if (!mountedRef.current) {
    console.log(`[VideoPreview] Component mounted for file: ${file.fileName} (ID: ${file.id})`);
    console.log('[VideoPreview] Using native HTML5 video element');
    console.log(`[VideoPreview] File type - isAdminCreated: ${file.isAdminCreated}, mimeType: ${file.mimeType}`);
    mountedRef.current = true;
  }
  
  // State declarations that are needed by callbacks
  const [useDownloadUrl, setUseDownloadUrl] = useState(false); // Use streaming URL for progressive loading
  const [smartSeekingEnabled, setSmartSeekingEnabled] = useState(true);
  const [lastSeekTime, setLastSeekTime] = useState(0);
  const [seekOptimizationActive, setSeekOptimizationActive] = useState(false);
  const [chunkInfo, setChunkInfo] = useState<any>(null);
  const [chunkInfoLoading, setChunkInfoLoading] = useState(false);
  const [chunkInfoLoaded, setChunkInfoLoaded] = useState(false);
  const [requestCache, setRequestCache] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Request counter for monitoring
  const [requestCount, setRequestCount] = useState({ chunkInfo: 0, metadata: 0, urlTest: 0, hlsPoll: 0 });

  // Priority chunk processing
  const { requestPriorityChunk, getPriorityStatus } = usePriorityChunkProcessor();
  const [priorityProcessing, setPriorityProcessing] = useState(false);
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);
  
  // Smart seek virtual time tracking for partial segments
  const [isPartialSegment, setIsPartialSegment] = useState(false);
  const [virtualStartTime, setVirtualStartTime] = useState<number>(0);
  const [virtualCurrentTime, setVirtualCurrentTime] = useState<number>(0);
  
  // Reset virtual time state when file changes
  useEffect(() => {
    setIsPartialSegment(false);
    setVirtualStartTime(0);
    setVirtualCurrentTime(0);
  }, [file.id]);

  // Reset cache when file changes
  useEffect(() => {
    console.log(`[VideoPreview] Resetting cache for file change: ${file.fileName}`);
    console.log(`[VideoPreview] 📊 Final request stats for ${file.fileName}:`, requestCount);
    console.log(`[VideoPreview] 🔄 Cache entries:`, requestCache.size);
    setRequestCache(new Set());
    setChunkInfoLoaded(false);
    setChunkInfoLoading(false);
    setChunkInfo(null);
    setRequestCount({ chunkInfo: 0, metadata: 0, urlTest: 0, hlsPoll: 0 });
    
    // Reset duration states to prevent showing incorrect duration from previous videos
    setDuration(0);
    setMetadataDuration(null);
    setPlayed(0);
    setLoaded(0);
    console.log(`[VideoPreview] ✨ Reset duration states for ${file.fileName}`);

    // Reset resolved proxied URL for extracted files
    setResolvedProxiedUrl(null);
    setResolvingExtracted(false);

    // If the file came pre-resolved by the opener (shared link), use that immediately
    const preResolved = (file as any).clientResolvedUrl;
    if (preResolved) {
      console.log('[VideoPreview] Using pre-resolved client URL from opener:', preResolved);
      setResolvedProxiedUrl(preResolved);
      setResolvedLocalProxyUrl((file as any).clientResolvedLocalUrl || null);
      setResolvedMeta((file as any).clientResolvedMeta || null);
      appliedSrcRef.current = preResolved;
    }
  }, [file.id, file.fileName]);

  // For extracted files (Xmaster), resolve live mp4/m3u8 via server which uses the Vercel proxy
  useEffect(() => {
    let mounted = true;
    async function resolveExtracted() {
      if (!file.id.startsWith('extracted_')) return;
      if (!file.directDownloadUrl && !(file as any).videoUrl) return;
      console.log('[VideoPreview] resolveExtracted starting for', file.id);
      // Client-side TTL guard to avoid rapid repeated resolve calls
      if (Date.now() - lastResolveAtRef.current < RESOLVE_TTL_MS) {
        console.log('[VideoPreview] Skipping resolve (cached recently)');
        return;
      }
      setResolvingExtracted(true);
      setResolvedProxiedUrl(null);
      try {
        const res = await fetch(`/api/extracted/${file.id}/resolve`);
        lastResolveAtRef.current = Date.now();
        if (!mounted) return;
        if (!res.ok) {
          console.warn('[VideoPreview] Failed to resolve extracted url', res.status);
          setResolvingExtracted(false);
          return;
        }
        const js = await res.json();
        console.log('[VideoPreview] Extracted resolve response:', js);
        // Choose best playable URL in order: proxiedUrl (vercel) if healthy, else server proxy to resolvedUrl
        const proxiedMeta = js?.proxiedMeta || null;
        const resolvedMetaResp = js?.resolvedMeta || null;
        const localProxyUrl = js?.localProxyUrl || null;
        const localProxyMeta = js?.localProxyMeta || null;
        let chosenUrl: string | null = null;

        function metaIsPlayable(m: any) {
          if (!m) return false;
          if (m.error) return false;
          if (m.status && m.status >= 400) return false;
          const ct = (m.contentType || '').toLowerCase();
          return /(video\/|application\/x-mpegurl)/i.test(ct);
        }
        function metaSupportsRanges(m: any) {
          try { return !!(m && m.acceptRanges && String(m.acceptRanges).toLowerCase().includes('bytes')); } catch { return false; }
        }

        // Prefer local proxy (same-origin) when playable
        if (localProxyUrl && metaIsPlayable(localProxyMeta)) {
          chosenUrl = localProxyUrl;
          setResolvedMeta(localProxyMeta || resolvedMetaResp || null);
        }
        // Next prefer Vercel proxied URL if it advertises video and ranges
        else if (js && js.proxiedUrl && metaIsPlayable(proxiedMeta) && metaSupportsRanges(proxiedMeta)) {
          chosenUrl = js.proxiedUrl;
          setResolvedMeta(proxiedMeta || resolvedMetaResp || null);
        }
        // If direct resolved URL is playable, route it through our local proxy for better control
        else if (js && js.resolvedUrl && metaIsPlayable(resolvedMetaResp)) {
          chosenUrl = `/api/proxy?url=${encodeURIComponent(js.resolvedUrl)}`;
          setResolvedMeta(resolvedMetaResp);
        }
        // Otherwise, try proxied URL even if it lacks range header
        else if (js && js.proxiedUrl) {
          chosenUrl = js.proxiedUrl;
          setResolvedMeta(proxiedMeta || resolvedMetaResp || null);
        } else if (js && js.resolvedUrl) {
          chosenUrl = `/api/proxy?url=${encodeURIComponent(js.resolvedUrl)}`;
          setResolvedMeta(resolvedMetaResp);
        }

        if (chosenUrl) {
          // Avoid re-setting same URL repeatedly (which causes reload loops)
          if (chosenUrl !== appliedSrcRef.current) {
            setResolvedProxiedUrl(chosenUrl);
            appliedSrcRef.current = chosenUrl;
          } else {
            console.log('[VideoPreview] chosenUrl equals appliedSrcRef.current, skipping re-apply');
          }
        }
        // store local proxy if available for fallback
        if (localProxyUrl) setResolvedLocalProxyUrl(localProxyUrl);
        // Diagnostics and user notifications
        if (proxiedMeta && (proxiedMeta.error || (proxiedMeta.status && proxiedMeta.status >= 400))) {
          console.warn('[VideoPreview] Proxied URL upstream issue:', proxiedMeta);
          toast({ title: 'Proxy issue', description: 'Vercel proxy returned an error; using fallback', variant: 'warning' });
        }
        if (!metaSupportsRanges(proxiedMeta) && !metaSupportsRanges(localProxyMeta)) {
          // Neither proxy supports ranges according to headers — playback may still work but seeking won't
          toast({ title: 'Playback limitation', description: 'Upstream does not advertise range support; seeking may be limited', variant: 'warning' });
        }
        if (resolvedMetaResp && !(resolvedMetaResp.error) && !(resolvedMetaResp.status && resolvedMetaResp.status >= 400) && !/(video\/|application\/x-mpegurl)/i.test(resolvedMetaResp.contentType || '')) {
          toast({ title: 'Playback may fail', description: `Upstream content-type: ${resolvedMetaResp.contentType || 'unknown'}`, variant: 'warning' });
        }
      } catch (err) {
        console.warn('[VideoPreview] Error resolving extracted url', err);
      } finally {
        if (mounted) setResolvingExtracted(false);
      }
    }
    resolveExtracted();
    return () => { mounted = false; };
  }, [file.id, file.directDownloadUrl, (file as any).videoUrl]);

  // Test URLs accessibility (run once when file changes)
  useEffect(() => {
    const streamUrl = `/api/files/${file.id}/stream`;
    const downloadUrl = `/api/files/${file.id}/download`;

    console.log(`[VideoPreview] URLs for file: ${file.fileName}`);
    console.log(`[VideoPreview] - Stream URL: ${streamUrl}`);
    console.log(`[VideoPreview] - Download URL: ${downloadUrl}`);
    
    // Test both URLs accessibility
    Promise.all([
      fetch(streamUrl, { method: 'HEAD' }).then(response => ({
        url: streamUrl,
        type: 'stream',
        status: response.status,
        statusText: response.statusText,
        headers: {
          'content-type': response.headers.get('content-type'),
          'content-length': response.headers.get('content-length'),
          'accept-ranges': response.headers.get('accept-ranges')
        }
      })).catch(error => ({ url: streamUrl, type: 'stream', error })),
      
      fetch(downloadUrl, { method: 'HEAD' }).then(response => ({
        url: downloadUrl,
        type: 'download',
        status: response.status,
        statusText: response.statusText,
        headers: {
          'content-type': response.headers.get('content-type'),
          'content-length': response.headers.get('content-length'),
          'accept-ranges': response.headers.get('accept-ranges')
        }
      })).catch(error => ({ url: downloadUrl, type: 'download', error }))
    ]).then(results => {
      console.log(`[VideoPreview] URL accessibility test results:`, results);
    });
  }, [file.id, file.fileName]);
  
  const playerRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Player state - converted to React Player equivalents
  const [playing, setPlaying] = useState(autoPlay);
  const [loaded, setLoaded] = useState(0);
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControlsBar, setShowControlsBar] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seeking, setSeeking] = useState(false);
  const [pauseAfterSeek, setPauseAfterSeek] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferedRanges, setBufferedRanges] = useState<BufferedRange[]>([]);
  const [metadataDuration, setMetadataDuration] = useState<number | null>(null);

  // HLS State
  const [hlsUrl, setHlsUrl] = useState<string | null>(null);
  const [transcoding, setTranscoding] = useState(false);
  const hlsRef = useRef<Hls | null>(null);

  // Resolved proxied URL for extracted (Xmaster) files
  const [resolvedProxiedUrl, setResolvedProxiedUrl] = useState<string | null>(null);
  const [resolvedLocalProxyUrl, setResolvedLocalProxyUrl] = useState<string | null>(null);
  const [resolvingExtracted, setResolvingExtracted] = useState(false);
  const [resolvedMeta, setResolvedMeta] = useState<any>(null);
  const fallbackAttemptRef = useRef<{ triedLocal?: boolean }>({});
  const lastResolveAtRef = useRef<number>(0);
  const RESOLVE_TTL_MS = 60 * 1000; // 60s client-side TTL to avoid repeated resolves
  const appliedSrcRef = useRef<string | null>(null); // last src applied to video element

  // Memoize the base streaming URL to prevent constant recalculation
  const baseStreamingUrl = useMemo(() => {
    // Always use stream endpoint for both user and admin files
    // User files will use chunked streaming, admin files will use direct streaming
    return `/api/files/${file.id}/stream`;
  }, [file.id]);

  // Generate streaming URL for video with smart seeking support
  const getStreamingUrl = useCallback((seekTime?: number) => {
    const totalDuration = metadataDuration || duration;
    
    // Throttle verbose logs to avoid noisy repeats
    const now = Date.now();
    if (!((getStreamingUrl as any)._lastLogTime && (now - (getStreamingUrl as any)._lastLogTime < 5000))) {
      console.log(`[VideoPreview] getStreamingUrl called with seekTime: ${seekTime}, smartSeeking: ${smartSeekingEnabled}, totalDuration: ${totalDuration}, metadataDuration: ${metadataDuration}`);
      console.log(`[VideoPreview] File details - isAdminCreated: ${file.isAdminCreated}, mimeType: ${file.mimeType}, fileName: ${file.fileName}`);
      console.log(`[VideoPreview] Retrieved URL from DB: ${file.directDownloadUrl}`);
      if ((file as any).videoUrl) {
        console.log(`[VideoPreview] Video URL from extracted DB: ${(file as any).videoUrl}`);
      }
      (getStreamingUrl as any)._lastLogTime = now;
    }
    
    // Special handling for extracted files (from external DB)
    if (file.id.startsWith('extracted_') && (file.directDownloadUrl || (file as any).videoUrl)) {
      // Prefer a freshly-resolved proxied URL from server (uses Vercel proxy), fallback to stored directDownloadUrl proxied
      if (resolvedProxiedUrl) {
        // Only log when resolved URL actually changes to reduce spam
        if (!((getStreamingUrl as any)._lastResolved === resolvedProxiedUrl)) {
          console.log(`[VideoPreview] Using resolved proxied URL for extracted file: ${resolvedProxiedUrl}`);
          (getStreamingUrl as any)._lastResolved = resolvedProxiedUrl;
        }
        return resolvedProxiedUrl;
      }
      const fallback = file.directDownloadUrl ? `https://media-alpha-vert.vercel.app/api/proxy?url=${encodeURIComponent(file.directDownloadUrl)}` : (`/api/files/${file.id}/stream`);
      if (!((getStreamingUrl as any)._lastFallback === fallback)) {
        console.log(`[VideoPreview] Extracted file - using fallback proxied URL: ${fallback}`);
        (getStreamingUrl as any)._lastFallback = fallback;
      }
      return fallback;
    }
    
    // For user-uploaded files (non-admin), use stream URL for proper seeking support
    if (!file.isAdminCreated) {
      const streamUrl = `/api/files/${file.id}/stream`;
      console.log(`[VideoPreview] User-uploaded file detected - using stream URL: ${streamUrl}`);
      return streamUrl;
    }
    
    console.log(`[VideoPreview] Admin file - chunk info available: ${!!chunkInfo}, totalChunks: ${chunkInfo?.totalChunks || 'none'}`);
    
    // Special handling for M3U8 files - they are already HLS streams
    if (file.mimeType?.startsWith('application/x-mpegurl') || file.fileName.toLowerCase().endsWith('.m3u8')) {
      // For M3U8 files, use the proxied direct download URL if available (for admin files)
      if (file.isAdminCreated && file.directDownloadUrl) {
        const proxiedUrl = `https://media-alpha-vert.vercel.app/api/proxy?url=${encodeURIComponent(file.directDownloadUrl)}`;
        console.log(`[VideoPreview] M3U8 file detected - using proxied URL: ${proxiedUrl}`);
        return proxiedUrl;
      }
      // For user-uploaded M3U8 files, use stream URL
      const streamUrl = `/api/files/${file.id}/stream`;
      console.log(`[VideoPreview] M3U8 file detected - using stream URL: ${streamUrl}`);
      return streamUrl;
    }
    
    // Check if file is natively supported
    const isNative = file.mimeType === 'video/mp4' || file.mimeType === 'video/webm' || file.mimeType === 'video/ogg';
    
    // If not native, use on-the-fly transcoding for admin files
    if (!isNative) {
        const baseUrl = `/api/files/${file.id}/stream-transcode`;
        const params = new URLSearchParams();
        if (seekTime !== undefined) {
            params.set('seekTime', seekTime.toString());
        }
        if (totalDuration) {
            params.set('duration', totalDuration.toString());
        }
        const transcodeUrl = `${baseUrl}?${params.toString()}`;
        console.log(`[VideoPreview] Using on-the-fly transcoding for non-native admin file: ${transcodeUrl}`);
        return transcodeUrl;
    }
    
    // For admin files with native support, use streaming endpoint or download based on toggle
    const downloadUrl = `/api/files/${file.id}/download`;
    const selectedUrl = useDownloadUrl ? downloadUrl : baseStreamingUrl;
    return selectedUrl;
  }, [baseStreamingUrl, file.id, file.isAdminCreated, useDownloadUrl, smartSeekingEnabled, duration, chunkInfo, metadataDuration]);

  // Test if the URL actually returns video content (with caching)
  useEffect(() => {
    if (!requestCache.has(`url-test-${file.id}`)) {
      const testUrl = getStreamingUrl();
      console.log(`[VideoPreview] Testing URL content type: ${testUrl} (cached)`);
      
      setRequestCache(prev => new Set(prev).add(`url-test-${file.id}`));
      setRequestCount(prev => ({ ...prev, urlTest: prev.urlTest + 1 }));
      
      // Debounce the request
      const timeoutId = setTimeout(() => {
        fetch(testUrl, { method: 'HEAD' })
          .then(response => {
            console.log(`[VideoPreview] URL test response:`, {
              status: response.status,
              statusText: response.statusText,
              contentType: response.headers.get('content-type'),
              contentLength: response.headers.get('content-length'),
              acceptRanges: response.headers.get('accept-ranges')
            });
            
            console.log(`[VideoPreview] Testing native video compatibility with ${testUrl}`);
          })
          .catch(error => {
            console.error(`[VideoPreview] URL test failed:`, error);
          });
      }, 1000); // 1 second debounce
      
      return () => clearTimeout(timeoutId);
    }
  }, [getStreamingUrl, file.id, requestCache]);

  const checkHlsStatus = useCallback(async () => {
    // For M3U8 files, use HLS.js directly with the streaming URL
    if (file.mimeType?.startsWith('application/x-mpegurl') || file.fileName.toLowerCase().endsWith('.m3u8')) {
      console.log(`[VideoPreview] Detected M3U8 file ${file.fileName}, using HLS.js directly`);
      const streamingUrl = getStreamingUrl();
      console.log(`[VideoPreview] M3U8 streaming URL: ${streamingUrl}`);
      setHlsUrl(streamingUrl);
      setTranscoding(false);
      return;
    }

    try {
      console.log(`[VideoPreview] Checking HLS status for ${file.id}`);
      const res = await fetch(`/api/files/${file.id}/hls-status`);
      
      // Check if response is actually JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`[VideoPreview] HLS endpoint returned non-JSON response for ${file.fileName}, likely not supported`);
        // For user-uploaded files, this is expected - just use direct streaming
        if (!file.isAdminCreated) {
          console.log(`[VideoPreview] User-uploaded file ${file.fileName} - HLS not available, using direct streaming`);
          setTranscoding(false);
          return;
        }
        throw new Error('HLS endpoint not available');
      }
      
      const data = await res.json();
      
      if (data.status === 'ready') {
        console.log(`[VideoPreview] HLS ready: ${data.url}`);
        setHlsUrl(data.url);
        setTranscoding(false);
      } else {
        console.log(`[VideoPreview] HLS not ready, triggering transcoding...`);
        setTranscoding(true);
        // Trigger transcoding
        await fetch(`/api/files/${file.id}/transcode`, { method: 'POST' });
        
        // Poll for status with caching
        if (!requestCache.has(`hls-poll-${file.id}`)) {
          setRequestCache(prev => new Set(prev).add(`hls-poll-${file.id}`));
          const interval = setInterval(async () => {
            try {
              console.log(`[VideoPreview] Polling HLS status for ${file.fileName}...`);
              const res = await fetch(`/api/files/${file.id}/hls-status`);
              const data = await res.json();
              if (data.status === 'ready') {
                console.log(`[VideoPreview] HLS transcoding completed: ${data.url}`);
                setHlsUrl(data.url);
                setTranscoding(false);
                clearInterval(interval);
                setRequestCache(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(`hls-poll-${file.id}`);
                  return newSet;
                });
              }
            } catch (e) {
              console.error("Error polling HLS status", e);
            }
          }, 10000); // Increased interval to 10 seconds to reduce server load
          
          // Clear interval on unmount
          return () => {
            clearInterval(interval);
            setRequestCache(prev => {
              const newSet = new Set(prev);
              newSet.delete(`hls-poll-${file.id}`);
              return newSet;
            });
          };
        }
      }
    } catch (e) {
      console.error(`[VideoPreview] Error checking HLS status for ${file.fileName}:`, e);
      
      // For user-uploaded files, HLS errors are expected
      if (!file.isAdminCreated) {
        console.log(`[VideoPreview] HLS error expected for user-uploaded file ${file.fileName} - continuing with direct streaming`);
      } else {
        console.error(`[VideoPreview] Unexpected HLS error for admin file ${file.fileName}`);
      }
      
      setTranscoding(false);
      setHlsUrl(null);
    }
  }, [file.id]);

  // Fetch metadata and check for auto-transcoding
  useEffect(() => {
    // Log file information for debugging
    console.log(`[VideoPreview] File analysis for ${file.fileName}:`, {
      id: file.id,
      isAdminCreated: file.isAdminCreated,
      hasDirectUrl: !!file.directDownloadUrl,
      hasChunks: file.chunks && file.chunks.length > 0,
      chunkCount: file.chunks?.length || 0,
      fileSize: file.fileSize,
      mimeType: file.mimeType
    });
    
    // Always trigger HLS check for reliable playback regardless of format
    console.log('[VideoPreview] Enforcing HLS playback for reliability...');
    checkHlsStatus();

    // Fetch chunk information for smart seeking (with caching)
    if (smartSeekingEnabled && !chunkInfoLoaded && !chunkInfoLoading && !requestCache.has(`chunk-info-${file.id}`)) {
      const fetchChunkInfo = async () => {
        try {
          setChunkInfoLoading(true);
          setRequestCache(prev => new Set(prev).add(`chunk-info-${file.id}`));
          setRequestCount(prev => ({ ...prev, chunkInfo: prev.chunkInfo + 1 }));
          console.log(`[VideoPreview] Fetching chunk info for ${file.fileName} (cached, attempt #${requestCount.chunkInfo + 1})`);
          const res = await fetch(`/api/files/${file.id}/chunk-info`);
          if (res.ok) {
            const data = await res.json();
            setChunkInfo(data);
            setChunkInfoLoaded(true);
            console.log(`[VideoPreview] Loaded chunk info for ${file.fileName}: ${data.totalChunks} chunks, avg size: ${Math.round(data.avgChunkSize / 1024)}KB`);
          } else {
            console.warn(`[VideoPreview] Failed to fetch chunk info: ${res.status}`);
          }
        } catch (err) {
          console.error(`[VideoPreview] Error fetching chunk info:`, err);
        } finally {
          setChunkInfoLoading(false);
        }
      };
      
      fetchChunkInfo();
    }

    const fetchMetadata = async () => {
      try {
        const res = await fetch(`/api/files/${file.id}/metadata`);
        if (res.ok) {
          const data = await res.json();
          if (data.duration) {
            console.log(`[VideoPreview] Fetched metadata duration: ${data.duration}`);
            setMetadataDuration(data.duration);
            // Force update duration state to ensure UI reflects total time
            setDuration(data.duration);
          }
        }
      } catch (e) {
        console.error("Failed to fetch metadata", e);
      }
    };
    fetchMetadata();
  }, [file.id, file.mimeType, checkHlsStatus]);

  useEffect(() => {
    if (hlsUrl && Hls.isSupported() && playerRef.current) {
      console.log(`[VideoPreview] Initializing HLS player with ${hlsUrl} for file ${file.fileName}`);
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      const hls = new Hls({
        debug: true, // Enable debug logging
        enableWorker: false // Disable worker for debugging
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(playerRef.current);
      hlsRef.current = hls;
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('[VideoPreview] HLS manifest parsed');
        if (autoPlay) playerRef.current?.play();
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('[VideoPreview] HLS error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('[VideoPreview] HLS network error, trying to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('[VideoPreview] HLS media error, trying to recover...');
              hls.recoverMediaError();
              break;
            default:
              console.log('[VideoPreview] HLS fatal error, destroying...');
              hls.destroy();
              break;
          }
        }
      });
      
      return () => {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }
      };
    } else if (playerRef.current && hlsUrl && playerRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      console.log(`[VideoPreview] Using native HLS support for ${hlsUrl}`);
      playerRef.current.src = hlsUrl;
      if (autoPlay) playerRef.current.play();
    }
  }, [hlsUrl, autoPlay]);

  // Immediately load and play resolved URL when available
  useEffect(() => {
    if (!resolvedProxiedUrl) return;
    // Reset fallback attempts
    fallbackAttemptRef.current = {};

    const video = playerRef.current;
    const isM3u8 = /\.m3u8(\?|$)/i.test(resolvedProxiedUrl) || (resolvedMeta && /application\/x-mpegurl/i.test(resolvedMeta.contentType || ''));

    if (isM3u8) {
      console.log('[VideoPreview] Resolved HLS URL, initializing HLS:', resolvedProxiedUrl);
      if (resolvedProxiedUrl !== appliedSrcRef.current) {
        setHlsUrl(resolvedProxiedUrl);
        appliedSrcRef.current = resolvedProxiedUrl;
      } else {
        console.log('[VideoPreview] HLS URL already applied, skipping');
      }
      setTranscoding(false);
      return;
    }

    if (video) {
      try {
        // Destroy any HLS instance if present
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        // Only change src if it's different to avoid reload loops
        const currentAttr = video.getAttribute('src');
        if (currentAttr !== resolvedProxiedUrl) {
          console.log('[VideoPreview] Forcing video element to use resolved URL:', resolvedProxiedUrl);
          video.pause();
          video.setAttribute('src', resolvedProxiedUrl);
          video.load();
          setIsReady(false);
          // Auto-play when requested
          if (autoPlay) video.play().catch(e => console.warn('[VideoPreview] Auto-play failed', e));
        } else {
          console.log('[VideoPreview] Resolved URL already set on element, skipping');
        }
      } catch (e) {
        console.warn('[VideoPreview] Error applying resolved URL to video element', e);
      }
    }

    // If the video doesn't start loading within 5s, try fallback to local proxy if available
    const fallbackTimer = setTimeout(() => {
      const v = playerRef.current;
      const isLoaded = v ? (v.readyState >= 1 || isReady) : false;
      if (!isLoaded && resolvedLocalProxyUrl && !fallbackAttemptRef.current.triedLocal) {
        console.log('[VideoPreview] Resolved URL not loading, falling back to local proxy:', resolvedLocalProxyUrl);
        fallbackAttemptRef.current.triedLocal = true;
        setResolvedProxiedUrl(resolvedLocalProxyUrl);
      }
    }, 5000);

    return () => clearTimeout(fallbackTimer);
  }, [resolvedProxiedUrl, resolvedLocalProxyUrl, resolvedMeta, autoPlay, isReady]);

  // Log important state changes only
  useEffect(() => {
    if (isReady || error) {
      console.log(`[VideoPreview] State update - isReady: ${isReady}, isBuffering: ${isBuffering}, playing: ${playing}, error: ${error}`);
    }
  }, [isReady, error]); // Only log when ready state or error changes

  // Timeout mechanism to detect stuck loading - reduced for streaming
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isReady && !error) {
        console.warn(`[VideoPreview] Video loading timeout (10s) for ${file.fileName} - still not ready`);
        console.warn('[VideoPreview] Player ref:', playerRef.current);
        console.warn('[VideoPreview] Current URL:', getStreamingUrl());
        
        // For streaming, try to force play to trigger buffering
        const video = playerRef.current;
        if (video && !useDownloadUrl) {
          console.log(`[VideoPreview] Attempting to force play to trigger streaming for ${file.fileName}`);
          video.load(); // Reload the video element
        }
      }
    }, 10000); // 10 second timeout for streaming

    return () => clearTimeout(timeout);
  }, [isReady, error, file.fileName, getStreamingUrl, useDownloadUrl]);

  // Hide controls after 3 seconds of inactivity
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControlsBar(true);
    if (playing) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControlsBar(false);
      }, 3000);
    }
  }, [playing]);



  // Calculate buffered ranges for visualization
  const getBufferedRanges = useCallback((video: HTMLVideoElement): BufferedRange[] => {
    const ranges: BufferedRange[] = [];
    const buffered = video.buffered;
    const duration = video.duration;
    
    if (duration > 0) {
      for (let i = 0; i < buffered.length; i++) {
        ranges.push({
          start: buffered.start(i) / duration,
          end: buffered.end(i) / duration
        });
      }
    }
    return ranges;
  }, []);

  // Format time for display
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // React Player event handlers
  const handleReady = () => {
    console.log(`[VideoPreview] Player ready for file: ${file.fileName} (ID: ${file.id})`);
    // HTMLVideoElement doesn't have getInternalPlayer, it IS the internal player
    console.log('[VideoPreview] Player internal element:', playerRef.current);
    setIsReady(true);
    setError(null);
  };

  const handleStart = () => {
    console.log(`[VideoPreview] Video started playing: ${file.fileName}`);
    setIsBuffering(false);
  };

  const handleProgress = (state: { played: number; loaded: number; loadedSeconds: number; playedSeconds: number }) => {
    console.log(`[VideoPreview] Progress - played: ${state.played}, loaded: ${state.loaded}, loadedSeconds: ${state.loadedSeconds}`);
    if (!seeking) {
      setPlayed(state.played);
      setLoaded(state.loaded);
    }
    setIsBuffering(false);
  };

  const handleDuration = (duration: number) => {
    console.log(`[VideoPreview] Duration set: ${duration} seconds for ${file.fileName}`);
    setDuration(duration);
  };

  const handleError = (error: any) => {
    console.error(`[VideoPreview] Video player error for ${file.fileName}:`, error);
    
    // Check if it's a source error (likely codec issue)
    const videoError = playerRef.current?.error;
    if (videoError && (videoError.code === 3 || videoError.code === 4)) {
        console.log('[VideoPreview] Video format not supported, attempting fallback strategies...');
        
        // For user-uploaded files, try different streaming approaches
        if (!file.isAdminCreated) {
          console.log('[VideoPreview] User-uploaded file detected, trying direct download URL as fallback');
          const video = playerRef.current;
          if (video) {
            const fallbackUrl = `/api/files/${file.id}/download`;
            console.log(`[VideoPreview] Switching to direct download URL: ${fallbackUrl}`);
            video.src = fallbackUrl;
            video.load();
            return; // Don't set error yet, give fallback a chance
          }
        }
        
        // Try HLS fallback as last resort
        checkHlsStatus();
        return; // Don't set error yet
    }

    console.error('[VideoPreview] File details:', {
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      isAdminCreated: file.isAdminCreated
    });
    const errorMessage = 'Failed to load video. The video format may not be supported by your browser.';
    setError(errorMessage);
    onError?.(errorMessage);
  };

  const handleBuffer = () => {
    console.log(`[VideoPreview] Buffering started for ${file.fileName}`);
    setIsBuffering(true);
  };

  const handleBufferEnd = () => {
    console.log(`[VideoPreview] Buffering ended for ${file.fileName}`);
    setIsBuffering(false);
  };

  // Video control functions
  const togglePlay = () => {
    const video = playerRef.current;
    if (!video) {
      console.log(`[VideoPreview] ❌ togglePlay called but video ref is null`);
      return;
    }
    
    console.log(`[VideoPreview] 🎮 togglePlay called - current state: playing=${playing}, video.paused=${video.paused}`);
    
    if (playing) {
      console.log(`[VideoPreview] ⏸️ Pausing video`);
      video.pause();
    } else {
      console.log(`[VideoPreview] ▶️ Playing video - clearing pauseAfterSeek flag`);
      setPauseAfterSeek(false); // Clear the flag when user manually plays
      // Start preloading when user first tries to play
      if (video.preload === 'none') {
        console.log(`[VideoPreview] Starting intelligent preload for ${file.fileName}`);
        video.preload = 'auto';
      }
      video.play();
    }
  };

  const handleSeekMouseDown = () => {
    setSeeking(true);
    console.log(`[VideoPreview] Started seeking for ${file.fileName}`);
  };

  const handleSeekChange = (value: number[]) => {
    if (seeking && !seekOptimizationActive && !priorityProcessing) {
      setPlayed(value[0]);
      console.log(`[VideoPreview] Seek position changed to ${(value[0] * 100).toFixed(1)}%`);
    }
  };

  const handleSeekMouseUp = async (value: number[]) => {
    console.log(`[VideoPreview] Seek finished for ${file.fileName}, target: ${(value[0] * 100).toFixed(1)}%`);
    
    const video = playerRef.current;
    if (video) {
      // FORCE PAUSE ON SEEK - User must manually resume
      console.log(`[VideoPreview] 🔄 PAUSE-ON-SEEK: Forcing pause after seek`);
      setPauseAfterSeek(true);
      video.pause();
      setPlaying(false);
      
      // Use metadataDuration if available for correct seek position
      const totalDuration = metadataDuration || video.duration;
      const targetTime = value[0] * totalDuration;
      const seekTimeChanged = Math.abs(targetTime - lastSeekTime) > 5; // 5 second threshold
      
      console.log(`[VideoPreview] 🎯 SEEK DEBUG:`);
      console.log(`[VideoPreview]   - Slider value: ${value[0]} (${(value[0] * 100).toFixed(1)}%)`);
      console.log(`[VideoPreview]   - metadataDuration: ${metadataDuration}s`);
      console.log(`[VideoPreview]   - video.duration: ${video.duration}s`);
      console.log(`[VideoPreview]   - totalDuration: ${totalDuration}s`);
      console.log(`[VideoPreview]   - targetTime: ${targetTime}s (${Math.floor(targetTime/60)}:${Math.floor(targetTime%60).toString().padStart(2,'0')})`);
      console.log(`[VideoPreview]   - lastSeekTime: ${lastSeekTime}s`);
      console.log(`[VideoPreview]   - seekTimeChanged: ${seekTimeChanged}`);
      
      // Set seeking to false AFTER we've calculated everything to prevent timeupdate interference
      setSeeking(false);
      
      // If smart seeking is enabled and seek time changed significantly
      if (smartSeekingEnabled && seekTimeChanged && totalDuration > 0) {
        console.log(`[VideoPreview] Starting priority seek to ${targetTime}s for ${file.fileName}`);
        setSeekOptimizationActive(true);
        setLastSeekTime(targetTime);
        setPendingSeekTime(targetTime);
        
        // Skip priority chunk processing for user-uploaded files (use direct download)
        if (!file.isAdminCreated) {
          console.log(`[VideoPreview] User-uploaded file - using direct seek without chunk processing`);
          video.currentTime = targetTime;
          setSeekOptimizationActive(false);
          return;
        }
        
        // Calculate which chunk contains the target time and request priority processing (admin files only)
        if (chunkInfo && chunkInfo.totalChunks > 0) {
          const targetChunkIndex = calculateChunkIndex(targetTime, totalDuration, chunkInfo.totalChunks);
          
          console.log(`[VideoPreview] Requesting priority processing for chunk ${targetChunkIndex} (seekTime: ${targetTime}s, totalChunks: ${chunkInfo.totalChunks})`);
          
          setPriorityProcessing(true);
          
          try {
            // Request immediate processing of the target chunk
            const result = await requestPriorityChunk(file.id, targetChunkIndex, {
              forceProcess: true, // Cancel other processing to prioritize this chunk
              timeout: 15000
            });
            
            if (result.success) {
              console.log(`[VideoPreview] Priority chunk ${targetChunkIndex} processed successfully`);
              
              // Use the priority stream URL with the specific chunk
              const priorityUrl = result.streamUrl || getStreamingUrl(targetTime);
              
              console.log(`[VideoPreview] Loading priority stream: ${priorityUrl}`);
              video.src = priorityUrl;
              video.load();
              
              // Seek to the target time after loading with better event handling
              const onLoadedMetadata = async () => {
                console.log(`[VideoPreview] Priority stream metadata loaded, checking for smart seek headers`);
                
                try {
                  // Fetch headers to get smart seek information
                  const response = await fetch(priorityUrl, { method: 'HEAD' });
                  const smartSeekTime = response.headers.get('X-Smart-Seek-Time');
                  const smartSeekDuration = response.headers.get('X-Smart-Seek-Duration');
                  const isSmartSeek = smartSeekTime !== null;
                  
                  if (isSmartSeek) {
                    const actualSeekTime = parseFloat(smartSeekTime!);
                    const totalDuration = smartSeekDuration ? parseFloat(smartSeekDuration) : (metadataDuration || duration || video.duration);
                    
                    console.log(`[VideoPreview] 🎯 Smart seek detected - Virtual time: ${actualSeekTime}s, Total duration: ${totalDuration}s`);
                    
                    // Set up virtual time tracking for partial segment
                    setIsPartialSegment(true);
                    setVirtualStartTime(actualSeekTime);
                    setVirtualCurrentTime(actualSeekTime);
                    
                    // Start playing the partial segment from the beginning
                    video.currentTime = 0;
                    
                    // Update the played state to reflect the virtual position in the full video
                    if (totalDuration > 0) {
                      const virtualPlayed = actualSeekTime / totalDuration;
                      setPlayed(virtualPlayed);
                      console.log(`[VideoPreview] 🎯 Set virtual position: ${actualSeekTime}s/${totalDuration}s (${(virtualPlayed * 100).toFixed(1)}%)`);
                    }
                  } else {
                    // Regular seek - not a partial segment
                    console.log(`[VideoPreview] Regular seek to ${targetTime}s`);
                    setIsPartialSegment(false);
                    setVirtualStartTime(0);
                    setVirtualCurrentTime(targetTime);
                    
                    setTimeout(() => {
                      if (video && !video.seeking) {
                        video.currentTime = targetTime;
                      }
                    }, 50);
                  }
                } catch (headerError) {
                  console.warn(`[VideoPreview] Could not fetch smart seek headers:`, headerError);
                  // Fallback to regular seek
                  setIsPartialSegment(false);
                  setTimeout(() => {
                    if (video && !video.seeking) {
                      video.currentTime = targetTime;
                    }
                  }, 50);
                }
                
                video.removeEventListener('loadedmetadata', onLoadedMetadata);
                setSeekOptimizationActive(false);
                setPriorityProcessing(false);
                setPendingSeekTime(null);
                console.log(`[VideoPreview] ✅ Priority seek setup completed`);
              };
              
              const onCanPlay = () => {
                console.log(`[VideoPreview] Priority stream can play, ensuring time is ${targetTime}s, current: ${video.currentTime}s`);
                if (Math.abs(video.currentTime - targetTime) > 1) {
                  console.log(`[VideoPreview] Correcting time from ${video.currentTime}s to ${targetTime}s`);
                  video.currentTime = targetTime;
                }
                video.removeEventListener('canplay', onCanPlay);
              };
              
              const onSeeked = () => {
                console.log(`[VideoPreview] Priority stream seeked to ${video.currentTime}s (target was ${targetTime}s)`);
                video.removeEventListener('seeked', onSeeked);
              };
              
              video.addEventListener('loadedmetadata', onLoadedMetadata);
              video.addEventListener('canplay', onCanPlay);
              video.addEventListener('seeked', onSeeked);
            } else {
              console.warn(`[VideoPreview] Priority chunk processing failed:`, result.error);
              // Fallback to regular smart seeking
              const smartUrl = getStreamingUrl(targetTime);
              video.src = smartUrl;
              video.load();
              
              const onLoadedMetadata = () => {
                console.log(`[VideoPreview] Fallback stream metadata loaded, seeking to ${targetTime}s`);
                setTimeout(() => {
                  if (video && !video.seeking) {
                    video.currentTime = targetTime;
                    console.log(`[VideoPreview] Set currentTime to ${targetTime}s after fallback stream load`);
                  }
                }, 50);
                video.removeEventListener('loadedmetadata', onLoadedMetadata);
                setSeekOptimizationActive(false);
                setPriorityProcessing(false);
                setPendingSeekTime(null);
                console.log(`[VideoPreview] Fallback smart seek completed to ${targetTime}s`);
              };
              
              const onCanPlay = () => {
                if (Math.abs(video.currentTime - targetTime) > 1) {
                  video.currentTime = targetTime;
                }
                video.removeEventListener('canplay', onCanPlay);
              };
              
              video.addEventListener('loadedmetadata', onLoadedMetadata);
              video.addEventListener('canplay', onCanPlay);
            }
          } catch (error) {
            console.error(`[VideoPreview] Priority chunk processing error:`, error);
            setPriorityProcessing(false);
            setSeekOptimizationActive(false);
            setPendingSeekTime(null);
            // Fallback to regular seek
            video.currentTime = targetTime;
          }
        } else {
          // No chunk info available, use regular smart seeking
          console.log(`[VideoPreview] No chunk info available, using regular smart seeking`);
          const smartUrl = getStreamingUrl(targetTime);
          
          video.src = smartUrl;
          video.load();
          
          const onLoadedMetadata = () => {
            console.log(`[VideoPreview] Regular smart stream metadata loaded, seeking to ${targetTime}s`);
            setTimeout(() => {
              if (video && !video.seeking) {
                video.currentTime = targetTime;
                console.log(`[VideoPreview] Set currentTime to ${targetTime}s after regular smart stream load`);
              }
            }, 50);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            setSeekOptimizationActive(false);
            setPendingSeekTime(null);
            console.log(`[VideoPreview] Smart seek completed to ${targetTime}s`);
          };
          
          const onCanPlay = () => {
            if (Math.abs(video.currentTime - targetTime) > 1) {
              video.currentTime = targetTime;
            }
            video.removeEventListener('canplay', onCanPlay);
          };
          
          video.addEventListener('loadedmetadata', onLoadedMetadata);
          video.addEventListener('canplay', onCanPlay);
        }
      } else {
        // Regular seek for small changes or user-uploaded files
        console.log(`[VideoPreview] Regular seek to ${targetTime}s (Total: ${totalDuration}s, isAdmin: ${file.isAdminCreated})`);
        
        if (!file.isAdminCreated) {
          // For user-uploaded files, use chunked streaming with seek parameter
          const seekUrl = getStreamingUrl(targetTime);
          console.log(`[VideoPreview] User file seek - loading new chunk stream: ${seekUrl}`);
          video.src = seekUrl;
          video.load();
          
          // Set up event listener for when the seeked chunk loads
          const onLoadedData = () => {
            console.log(`[VideoPreview] User file seek chunk loaded, video ready`);
            setPendingSeekTime(null); // Clear pending seek
            video.removeEventListener('loadeddata', onLoadedData);
          };
          video.addEventListener('loadeddata', onLoadedData);
        } else {
          // Admin files use direct currentTime setting
          video.currentTime = targetTime;
          setPendingSeekTime(null);
        }
      }
      
      // FINAL ENFORCEMENT: Ensure video stays paused after any seek operation
      setTimeout(() => {
        if (video && !video.paused) {
          console.log(`[VideoPreview] 🔄 FINAL PAUSE ENFORCEMENT: Ensuring video stays paused after seek`);
          video.pause();
          setPlaying(false);
        }
      }, 100);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    const video = playerRef.current;
    if (video) {
      video.volume = newVolume;
    }
    setVolume(newVolume);
    setMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const video = playerRef.current;
    if (video) {
      video.muted = !video.muted;
      setMuted(video.muted);
    }
  };

const skipBackward = () => {
  const video = playerRef.current;
  if (video) {
    const newTime = Math.max(0, video.currentTime - 10);
    console.log(`[VideoPreview] Skip backward to ${newTime}s`);
    
    const totalDuration = metadataDuration || duration;
    if (smartSeekingEnabled && totalDuration > 0 && chunkInfo) {
      setSeekOptimizationActive(true);
      setLastSeekTime(newTime);
      
      const smartUrl = getStreamingUrl(newTime);
      setTimeout(() => {
        if (video) {
          console.log(`[VideoPreview] Smart skip backward: reloading with ${smartUrl}`);
          video.src = smartUrl;
          video.load();
          
          const onLoadedMetadata = () => {
            video.currentTime = newTime;
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            setSeekOptimizationActive(false);
          };
          
          video.addEventListener('loadedmetadata', onLoadedMetadata);
        }
      }, 50);
    } else {
      video.currentTime = newTime;
    }
  }
};

const skipForward = () => {
  const video = playerRef.current;
  if (video) {
    const totalDuration = metadataDuration || duration;
    const newTime = Math.min(totalDuration, video.currentTime + 10);
    console.log(`[VideoPreview] Skip forward to ${newTime}s`);
    
    if (smartSeekingEnabled && totalDuration > 0 && chunkInfo) {
      setSeekOptimizationActive(true);
      setLastSeekTime(newTime);
      
      const smartUrl = getStreamingUrl(newTime);
      setTimeout(() => {
        if (video) {
          console.log(`[VideoPreview] Smart skip forward: reloading with ${smartUrl}`);
          video.src = smartUrl;
          video.load();
          
          const onLoadedMetadata = () => {
            video.currentTime = newTime;
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            setSeekOptimizationActive(false);
          };
          
          video.addEventListener('loadedmetadata', onLoadedMetadata);
        }
      }, 50);
    } else {
      video.currentTime = newTime;
    }
  }
};  const toggleFullscreen = () => {
    if (screenfull.isEnabled && containerRef.current) {
      if (fullscreen) {
        screenfull.exit();
      } else {
        screenfull.request(containerRef.current);
      }
    }
  };

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(screenfull.isFullscreen);
    };

    if (screenfull.isEnabled) {
      screenfull.on('change', handleFullscreenChange);
      return () => screenfull.off('change', handleFullscreenChange);
    }
  }, []);

  // Auto-hide controls
  useEffect(() => {
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  // Intersection Observer for intelligent preloading
  useEffect(() => {
    const video = playerRef.current;
    const container = containerRef.current;
    
    if (!video || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            // Start preloading when video is 50% visible
            if (video.preload === 'none') {
              console.log(`[VideoPreview] Video entered viewport, starting preload for ${file.fileName}`);
              video.preload = 'metadata';
            }
          }
        });
      },
      { threshold: [0.5] }
    );

    observer.observe(container);

    return () => {
      observer.unobserve(container);
    };
  }, [file.fileName]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Handle mouse movement to show/hide controls
  const handleMouseMove = () => {
    resetControlsTimeout();
  };

  if (error) {
    return (
      <div className={cn("relative bg-black rounded-lg overflow-hidden", className)}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
            <p className="text-lg font-medium mb-2">Video Error</p>
            <p className="text-sm text-gray-300">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Use default controls for user-uploaded files (non-admin)
  if (!file.isAdminCreated) {
    return (
      <div ref={containerRef} className={cn("relative bg-black rounded-lg overflow-hidden", className)}>
        <video
          ref={playerRef}
          src={getStreamingUrl()}
          className="w-full h-full object-contain rounded-lg"
          controls
          preload="metadata"
          playsInline
          crossOrigin="anonymous"
          style={{ background: 'black' }}
          onLoadedMetadata={(e) => {
            const video = e.currentTarget;
            setDuration(video.duration);
            setIsReady(true);
          }}
          onError={(e) => {
            console.error(`[VideoPreview] Video error for ${file.fileName}:`, e);
            handleError(e.currentTarget.error);
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative bg-black rounded-lg overflow-hidden", className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setShowControlsBar(true)}
      onMouseLeave={() => resetControlsTimeout()}
    >
      {/* Native HTML5 Video Player */}
      <video
        ref={playerRef}
        src={(file.mimeType?.startsWith('application/x-mpegurl') || file.fileName.toLowerCase().endsWith('.m3u8')) ? hlsUrl : (hlsUrl || getStreamingUrl())}
        className="w-full h-full object-contain rounded-lg"
        controls={false}
        preload="metadata"
        playsInline
        crossOrigin="anonymous"
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          const videoDuration = video.duration;
          console.log(`[VideoPreview] Video metadata loaded for ${file.fileName}`, {
            duration: videoDuration,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            metadataDuration: metadataDuration,
            currentDuration: duration
          });

          // Initialize virtual time for normal playback (not partial segments)
          if (!isPartialSegment) {
            setVirtualCurrentTime(video.currentTime);
            console.log(`[VideoPreview] Initialized virtual time to ${video.currentTime}s for normal playback`);
          }

          // If we have trusted metadata duration, always prioritize it over video element duration
          if (metadataDuration && metadataDuration > 0) {
            console.log(`[VideoPreview] Using trusted metadata duration: ${metadataDuration}s (video element reports: ${videoDuration}s)`);
            // Check for significant duration mismatch (e.g. > 10% difference)
            // This usually indicates chunked loading or smart seeking
            if (Math.abs(videoDuration - metadataDuration) > metadataDuration * 0.1) {
              console.log(`[VideoPreview] Duration mismatch detected - likely chunked loading (Video: ${videoDuration}s, Metadata: ${metadataDuration}s)`);
              // Don't switch to HLS immediately for chunked loading, as this is expected
            }
            // Always use metadata duration for consistency
            setDuration(metadataDuration);
          } else {
            console.log(`[VideoPreview] No metadata duration available, using video element duration: ${videoDuration}s`);
            // If video duration is suspiciously short (e.g. < 5 mins for a movie), it might be partial content
            // But without metadata, we have to trust the video element
            setDuration(videoDuration);
          }
          handleReady();
        }}
        onCanPlay={(e) => {
          console.log(`[VideoPreview] Video can play for ${file.fileName}`);
          setIsReady(true);
        }}
        onProgress={(e) => {
          const video = e.currentTarget;
          const ranges = getBufferedRanges(video);
          setBufferedRanges(ranges);

          // Update loaded based on total buffered content
          const totalBuffered = ranges.reduce((total, range) => total + (range.end - range.start), 0);
          setLoaded(totalBuffered);

          console.log(`[VideoPreview] Buffer progress for ${file.fileName}:`, {
            bufferedRanges: ranges,
            totalBuffered: Math.round(totalBuffered * 100) + '%'
          });
        }}
        onTimeUpdate={(e) => {
          const video = e.currentTarget;
          // Always use metadataDuration if available for correct progress calculation
          const totalDuration = metadataDuration || duration || video.duration;

          // Update buffered ranges on time update as well
          const ranges = getBufferedRanges(video);
          setBufferedRanges(ranges);

          // Handle virtual time for partial segments
          let currentPlayed: number;
          let displayTime: number;

          if (isPartialSegment) {
            // For partial segments, calculate virtual time based on segment start time + current position
            displayTime = virtualStartTime + video.currentTime;
            setVirtualCurrentTime(displayTime);
            currentPlayed = totalDuration > 0 ? displayTime / totalDuration : 0;

            // Debug logging for virtual time
            if (Math.random() < 0.02) { // Log occasionally
              console.log(`[VideoPreview] 🎯 Virtual time: segment ${video.currentTime.toFixed(1)}s + offset ${virtualStartTime.toFixed(1)}s = ${displayTime.toFixed(1)}s (${(currentPlayed * 100).toFixed(1)}%)`);
            }
          } else {
            // Regular playback - use actual current time
            displayTime = video.currentTime;
            setVirtualCurrentTime(displayTime);
            currentPlayed = totalDuration > 0 ? video.currentTime / totalDuration : 0;
          }

          // Only update played state if not currently seeking or in seek optimization
          if (!seeking && !seekOptimizationActive && !priorityProcessing && !pendingSeekTime) {
            setPlayed(currentPlayed);
          } else if (pendingSeekTime !== null) {
            // If there's a pending seek time, don't let timeupdate override the slider position
            const pendingPlayed = totalDuration > 0 ? pendingSeekTime / totalDuration : 0;
            setPlayed(pendingPlayed);

            // For partial segments, don't try to correct video currentTime - it's relative to the segment
            if (!isPartialSegment && Math.abs(video.currentTime - pendingSeekTime) > 2) {
              console.log(`[VideoPreview] Correcting drift: currentTime ${video.currentTime}s -> pendingSeekTime ${pendingSeekTime}s (isPartialSegment: ${isPartialSegment})`);
              // Only correct drift if we're not in a seek operation and the video is ready
              if (!seeking && !seekOptimizationActive && video.readyState >= 2) {
                video.currentTime = pendingSeekTime;
              } else {
                console.log(`[VideoPreview] Skipping drift correction - seeking: ${seeking}, seekOptimizationActive: ${seekOptimizationActive}, readyState: ${video.readyState}`);
              }
            }
          }

          // Debug logging for duration tracking
          if (Math.random() < 0.01) { // Log occasionally to avoid spam
            const logTime = isPartialSegment ? `virtual: ${displayTime.toFixed(1)}s (segment: ${video.currentTime.toFixed(1)}s)` : `${video.currentTime.toFixed(1)}s`;
            console.log(`[VideoPreview] Time update - ${logTime}, totalDuration: ${totalDuration.toFixed(1)}s, played: ${(currentPlayed * 100).toFixed(1)}%`);
          }
        }}
        onDurationChange={(e) => {
          const newDuration = e.currentTarget.duration;
          console.log(`[VideoPreview] Duration changed: ${newDuration}s (metadata: ${metadataDuration}s, current: ${duration}s)`);
          // Only update if we don't have a trusted metadata duration
          if (!metadataDuration || metadataDuration <= 0) {
            console.log(`[VideoPreview] Updating duration to ${newDuration}s (no trusted metadata available)`);
            setDuration(newDuration);
          } else {
            console.log(`[VideoPreview] Ignoring duration change - using trusted metadata duration: ${metadataDuration}s`);
          }
        }}
        onError={(e) => {
          console.error(`[VideoPreview] Video error for ${file.fileName}:`, e);
          handleError(e.currentTarget.error);
        }}
        onWaiting={() => {
          console.log(`[VideoPreview] Video waiting/buffering for ${file.fileName}`);
          setIsBuffering(true);
        }}
        onCanPlayThrough={() => {
          console.log(`[VideoPreview] Video can play through for ${file.fileName}`);
          setIsBuffering(false);
        }}
        onPlay={() => {
          console.log(`[VideoPreview] Video started playing ${file.fileName} - pauseAfterSeek: ${pauseAfterSeek}`);
          if (pauseAfterSeek) {
            console.log(`[VideoPreview] 🔄 BLOCKING AUTO-RESUME: Pausing video due to recent seek`);
            const video = playerRef.current;
            if (video) {
              video.pause();
            }
            return; // Don't set playing to true
          }
          setPlaying(true);
        }}
        onPause={() => {
          console.log(`[VideoPreview] Video paused ${file.fileName}`);
          setPlaying(false);
        }}
        onClick={togglePlay}
      />

      {/* Loading Overlay */}
      {(!isReady || isBuffering || transcoding || seekOptimizationActive || priorityProcessing) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-white mx-auto mb-4" />
            <p className="text-white text-lg">
              {priorityProcessing
                ? 'Processing priority chunk...'
                : (seekOptimizationActive
                  ? 'Smart seeking...'
                  : (transcoding
                    ? 'Transcoding video for playback...'
                    : (!isReady
                      ? (useDownloadUrl ? 'Loading video file...' : 'Preparing video stream...')
                      : 'Buffering...')))}
            </p>
            {priorityProcessing && (
              <p className="text-orange-400 text-sm mt-2">
                ⚡ Fast-tracking requested chunk (bypassing queue)
              </p>
            )}
            {seekOptimizationActive && chunkInfo && !priorityProcessing && (
              <p className="text-green-400 text-sm mt-2">
                Loading optimized chunks only ({chunkInfo.totalChunks} total)
              </p>
            )}
            {seekOptimizationActive && !chunkInfo && !priorityProcessing && (
              <p className="text-green-400 text-sm mt-2">
                Smart seeking active
              </p>
            )}
            {!seekOptimizationActive && loaded > 0 && (
              <p className="text-white/70 text-sm mt-2">
                {Math.round(loaded * 100)}% buffered
                {bufferedRanges.length > 1 && ` • ${bufferedRanges.length} segments`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Play Button Overlay */}
      {!playing && isReady && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Button
            size="lg"
            variant="secondary"
            className="rounded-full w-20 h-20 bg-white/20 hover:bg-white/30 border-2 border-white/30"
            onClick={togglePlay}
          >
            <Play className="h-10 w-10 text-white ml-1" />
          </Button>
        </div>
      )}

      {/* Controls */}
      {showControls && showControlsBar && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 sm:p-4">
          <div className="mb-4 sm:mb-6">
            <Slider
              value={[played]}
              max={1}
              step={0.001}
              className="w-full cursor-pointer"
              onValueChange={handleSeekChange}
              onPointerDown={handleSeekMouseDown}
              onValueCommit={handleSeekMouseUp}
            />

            <div className="relative mt-2 h-1 bg-white/20 rounded-full">
              {bufferedRanges.map((range, index) => (
                <div
                  key={index}
                  className="absolute top-0 h-full bg-white/40 rounded-full transition-all duration-300"
                  style={{
                    left: `${range.start * 100}%`,
                    width: `${(range.end - range.start) * 100}%`
                  }}
                />
              ))}

              <div
                className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-150"
                style={{ width: `${played * 100}%` }}
              />
            </div>

            {loaded < 1 && (
              <div className="text-xs text-white/70 mt-1">
                Buffered: {Math.round(loaded * 100)}% • {bufferedRanges.length} segment{bufferedRanges.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 sm:justify-between">
            <div className="flex items-center justify-center gap-1 sm:gap-2 order-1 sm:order-none">
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 p-1 sm:p-2"
                onClick={skipBackward}
              >
                <SkipBack className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 p-1 sm:p-2"
                onClick={togglePlay}
              >
                {playing ? <Pause className="h-3 w-3 sm:h-4 sm:w-4" /> : <Play className="h-3 w-3 sm:h-4 sm:w-4" />}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 p-1 sm:p-2"
                onClick={skipForward}
              >
                <SkipForward className="h-3 w-3 sm:h-4 sm:w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 text-white text-xs sm:text-sm order-2 sm:order-none">
              <span>{formatTime(virtualCurrentTime)} / {formatTime(metadataDuration || duration)}</span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 order-3 sm:order-none overflow-x-auto max-w-full">
              <div className="hidden sm:flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20 p-1 sm:p-2"
                  onClick={toggleMute}
                >
                  {muted ? <VolumeX className="h-3 w-3 sm:h-4 sm:w-4" /> : <Volume2 className="h-3 w-3 sm:h-4 sm:w-4" />}
                </Button>
                <div className="w-16 sm:w-20">
                  <Slider
                    value={[muted ? 0 : volume]}
                    max={1}
                    step={0.1}
                    className="w-full"
                    onValueChange={handleVolumeChange}
                  />
                </div>
              </div>



              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 p-1 sm:p-2 flex-shrink-0"
                onClick={toggleFullscreen}
              >
                {fullscreen ? <Minimize className="h-3 w-3 sm:h-4 sm:w-4" /> : <Maximize className="h-3 w-3 sm:h-4 sm:w-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Click to play/pause overlay */}
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={togglePlay}
        style={{ zIndex: showControlsBar ? -1 : 1 }}
      />
    </div>
  );
}