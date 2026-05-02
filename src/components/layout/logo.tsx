"use client";

import Image from "next/image";
import { useBrand } from "@/lib/brand/provider";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  variant?: "tenant" | "software";
}

const sizes = {
  sm: { img: 28, text: "text-base" },
  md: { img: 32, text: "text-lg" },
  lg: { img: 56, text: "text-2xl" },
};

export function Logo({ size = "md", showText = true, variant = "tenant" }: LogoProps) {
  const { img, text } = sizes[size];
  const { tenantBrand, softwareBrand } = useBrand();

  const brand = variant === "software" ? softwareBrand : tenantBrand;
  const name = brand.name;
  const lightSrc =
    variant === "software"
      ? "/brand/lingulab/logo.svg"
      : tenantBrand.logoUrl ?? "/brand/tenant/logo.svg";
  const darkSrc =
    variant === "software"
      ? "/brand/lingulab/logo-dark.svg"
      : tenantBrand.logoDarkUrl ?? "/brand/tenant/logo-dark.svg";

  return (
    <span className="flex items-center gap-2">
      <Image
        src={lightSrc}
        alt={name}
        width={img}
        height={img}
        className="block dark:hidden"
        priority
      />
      <Image
        src={darkSrc}
        alt={name}
        width={img}
        height={img}
        className="hidden dark:block"
        priority
      />
      {showText && <span className={`${text} font-bold`}>{name}</span>}
    </span>
  );
}
