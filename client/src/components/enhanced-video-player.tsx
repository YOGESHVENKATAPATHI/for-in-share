import { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactPlayer from "react-player";

import screenfull from "screenfull";
import type { FileWithChunks } from "@shared/schema";

interface EnhancedVideoPlayerProps {
  file: FileWithChunks;
  className?: string;
  autoPlay?: boolean;
  showControls?: boolean;
  onError?: (error: string) => void;
  width?: string | number;
  height?: string | number;
}

interface VideoQuality {
  label: string;
  height: number;
  bandwidth: number;
}

export function EnhancedVideoPlayer({
  file,
  className,
  autoPlay = false,
  showControls = true,
  onError,
  width = "100%",
  height = "100%"
}: EnhancedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
    // HLS.js integration for M3U8 files
    useEffect(() => {
      if (
        file.mimeType === "application/x-mpegurl" ||
        file.fileName.toLowerCase().endsWith(".m3u8")
      ) {
        if (videoRef.current) {
          // Check if it's an external URL that needs proxying
          const sourceUrl = (file.directDownloadUrl.startsWith('http://') || file.directDownloadUrl.startsWith('https://'))
            ? `https://media-alpha-vert.vercel.app/api/proxy?url=${encodeURIComponent(file.directDownloadUrl)}`
            : file.directDownloadUrl;

          if (Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(sourceUrl);
            hls.attachMedia(videoRef.current);
            return () => hls.destroy();
          } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
            videoRef.current.src = sourceUrl;
          }
        }
      }
    }, [file.directDownloadUrl, file.mimeType, file.fileName]);
  console.log(`[VideoPlayer] Component mounted/rerendered for file ${file.id}, autoPlay: ${autoPlay}`);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  if (
    file.mimeType === "application/x-mpegurl" ||
    file.fileName.toLowerCase().endsWith(".m3u8")
  ) {
    return (
      <div className={cn("relative bg-black rounded-lg overflow-hidden flex items-center justify-center", className)}>
        <video
          ref={videoRef}
          controls
          style={{ width: width, height: height, borderRadius: "0.5rem" }}
          autoPlay={autoPlay}
        />
      </div>
    );
  }
  const [bufferEnd, setBufferEnd] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playerKey, setPlayerKey] = useState(0); // Force remount when needed
  const [useProxy, setUseProxy] = useState(false); // Track if we should use proxy
  // HLS functionality removed - using direct streaming only

  // Quality and adaptive streaming
  const [quality, setQuality] = useState<VideoQuality>({ 
    label: 'Auto', 
    height: 720, 
    bandwidth: 1000000 
  });

  // Metadata fetching removed - using ReactPlayer's built-in duration detection



  const [availableQualities] = useState<VideoQuality[]>([
    { label: 'Auto', height: 720, bandwidth: 1000000 },
    { label: '1080p', height: 1080, bandwidth: 3000000 },
    { label: '720p', height: 720, bandwidth: 1500000 },
    { label: '480p', height: 480, bandwidth: 800000 },
    { label: '360p', height: 360, bandwidth: 400000 }
  ]);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // Controls timeout
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  // Reset controls timeout for auto-hide functionality
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControlsBar(true);
    if (playing && showControls) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControlsBar(false);
      }, 3000);
    }
  }, [playing, showControls]);

  // Generate streaming URL with quality parameters and smart seeking
  const getStreamingUrl = useCallback(() => {
    // For admin-created files with direct URLs
    if (file.isAdminCreated && file.directDownloadUrl) {
      if (useProxy) {
        const proxyUrl = `https://media-alpha-vert.vercel.app/api/proxy?url=${encodeURIComponent(file.directDownloadUrl)}`;
        console.log(`[VideoPlayer] Using Vercel proxy URL:`, proxyUrl);
        return proxyUrl;
      } else {
        console.log(`[VideoPlayer] Using direct URL:`, file.directDownloadUrl);
        return file.directDownloadUrl;
      }
    }
    
    // Always use the direct stream endpoint which supports range requests
    // This allows the browser to handle seeking natively
    const baseUrl = `/api/files/${file.id}/stream`;
    console.log(`[VideoPlayer] Using Stream URL:`, baseUrl);
    return baseUrl;
  }, [file.id, file.isAdminCreated, file.directDownloadUrl, useProxy]);



  // Format time for display
  const formatTime = (seconds: number) => {
    const date = new Date(seconds * 1000);
    const hh = date.getUTCHours();
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    if (hh) {
      return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
    }
    return `${mm}:${ss}`;
  };

  // React Player event handlers
  const handleReady = () => {
    console.log("[VideoPlayer] Player ready", { url: getStreamingUrl() });
    setIsReady(true);
    setError(null);
  };

  const handleStart = () => {
    console.log("[VideoPlayer] Playback started");
    setIsBuffering(false);
  };

  const handleProgress = (state: any) => {
    if (!seeking) {
      setPlayed(state.played);
      setLoaded(state.loaded);
    }
    setBufferEnd(state.loaded);
    setIsBuffering(false);
  };

  const handleDuration = (newDuration: number) => {
    console.log(`[VideoPlayer] Player reported duration: ${newDuration}s`);
    setDuration(prev => Math.max(prev, newDuration));
  };

  const handleSeekMouseDown = () => {
    setSeeking(true);
  };

  const handleSeekChange = (value: number[]) => {
    setPlayed(value[0]);
  };

  const handleSeekMouseUp = (value: number[]) => {
    console.log(`[VideoPlayer] handleSeekMouseUp called with value: ${value[0]}`);
    setSeeking(false);
    const seekTime = value[0] * duration;
    
    if (playerRef.current) {
      // Always pause when seeking - user must manually resume
      console.log(`[VideoPlayer] Seek to ${seekTime.toFixed(1)}s - FORCING PAUSE for manual resume`);
      console.log(`[VideoPlayer] Current playing state before seek: ${playing}`);
      
      // Immediately set to paused state
      setPlaying(false);
      
      // For large seeks (>30 seconds difference), restart the player for better performance
      const currentTime = playerRef.current.getCurrentTime();
      const timeDiff = Math.abs(seekTime - currentTime);
      
      if (timeDiff > 30) {
        console.log(`[VideoPlayer] Large seek detected (${timeDiff.toFixed(1)}s), restarting player`);
        setIsReady(false);
        setPlayerKey(prev => prev + 1); // Force remount
        setPlayed(value[0]);
      } else {
        // Small seek - use normal seeking
        playerRef.current.seekTo(value[0]);
      }
      
      // Double-ensure we stay paused after seeking
      setTimeout(() => {
        console.log(`[VideoPlayer] Final enforcement - setting playing to false`);
        setPlaying(false);
      }, 200);
    } else {
      console.error('[VideoPlayer] playerRef.current is null in handleSeekMouseUp');
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    setMuted(newVolume === 0);
  };

  const handlePlayPause = () => {
    const newPlayingState = !playing;
    console.log(`[VideoPlayer] Play/Pause clicked - current: ${playing}, new: ${newPlayingState}`);
    setPlaying(newPlayingState);
  };

  const handleMute = () => {
    setMuted(!muted);
  };

  const handleSkipBack = () => {
    if (playerRef.current) {
      const currentTime = playerRef.current.getCurrentTime();
      const newTime = Math.max(0, currentTime - 10);
      
      console.log(`[VideoPlayer] Skip back to ${newTime.toFixed(1)}s - pausing for manual resume`);
      
      // Pause and seek - user must manually resume
      setPlaying(false);
      playerRef.current.seekTo(newTime / duration);
      
      // Stay paused
      setTimeout(() => {
        setPlaying(false);
      }, 100);
    }
  };

  const handleSkipForward = () => {
    if (playerRef.current) {
      const currentTime = playerRef.current.getCurrentTime();
      const newTime = Math.min(duration, currentTime + 10);
      
      console.log(`[VideoPlayer] Skip forward to ${newTime.toFixed(1)}s - pausing for manual resume`);
      
      // Pause and seek - user must manually resume
      setPlaying(false);
      playerRef.current.seekTo(newTime / duration);
      
      // Stay paused
      setTimeout(() => {
        setPlaying(false);
      }, 100);
    }
  };

  const handleFullscreen = () => {
    if (screenfull.isEnabled && containerRef.current) {
      if (fullscreen) {
        screenfull.exit();
      } else {
        screenfull.request(containerRef.current);
      }
    }
  };

  const handleError = (error: any) => {
    console.error('[VideoPlayer] Video player error:', error);
    
    // If this is an admin-created file with direct URL and we haven't tried proxy yet
    if (file.isAdminCreated && file.directDownloadUrl && !useProxy) {
      console.log('[VideoPlayer] Direct URL failed, trying proxy URL');
      setUseProxy(true);
      setPlayerKey(prev => prev + 1); // Force remount with proxy URL
      setError(null);
      setIsReady(false);
      return;
    }
    
    const errorMessage = 'Failed to load video. The video format may not be supported by your browser.';
    setError(errorMessage);
    onError?.(errorMessage);
  };

  const handleBuffer = () => {
    setIsBuffering(true);
    console.log('[VideoPlayer] Buffering started');
  };

  const handleBufferEnd = () => {
    setIsBuffering(false);
    
    // Clear stuck check
    if (stuckCheckTimeout) {
      clearTimeout(stuckCheckTimeout);
      setStuckCheckTimeout(null);
  const handleBufferEnd = () => {
    setIsBuffering(false);
    console.log('[VideoPlayer] Buffering ended');
  };

// Seek to current position after quality change
    setTimeout(() => {
      if (playerRef.current) {
        playerRef.current.seekTo(currentTime);
      }
    }, 100);
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

  // Monitor playing state changes
  useEffect(() => {
    console.log(`[VideoPlayer] Playing state changed to: ${playing}`);
  }, [playing]);

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
      <div className={cn("relative bg-black rounded-lg overflow-hidden flex items-center justify-center", className)}>
        <div className="text-center text-white p-8">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-400" />
          <h3 className="text-xl font-semibold mb-2">Video Error</h3>
          <p className="text-sm text-gray-300 mb-4">{error}</p>
          <Button 
            variant="secondary" 
            onClick={() => {
              setError(null);
              setIsReady(false);
            }}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn("relative bg-black rounded-lg overflow-hidden group", className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setShowControlsBar(true)}
      onMouseLeave={() => resetControlsTimeout()}
    >
      {/* React Player */}
      <ReactPlayer
        ref={playerRef}
        key={`${file.id}-${playerKey}`}
        url={getStreamingUrl()}
        playing={playing}
        controls={false}
        volume={muted ? 0 : volume}
        width={width}
        height={height}
        onReady={handleReady}
        onStart={handleStart}
        onProgress={handleProgress}
        onDuration={handleDuration}
        onError={handleError}
        onBuffer={handleBuffer}
        onBufferEnd={handleBufferEnd}

        config={{
          file: {
            forceVideo: true,
            attributes: {
              crossOrigin: "anonymous",
              controlsList: "nodownload",
              preload: 'none' // Don't preload to avoid unnecessary requests
            },
            // Direct streaming only - no HLS options needed
          }
        }}
        progressInterval={1000} // Standard progress updates
        style={{
          borderRadius: '0.5rem'
        }}
      />

      {/* Loading Overlay */}
      {(!isReady || isBuffering) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-white mx-auto mb-4" />
            <p className="text-white text-lg">
              {!isReady ? 'Loading video...' : 'Buffering...'}
            </p>
            {!isReady && loaded > 0 && (
              <p className="text-white/70 text-sm mt-2">
                {Math.round(loaded * 100)}% loaded
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
            onClick={handlePlayPause}
          >
            <Play className="h-10 w-10 text-white ml-1" />
          </Button>
        </div>
      )}

      {/* Custom Controls */}
      {showControls && showControlsBar && isReady && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6">
          <div className="mb-6">
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
              <div 
                className="absolute top-0 left-0 h-full bg-white/40 rounded-full transition-all duration-300"
                style={{ width: `${loaded * 100}%` }}
              />
              <div 
                className="absolute top-0 left-0 h-full bg-blue-500 rounded-full transition-all duration-150"
                style={{ width: `${played * 100}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 p-2"
                onClick={handleSkipBack}
              >
                <SkipBack className="h-5 w-5" />
              </Button>
              
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 p-2"
                onClick={handlePlayPause}
              >
                {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
              </Button>
              
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20 p-2"
                onClick={handleSkipForward}
              >
                <SkipForward className="h-5 w-5" />
              </Button>
              
              <div className="flex items-center gap-2 ml-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20 p-2"
                  onClick={handleMute}
                >
                  {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </Button>
                <div className="w-24">
                  <Slider
                    value={[muted ? 0 : volume]}
                    max={1}
                    step={0.1}
                    className="w-full"
                    onValueChange={handleVolumeChange}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-white text-sm font-medium">
              <span>{formatTime(duration * played)}</span>
              <span className="text-white/60">/</span>
              <span className="text-white/80">{formatTime(duration)}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20 p-2"
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                >
                  <Settings className="h-5 w-5" />
                </Button>
                
                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-black/90 rounded-lg py-2 min-w-[160px]">
                    <div className="px-3 py-1 text-white/70 text-xs font-medium">Quality</div>
                    {availableQualities.map((q) => (
                      <button
                        key={q.label}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-white/20 transition-colors",
                          quality.label === q.label ? "text-blue-400 bg-white/10" : "text-white"
                        )}
                        onClick={() => handleQualityChange(q)}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {screenfull.isEnabled && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20 p-2"
                  onClick={handleFullscreen}
                >
                  {fullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}