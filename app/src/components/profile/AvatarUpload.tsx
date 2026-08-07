"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";
import { useAccount } from "wagmi";
import { useProfileStore } from "@/store/useProfileStore";
import { VLiteLogo } from "@/components/VLiteLogo";

/**
 * Stores the avatar as a data URL in the local profile store for now. Swap
 * the `reader.onload` branch for a POST to the backend's `/uploads` endpoint
 * (see backend/src/routes/upload.ts) once profiles are backend-persisted —
 * that endpoint already returns a stable URL to save here instead.
 */
export function AvatarUpload() {
  const { address } = useAccount();
  const profile = useProfileStore((s) => s.getProfile(address));
  const setAvatar = useProfileStore((s) => s.setAvatar);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !address) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(address, reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={!address}
        className="relative h-24 w-24 rounded-full overflow-hidden group disabled:cursor-not-allowed"
        aria-label="Change avatar"
      >
        {profile.avatarDataUrl ? (
          <img src={profile.avatarDataUrl} alt="Avatar" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-vlite-gradient flex items-center justify-center">
            <VLiteLogo size={40} />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera size={20} className="text-white" />
        </div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}
