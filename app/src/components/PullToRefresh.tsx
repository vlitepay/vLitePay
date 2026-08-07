"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import clsx from "clsx";

const THRESHOLD = 68; // px pulled before a release triggers refresh
const MAX_PULL = 110; // px cap so the gesture doesn't feel elastic-infinite

/**
 * Lightweight touch-based pull-to-refresh. Only activates when the page is
 * scrolled to the very top, so it never fights normal scrolling. Wrap any
 * scrollable screen content with this component and pass an async
 * `onRefresh` — the indicator stays visible (spinning) until it resolves.
 */
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: React.ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);

  function handleTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    if (window.scrollY > 0) {
      startY.current = null;
      return;
    }
    startY.current = e.touches[0].clientY;
    dragging.current = true;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!dragging.current || startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // Damp the movement so it feels natural rather than 1:1 with the finger.
    setPull(Math.min(delta * 0.5, MAX_PULL));
  }

  async function handleTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    startY.current = null;

    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{ height: refreshing ? THRESHOLD : pull }}
        aria-hidden={pull === 0 && !refreshing}
      >
        <div className="glass-panel-flush h-9 w-9 rounded-full flex items-center justify-center">
          <RefreshCw
            size={16}
            className={clsx("text-vlite-purple transition-transform", refreshing && "animate-spin")}
            style={!refreshing ? { transform: `rotate(${progress * 360}deg)`, opacity: progress } : undefined}
          />
        </div>
      </div>

      {children}
    </div>
  );
}
