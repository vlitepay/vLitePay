"use client";

import { Moon, Sun } from "lucide-react";
import { useVLiteStore } from "@/store/useVLiteStore";

export function ThemeToggle() {
  const theme = useVLiteStore((s) => s.theme);
  const toggleTheme = useVLiteStore((s) => s.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="btn-vlite-icon"
    >
      {theme === "dark" ? (
        <Sun size={18} className="text-vlite-gold" />
      ) : (
        <Moon size={18} className="text-vlite-indigo" />
      )}
    </button>
  );
}
