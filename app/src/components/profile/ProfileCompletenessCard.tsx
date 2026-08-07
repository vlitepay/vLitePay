"use client";

import { Sparkles } from "lucide-react";

interface ProfileCompletenessCardProps {
  hasUsername: boolean;
  hasAvatar: boolean;
}

/**
 * Soft nudge shown at the top of the Settings tab, only while the profile is
 * missing something important (username or avatar). Disappears on its own
 * once both are set — no dismiss action needed.
 */
export function ProfileCompletenessCard({ hasUsername, hasAvatar }: ProfileCompletenessCardProps) {
  const missing: string[] = [];
  if (!hasAvatar) missing.push("profile photo");
  if (!hasUsername) missing.push("username");

  if (missing.length === 0) return null;

  return (
    <div className="glass-panel p-4 flex items-start gap-3">
      <div className="h-9 w-9 rounded-full bg-vlite-gradient flex items-center justify-center shrink-0">
        <Sparkles size={16} className="text-white" />
      </div>
      <div>
        <p className="text-sm font-semibold">Complete your profile</p>
        <p className="text-xs text-ink-muted">Add a {missing.join(" and ")} to help others recognize you.</p>
      </div>
    </div>
  );
}
