const DEFAULT_PUBLIC_TENANT_LOGO = "/brand/tenant/logo.svg";

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
  return (
    // A stored tenant upload remains authoritative; the bundled fallback is
    // the exact Omnica English source artwork supplied for public branding.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl || DEFAULT_PUBLIC_TENANT_LOGO}
      alt={`${name} logo`}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, flexShrink: 0, objectFit: "contain" }}
    />
  );
}
