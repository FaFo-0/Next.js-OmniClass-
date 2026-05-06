"use client";

import { useBrand } from "@/lib/brand/provider";
import { OmnicaMark } from "@/components/brand/OmnicaMark";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "tenant" | "software";
}

const SIZES = {
  sm: { mark: 28, name: 14, sub: 10 },
  md: { mark: 34, name: 17, sub: 11 },
  lg: { mark: 56, name: 26, sub: 14 },
};

function splitTenantName(name: string): { head: string; tail: string } | null {
  const trimmed = name.trim();
  const idx = trimmed.indexOf(" ");
  if (idx < 0) return null;
  return {
    head: trimmed.slice(0, idx),
    tail: trimmed.slice(idx + 1).toLowerCase(),
  };
}

export function Logo({
  size = "md",
  showText = true,
  variant = "tenant",
}: LogoProps) {
  const sz = SIZES[size];
  const { tenantBrand, softwareBrand, primaryColor } = useBrand();
  const isTenant = variant === "tenant";
  const fullName = isTenant ? tenantBrand.name : softwareBrand.name;
  const purple = primaryColor || "#6716A4";
  const parts = isTenant ? splitTenantName(fullName) : null;

  return (
    <span className="flex items-center gap-2.5">
      <OmnicaMark size={sz.mark} ringColor={purple} lensColor="#FFCA00" />
      {showText && (
        <span className="flex flex-col leading-none">
          {parts ? (
            <>
              <span
                style={{
                  fontFamily: 'Georgia, "Plantagenet Cherokee", serif',
                  fontSize: sz.name,
                  fontWeight: 700,
                  color: purple,
                  letterSpacing: "-0.01em",
                }}
              >
                {parts.head}
              </span>
              <span
                style={{
                  fontFamily: 'Georgia, "Plantagenet Cherokee", serif',
                  fontSize: sz.sub,
                  color: purple,
                  opacity: 0.7,
                  letterSpacing: "0.02em",
                  marginTop: 2,
                }}
              >
                .{parts.tail}
              </span>
            </>
          ) : (
            <span
              style={{
                fontFamily: 'Georgia, "Plantagenet Cherokee", serif',
                fontSize: sz.name,
                fontWeight: 700,
                color: purple,
                letterSpacing: "-0.01em",
              }}
            >
              {fullName}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
