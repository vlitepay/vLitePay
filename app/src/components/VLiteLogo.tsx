import Image from "next/image";
import clsx from "clsx";

export function VLiteLogo({
  size = 40,
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
        src="/logo.png"
        alt="vLitePay"
        width={size}
        height={size}
        className="relative rounded-2xl"
        priority
      />
    </div>
  );
}
