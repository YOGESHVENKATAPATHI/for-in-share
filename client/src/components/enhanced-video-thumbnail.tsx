import { useState, useEffect, useRef } from "react";
import { Play, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactPlayer from "react-player";
import type { FileWithChunks } from "@shared/schema";

interface VideoThumbnailProps {
  file: FileWithChunks;
  className?: string;
  size?: "sm" | "md" | "lg";
  showPlayButton?: boolean;
  onClick?: () => void;
}

export function VideoThumbnail({
  file,
  className,
  size = "md",
  showPlayButton = true,
  onClick
}: VideoThumbnailProps) {
  const playerRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [useProxy, setUseProxy] = useState(false);

  const sizeClasses = {
    sm: "w-16 h-16",
    md: "w-32 h-24",
    lg: "w-48 h-32"
  };

  // Generate streaming URL
  const getStreamingUrl = () => {
    // For admin-created files with direct URLs
    if (file.isAdminCreated && file.directDownloadUrl) {
      if (useProxy) {
        return `https://media-alpha-vert.vercel.app/api/proxy?url=${encodeURIComponent(file.directDownloadUrl)}`;
      } else {
        return file.directDownloadUrl;
      }
    }
    
    return `/api/files/${file.id}/stream`;
  };

  // Handle player ready event and capture thumbnail
  const handlePlayerReady = () => {
    setIsPlayerReady(true);
    // Wait a bit for the player to fully load the first frame
    setTimeout(() => {
      captureThumbnail();
    }, 1000);
  };

  // Capture thumbnail from video frame
  const captureThumbnail = async () => {
    const player = playerRef.current;
    const canvas = canvasRef.current;
    
    if (!player || !canvas) return;

    try {
      // Get the internal video element from React Player
      const internalPlayer = player.getInternalPlayer();
      
      if (internalPlayer && 'videoWidth' in internalPlayer) {
        const video = internalPlayer as HTMLVideoElement;
        
        if (video.readyState >= 2) { // HAVE_CURRENT_DATA
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Set canvas dimensions to match video
            canvas.width = video.videoWidth || 320;
            canvas.height = video.videoHeight || 240;
            
            // Draw the current video frame to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convert canvas to blob URL
            canvas.toBlob((blob) => {
              if (blob) {
                const url = URL.createObjectURL(blob);
                setThumbnailUrl(url);
                setIsLoading(false);
                setError(false);
              }
            }, 'image/jpeg', 0.8);
          }
        } else {
          // If not ready, try again in a bit
          setTimeout(captureThumbnail, 500);
        }
      }
    } catch (error) {
      console.error('Thumbnail capture failed:', error);
      setError(true);
      setIsLoading(false);
    }
  };

  // Handle player error
  const handlePlayerError = (error: any) => {
    console.error('[VideoThumbnail] Video thumbnail player error:', error);
    
    // If this is an admin-created file with direct URL and we haven't tried proxy yet
    if (file.isAdminCreated && file.directDownloadUrl && !useProxy) {
      console.log('[VideoThumbnail] Direct URL failed, trying proxy URL');
      setUseProxy(true);
      setError(false);
      setIsLoading(true);
      setIsPlayerReady(false);
      return;
    }
    
    setError(true);
    setIsLoading(false);
  };

  // Handle player progress to capture first frame
  const handleProgress = (state: any) => {
    // Once we have the first frame loaded, capture thumbnail
    if (state.played > 0 && !thumbnailUrl && !error) {
      setTimeout(captureThumbnail, 100);
    }
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (thumbnailUrl && thumbnailUrl.startsWith('blob:')) {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [thumbnailUrl]);

  return (
    <div
      className={cn(
        "relative bg-muted rounded-lg overflow-hidden flex items-center justify-center cursor-pointer group",
        sizeClasses[size],
        className
      )}
      onClick={onClick}
    >
      {/* Hidden React Player for thumbnail generation */}
      <div className="absolute opacity-0 pointer-events-none w-full h-full">
        <ReactPlayer
          ref={playerRef}
          url={getStreamingUrl()}
          playing={false}
          muted={true}
          width="100%"
          height="100%"
          onReady={handlePlayerReady}
          onError={handlePlayerError}
          onProgress={handleProgress}

        />
      </div>

      {/* Hidden canvas for thumbnail capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Loading state */}
      {isLoading && !error && (
        <div className="flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center p-2 text-center">
          <AlertCircle className="h-6 w-6 text-muted-foreground mb-1" />
          <span className="text-xs text-muted-foreground">Video</span>
        </div>
      )}

      {/* Success state with thumbnail */}
      {thumbnailUrl && !error && (
        <>
          <img
            src={thumbnailUrl}
            alt={`${file.fileName} thumbnail`}
            className="w-full h-full object-cover"
            onError={() => {
              setError(true);
              setThumbnailUrl(null);
            }}
          />

          {/* Overlay gradient on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

          {/* Play button overlay */}
          {showPlayButton && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <div className="w-10 h-10 bg-black/70 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Play className="h-5 w-5 text-white ml-0.5" fill="white" />
              </div>
            </div>
          )}

          {/* Video type badge */}
          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
            Video
          </div>
        </>
      )}

      {/* Fallback state */}
      {!thumbnailUrl && !isLoading && !error && (
        <div className="flex flex-col items-center justify-center p-2 text-center">
          <Play className="h-8 w-8 text-muted-foreground mb-1" />
          <span className="text-xs text-muted-foreground">Video</span>
        </div>
      )}
    </div>
  );
}