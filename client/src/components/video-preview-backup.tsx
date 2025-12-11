import { useState, useEffect, useRef, useCallback } from "react";
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
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileWithChunks } from "@shared/schema";

interface VideoPreviewProps {
  file: FileWithChunks;
  className?: string;
  autoPlay?: boolean;
  showControls?: boolean;
  onError?: (error: string) => void;
}

// Helper function to format time
const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

export function VideoPreview({
  file,
  className,
  autoPlay = false,
  showControls = true,
  onError
}: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControlsBar, setShowControlsBar] = useState(true);
  const [error, setError] = useState<string | null>(null);
interface BufferedRange {
  start: number;
  end: number;
}

interface VideoQuality {
  label: string;
  height: number;
  bandwidth: number;
}

const [bufferedRanges, setBufferedRanges] = useState<BufferedRange[]>([]);
  const [isBuffering, setIsBuffering] = useState(false);
  const [loadedProgress, setLoadedProgress] = useState(0);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>({ label: 'Auto', height: 720, bandwidth: 1000000 });
  const [availableQualities] = useState<VideoQuality[]>([
    { label: 'Auto', height: 720, bandwidth: 1000000 },
    { label: '1080p', height: 1080, bandwidth: 3000000 },
    { label: '720p', height: 720, bandwidth: 1500000 },
    { label: '480p', height: 480, bandwidth: 800000 },
    { label: '360p', height: 360, bandwidth: 400000 }
  ]);
  const [networkSpeed, setNetworkSpeed] = useState(1000000);
  const [adaptiveBitrate, setAdaptiveBitrate] = useState(true);
  const [preloadStrategy, setPreloadStrategy] = useState<'metadata' | 'auto' | 'none'>('metadata');

  // Hide controls after 3 seconds of inactivity
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();

  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControlsBar(true);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControlsBar(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Update buffered ranges for progress display
  const updateBufferedRanges = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const ranges: BufferedRange[] = [];
    for (let i = 0; i < video.buffered.length; i++) {
      ranges.push({
        start: video.buffered.start(i),
        end: video.buffered.end(i)
      });
    }
    setBufferedRanges(ranges);

    // Calculate loaded progress percentage
    if (video.duration > 0) {
      let totalBuffered = 0;
      for (const range of ranges) {
        totalBuffered += range.end - range.start;
      }
      setLoadedProgress((totalBuffered / video.duration) * 100);
    }
  }, []);

  // Advanced adaptive streaming initialization
  const initializeAdaptiveStreaming = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      setIsLoading(true);
      setError(null);

      // Detect network speed for adaptive bitrate
      const startTime = performance.now();
      const testUrl = `/api/files/${file.id}/speed-test`;
      
      try {
        const testResponse = await fetch(testUrl, {
          method: 'HEAD',
          cache: 'no-cache'
        });
        const endTime = performance.now();
        const responseTime = endTime - startTime;
        const estimatedSpeed = responseTime < 200 ? 3000000 : responseTime < 500 ? 1500000 : 800000;
        setNetworkSpeed(estimatedSpeed);
      } catch {
        // Fallback to conservative bandwidth
        setNetworkSpeed(800000);
      }

      // Configure adaptive streaming URL with quality parameters
      const streamingUrl = `/api/files/${file.id}/stream?quality=${videoQuality.height}&adaptive=${adaptiveBitrate}`;
      
      // Configure video for optimal streaming
      video.preload = preloadStrategy;
      video.crossOrigin = 'anonymous';
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      
      // Enable Media Source Extensions if supported
      if ('MediaSource' in window && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')) {
        // Use adaptive streaming with MSE
        await setupMediaSourceStreaming(video, streamingUrl);
      } else {
        // Fallback to progressive streaming
        video.src = streamingUrl;
      }

        // Wait for metadata to load
        await new Promise((resolve, reject) => {
          const onLoadedMetadata = () => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('error', onError);
            resolve(void 0);
          };

          const onError = (e: Event) => {
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('error', onError);
            reject(new Error('Failed to load video metadata'));
          };

          video.addEventListener('loadedmetadata', onLoadedMetadata);
          video.addEventListener('error', onError);
        });

      setDuration(video.duration);
      setIsLoading(false);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize adaptive streaming';
      setError(errorMessage);
      onError?.(errorMessage);
      setIsLoading(false);
    }
  }, [file.id, videoQuality, adaptiveBitrate, preloadStrategy, onError]);

  // Media Source Extensions setup for chunked streaming
  const setupMediaSourceStreaming = useCallback(async (video: HTMLVideoElement, baseUrl: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!('MediaSource' in window)) {
        reject(new Error('MediaSource not supported'));
        return;
      }

      const mediaSource = new MediaSource();
      const objectURL = URL.createObjectURL(mediaSource);
      video.src = objectURL;

      mediaSource.addEventListener('sourceopen', async () => {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
          let chunkIndex = 0;
          const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

          const loadChunk = async () => {
            try {
              const chunkUrl = `${baseUrl}&chunk=${chunkIndex}&size=${CHUNK_SIZE}`;
              const response = await fetch(chunkUrl);
              
              if (!response.ok) {
                if (response.status === 206 || response.status === 416) {
                  // End of stream
                  mediaSource.endOfStream();
                  resolve();
                  return;
                }
                throw new Error(`Chunk load failed: ${response.status}`);
              }

              const arrayBuffer = await response.arrayBuffer();
              
              if (sourceBuffer.updating) {
                sourceBuffer.addEventListener('updateend', () => {
                  loadChunk();
                }, { once: true });
              } else {
                sourceBuffer.appendBuffer(arrayBuffer);
                sourceBuffer.addEventListener('updateend', () => {
                  chunkIndex++;
                  loadChunk();
                }, { once: true });
              }

            } catch (error) {
              console.error('Chunk loading error:', error);
              mediaSource.endOfStream('decode');
              reject(error);
            }
          };

          loadChunk();

        } catch (error) {
          reject(error);
        }
      });

      mediaSource.addEventListener('sourceended', () => {
        URL.revokeObjectURL(objectURL);
      });
    });
  }, []);

  // Initialize video with adaptive streaming
  useEffect(() => {
    initializeAdaptiveStreaming();
  }, [initializeAdaptiveStreaming]);

  // Enhanced buffering event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleProgress = () => {
      updateBufferedRanges();
      
      // Adaptive quality switching based on buffer health
      if (adaptiveBitrate) {
        const bufferedAhead = video.buffered.length > 0 ? 
          video.buffered.end(video.buffered.length - 1) - video.currentTime : 0;
        
        if (bufferedAhead < 5 && videoQuality.height > 360) {
          // Reduce quality if buffer is low
          const lowerQuality = availableQualities.find(q => q.height < videoQuality.height);
          if (lowerQuality) {
            setVideoQuality(lowerQuality);
          }
        } else if (bufferedAhead > 30 && videoQuality.height < 1080 && networkSpeed > 2000000) {
          // Increase quality if buffer is healthy and bandwidth allows
          const higherQuality = availableQualities.find(q => q.height > videoQuality.height && q.bandwidth <= networkSpeed);
          if (higherQuality) {
            setVideoQuality(higherQuality);
          }
        }
      }
    };

    const handleWaiting = () => {
      setIsBuffering(true);
      // Preload more aggressively when buffering
      if (video.preload !== 'auto') {
        video.preload = 'auto';
        setPreloadStrategy('auto');
      }
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
      // Return to metadata preloading if buffer is healthy
      const bufferedAhead = video.buffered.length > 0 ? 
        video.buffered.end(video.buffered.length - 1) - video.currentTime : 0;
      if (bufferedAhead > 10 && preloadStrategy === 'auto') {
        video.preload = 'metadata';
        setPreloadStrategy('metadata');
      }
    };

    const handleLoadStart = () => setIsLoading(true);
    const handleLoadedData = () => {
      setIsLoading(false);
      updateBufferedRanges();
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      
      // Intelligent preloading: load ahead based on playback position
      const playedPercentage = video.currentTime / video.duration;
      if (playedPercentage > 0.8 && preloadStrategy !== 'auto') {
        video.preload = 'auto';
        setPreloadStrategy('auto');
      }
    };

    video.addEventListener('progress', handleProgress);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [updateBufferedRanges, adaptiveBitrate, videoQuality, availableQualities, networkSpeed, preloadStrategy]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const ranges: BufferedRange[] = [];
        for (let i = 0; i < video.buffered.length; i++) {
          ranges.push({
            start: video.buffered.start(i),
            end: video.buffered.end(i)
          });
        }
        setBufferedRanges(ranges);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setShowControlsBar(true);
    };

    const handleError = () => {
      setError('Video playback error');
      setIsLoading(false);
      onError?.('Video playback error');
    };

    const handleWaiting = () => {
      setIsBuffering(true);
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
    };

    const handleCanPlayThrough = () => {
      setIsBuffering(false);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('canplaythrough', handleCanPlayThrough);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('canplaythrough', handleCanPlayThrough);
    };
  }, [onError]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (isPlaying) {
        video.pause();
        setIsPlaying(false);
      } else {
        await video.play();
        setIsPlaying(true);
      }
    } catch (err) {
      console.error('Playback error:', err);
    }
  };

  const handleSeek = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = value[0];
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = value[0];
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.volume = volume;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  };

  const skipTime = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + seconds));
  };

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className={cn("flex items-center justify-center h-64 bg-muted rounded-lg", className)}>
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative bg-black rounded-lg overflow-hidden group", className)}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => setShowControlsBar(false)}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        preload="metadata"
        playsInline
        crossOrigin="anonymous"
        onClick={togglePlay}
      />

      {/* Loading Overlay */}
      {(isLoading || isBuffering) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-white mx-auto mb-2" />
            <p className="text-white text-sm">
              {isBuffering ? 'Buffering...' : 'Loading video...'}
            </p>
          </div>
        </div>
      )}

      {/* Play Button Overlay */}
      {!isPlaying && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Button
            variant="secondary"
            size="lg"
            className="rounded-full w-16 h-16 bg-black/50 hover:bg-black/70 border-0"
            onClick={togglePlay}
          >
            <Play className="h-8 w-8 text-white ml-1" />
          </Button>
        </div>
      )}

      {/* Controls */}
      {showControls && showControlsBar && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress Bar */}
          <div className="mb-4">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              className="w-full"
              onValueChange={handleSeek}
            />
            {/* Buffered ranges indicator */}
            <div className="relative mt-1 h-1 bg-white/20 rounded">
              {/* Overall loading progress */}
              <div 
                className="absolute top-0 left-0 h-full bg-blue-500/30 rounded transition-all duration-300"
                style={{ width: `${loadedProgress}%` }}
              />
              {/* Individual buffered ranges */}
              {bufferedRanges.map((range, index) => (
                <div
                  key={index}
                  className="absolute top-0 h-full bg-white/50 rounded"
                  style={{
                    left: `${(range.start / duration) * 100}%`,
                    width: `${((range.end - range.start) / duration) * 100}%`
                  }}
                />
              ))}
            </div>
            {/* Loading progress text */}
            {loadedProgress < 100 && (
              <div className="text-xs text-white/70 mt-1">
                Loaded: {loadedProgress.toFixed(1)}%
              </div>
            )}
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={togglePlay}>
                {isPlaying ? (
                  <Pause className="h-4 w-4 text-white" />
                ) : (
                  <Play className="h-4 w-4 text-white" />
                )}
              </Button>

              <Button variant="ghost" size="sm" onClick={() => skipTime(-10)}>
                <SkipBack className="h-4 w-4 text-white" />
              </Button>

              <Button variant="ghost" size="sm" onClick={() => skipTime(10)}>
                <SkipForward className="h-4 w-4 text-white" />
              </Button>

              <div className="flex items-center gap-2 ml-4">
                <Button variant="ghost" size="sm" onClick={toggleMute}>
                  {isMuted ? (
                    <VolumeX className="h-4 w-4 text-white" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-white" />
                  )}
                </Button>

                <div className="w-20">
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    max={1}
                    step={0.1}
                    className="w-full"
                    onValueChange={handleVolumeChange}
                  />
                </div>
              </div>
              
              {/* Quality and adaptive controls */}
              <div className="flex items-center gap-2 ml-4">
                <select 
                  value={videoQuality.label}
                  onChange={(e) => {
                    const quality = availableQualities.find(q => q.label === e.target.value);
                    if (quality) {
                      setVideoQuality(quality);
                      initializeAdaptiveStreaming();
                    }
                  }}
                  className="bg-black/50 text-white text-xs border border-white/20 rounded px-2 py-1"
                >
                  {availableQualities.map(quality => (
                    <option key={quality.label} value={quality.label}>
                      {quality.label}
                    </option>
                  ))}
                </select>
                
                <Button
                  variant="ghost"
                  size="sm" 
                  onClick={() => setAdaptiveBitrate(!adaptiveBitrate)}
                  className={`text-xs px-2 ${adaptiveBitrate ? 'text-green-400' : 'text-white/70'}`}
                >
                  AUTO
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-white text-sm">
              {/* Network status indicator */}
              <div className={`w-2 h-2 rounded-full ${
                networkSpeed > 2000000 ? 'bg-green-400' : 
                networkSpeed > 1000000 ? 'bg-yellow-400' : 'bg-red-400'
              }`} title={`Network: ${(networkSpeed / 1000000).toFixed(1)}Mbps`} />
              
              <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
                {isFullscreen ? (
                  <Minimize className="h-4 w-4 text-white" />
                ) : (
                  <Maximize className="h-4 w-4 text-white" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}