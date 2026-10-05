const DEFAULT_PUBLIC_TENANT_LOGO = "/brand/tenant/logo.svg";
const DEFAULT_PUBLIC_TENANT_LOCKUP = "/brand/tenant/lockup-light.svg";

export function TenantPublicLogo({
  logoUrl,
  name,
  size,
  className,
}: {
  logoUrl?: string | null;
  name: string;
  size: number;
  className?: string;
}) {
  // Public settings contain the seeded mark URL even when no upload exists.
  // An actual uploaded/custom URL always wins over the bundled wordmark.
  const customLogo = logoUrl && logoUrl !== DEFAULT_PUBLIC_TENANT_LOGO ? logoUrl : null;
  if (!customLogo && name !== "Omnica English") {
    return <span className="min-w-0 truncate">{name}</span>;
  }

  const isLockup = !customLogo;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={customLogo || DEFAULT_PUBLIC_TENANT_LOCKUP}
        alt={isLockup ? name : `${name} logo`}
        width={isLockup ? Math.round(size * (2543 / 900)) : size}
        height={size}
        className={className}
        style={{ width: isLockup ? Math.round(size * (2543 / 900)) : size, height: size, maxWidth: "100%", flexShrink: 1, objectFit: "contain" }}
      />
      {customLogo && <span className="min-w-0 truncate">{name}</span>}
    </span>
  );
}
