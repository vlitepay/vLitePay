import Image from "next/image";
import clsx from "clsx";

/**
 * The new circular premium brand mark (white disc, V + gold star) at
 * public/brand/vlitepay-mark.png. Circle only — no rounded-square frame.
 *
 * Deliberately separate from VLiteLogo.tsx (the old rounded-square /logo.png
 * mark), which stays untouched and keeps serving every other screen that
 * still renders it (AvatarUpload, WalletConnectButton, SplashScreen,
 * RatingModal, DepositPanel) — this component is used only by Header and
 * ConnectScreen for the current brand-refresh scope.
 */
export function BrandMark({
  size = 34,
  withHalo = false,
  className,
}: {
  size?: number;
  withHalo?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      {withHalo && <span className="vlite-halo rounded-full" aria-hidden />}
      <Image
        src="/brand/vlitepay-mark.png"
        alt="vʟitePay"
        width={size}
        height={size}
        className="relative rounded-full"
        priority
      />
    </div>
  );
}
