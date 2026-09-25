"use client";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

function initialsFor(name: string | null | undefined): string {
  const initials = (name ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || "?";
}

export function ProfileAvatar({
  name,
  imageUrl,
  size = "lg",
  className,
}: {
  name?: string | null;
  imageUrl?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {imageUrl && <AvatarImage src={imageUrl} alt={`${name ?? "Profile"} profile photo`} />}
      <AvatarFallback>{initialsFor(name)}</AvatarFallback>
    </Avatar>
  );
}
