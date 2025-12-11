import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ImageWithProxyProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}

export function ImageWithProxy({ src, alt, className, onClick }: ImageWithProxyProps) {
  const [useProxy, setUseProxy] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Determine if URL should use proxy by default (external URLs)
  useEffect(() => {
    const isExternalUrl = src.startsWith('http://') || src.startsWith('https://');
    console.log('[ImageWithProxy] Initializing for URL:', {
      src,
      isExternalUrl,
      willUseProxyByDefault: isExternalUrl
    });
    setUseProxy(isExternalUrl);
  }, [src]);

  const handleLoad = () => {
    console.log('[ImageWithProxy] Image loaded successfully:', {
      src,
      usedProxy: useProxy,
      finalUrl: useProxy ? `/api/proxy?url=${encodeURIComponent(src)}` : src
    });
    setIsLoading(false);
    setHasError(false);
  };

  const handleError = () => {
    console.error('[ImageWithProxy] Image failed to load:', {
      src,
      usedProxy: useProxy,
      finalUrl: useProxy ? `/api/proxy?url=${encodeURIComponent(src)}` : src,
      willTryProxy: !useProxy
    });

    if (!useProxy) {
      console.log('[ImageWithProxy] Switching to proxy mode');
      setUseProxy(true);
      setHasError(false);
      setIsLoading(true);
    } else {
      console.error('[ImageWithProxy] Proxy also failed, giving up');
      setHasError(true);
      setIsLoading(false);
    }
  };

  const currentSrc = useProxy ? `https://media-alpha-vert.vercel.app/api/proxy?url=${encodeURIComponent(src)}` : src;

  console.log('[ImageWithProxy] Rendering with:', {
    originalSrc: src,
    currentSrc,
    useProxy,
    hasError,
    isLoading
  });

  if (hasError) {
    return (
      <div className={cn("bg-zinc-800 flex items-center justify-center text-zinc-400", className)}>
        <span className="text-xs">Image unavailable</span>
      </div>
    );
  }

  return (
    <>
      {isLoading && (
        <div className={cn("bg-zinc-800 flex items-center justify-center text-zinc-400 animate-pulse", className)}>
          <span className="text-xs">Loading...</span>
        </div>
      )}
      <img
        src={currentSrc}
        alt={alt}
        className={cn(className, isLoading ? "hidden" : "")}
        onClick={onClick}
        onLoad={handleLoad}
        onError={handleError}
      />
    </>
  );
}