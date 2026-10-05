"use client";

import { useBrand } from "@/lib/brand/provider";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "tenant" | "software";
}

const HEIGHTS = { sm: 28, md: 42, lg: 64 };

export function Logo({ size = "md", showText = true, variant = "tenant" }: LogoProps) {
  const { tenantBrand, softwareBrand, primaryColor, isLoading } = useBrand();
  const name = variant === "tenant" ? tenantBrand.name : softwareBrand.name;
  const height = HEIGHTS[size];
  const isOmnicaDefault = variant === "tenant" && name === "Omnica English" && !tenantBrand.logoStorageId;
  const uploadedLogo =
    variant === "tenant" && tenantBrand.logoStorageId
      ? tenantBrand.logoUrl
      : undefined;

  if (variant === "tenant" && isLoading) {
    return (
      <span
        className="inline-block animate-pulse rounded-md bg-muted"
        style={{ width: showText ? Math.round(height * (2543 / 804)) : height, height, flexShrink: 0 }}
        aria-hidden="true"
      />
    );
  }

  if (isOmnicaDefault) {
    const src = showText ? "/brand/tenant/lockup-light.svg" : "/brand/tenant/logo.svg";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={showText ? name : `${name} logo`} width={showText ? Math.round(height * (2543 / 804)) : height} height={height} style={{ width: showText ? Math.round(height * (2543 / 804)) : height, height, objectFit: "contain", flexShrink: 0 }} />
    );
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-2 font-bold" style={{ color: primaryColor }}>
      {uploadedLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uploadedLogo} alt="" width={height} height={height} style={{ width: height, height, flexShrink: 0, objectFit: "contain" }} />
      )}
      {showText && <span className="truncate" style={{ fontSize: size === "lg" ? 24 : size === "md" ? 17 : 14 }}>{name}</span>}
      {!showText && !uploadedLogo && <span aria-label={name} className="grid rounded-md text-white" style={{ width: height, height, placeItems: "center", background: primaryColor }}>{name.charAt(0)}</span>}
    </span>
  );
}
