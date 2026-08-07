import { VLiteLogo } from "./VLiteLogo";
import { VLiteWordmark } from "./VLiteWordmark";

export function SplashScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4">
        <VLiteLogo size={72} withHalo />
        <VLiteWordmark size="text-2xl" />
        <div className="flex gap-1.5 mt-1" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-vlite-gradient animate-pulse-glow"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
