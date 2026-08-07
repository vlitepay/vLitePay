import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Core brand — cyan-blue to deep purple, matching the vLitePay "V" mark.
        vlite: {
          cyan: "#22D3EE",
          blue: "#3B82F6",
          indigo: "#6366F1",
          purple: "#7C3AED",
          deep: "#4C1D95",
          gold: "#FBBF24", // star-halo accent — used sparingly (ratings, premium badges)
        },
        // Surfaces
        surface: {
          light: "#F7F8FC",
          "light-raised": "#FFFFFF",
          dark: "#0B0E1A",
          "dark-raised": "#131728",
          "dark-glass": "rgba(19, 23, 40, 0.55)",
          "light-glass": "rgba(255, 255, 255, 0.55)",
        },
        ink: {
          light: "#0B0E1A",
          dark: "#F4F5FA",
          muted: "#8A8FA3",
        },
        success: "#22C55E",
        danger: "#F43F5E",
        warning: "#FBBF24",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "vlite-gradient": "linear-gradient(135deg, #22D3EE 0%, #6366F1 55%, #7C3AED 100%)",
        "vlite-gradient-vertical": "linear-gradient(180deg, #22D3EE 0%, #4C1D95 100%)",
        "vlite-radial-glow": "radial-gradient(circle, rgba(251,191,36,0.35) 0%, rgba(124,58,237,0) 70%)",
        "vlite-mesh": "radial-gradient(at 20% 0%, rgba(34,211,238,0.18) 0px, transparent 50%), radial-gradient(at 80% 100%, rgba(124,58,237,0.20) 0px, transparent 50%)",
      },
      boxShadow: {
        glow: "0 0 40px rgba(99, 102, 241, 0.35)",
        "glow-gold": "0 0 30px rgba(251, 191, 36, 0.35)",
        card: "0 8px 32px rgba(11, 14, 26, 0.08)",
        "card-dark": "0 8px 32px rgba(0, 0, 0, 0.45)",
      },
      backdropBlur: {
        xs: "2px",
      },
      borderRadius: {
        xl2: "1.25rem",
        "3xl": "1.75rem",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "0.9", transform: "scale(1.05)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 3.5s ease-in-out infinite",
        "slide-up": "slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
