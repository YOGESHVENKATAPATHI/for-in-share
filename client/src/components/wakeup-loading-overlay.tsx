import { useEffect, useMemo, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

const SHOW_DELAY_MS = 1200;

export function WakeupLoadingOverlay() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const activeRequests = fetching + mutating;
  const isBusy = activeRequests > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isBusy) {
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => {
      setVisible(true);
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isBusy]);

  const subtitle = useMemo(() => {
    if (activeRequests <= 1) {
      return "Waking server/database...";
    }

    return `Waking services... (${activeRequests} requests in progress)`;
  }, [activeRequests]);

  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center p-3">
      <div className="pointer-events-auto flex items-center gap-3 rounded-md border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-zinc-100 shadow-lg backdrop-blur-sm">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-100" />
        <div className="leading-tight">
          <p className="text-xs font-semibold tracking-wide">Loading</p>
          <p className="text-xs text-zinc-300">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
