"use client";

// One card for the teacher and student library grids. Everything an admin can
// set on a material shows up here — cover, kind, level, description, reading
// time, topics, source — so nothing an admin fills in dead-ends unseen.

import Link from "next/link";
import { Icon } from "@/components/shared/icons";

export interface LibraryMaterialCard {
  _id: string;
  title: string;
  kind?: string;
  levelCEFR?: string | null;
  description?: string | null;
  topicTags?: string[];
  estimatedReadMinutes?: number | null;
  sourceUrl?: string | null;
  coverImageUrl?: string | null;
}

export function MaterialCard({
  material: b,
  href,
}: {
  material: LibraryMaterialCard;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="card"
      style={{
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.12s, box-shadow 0.12s",
        textDecoration: "none",
        color: "inherit",
        display: "block",
      }}
    >
      <div
        style={{
          height: 160,
          // A cover replaces the brand gradient; the scrim keeps the title
          // readable over a photo of any brightness.
          background: b.coverImageUrl
            ? `linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.62) 100%), url(${b.coverImageUrl}) center/cover no-repeat`
            : "linear-gradient(135deg, var(--brand-purple), var(--brand-purple-hover))",
          display: "flex",
          alignItems: "flex-end",
          padding: 14,
          color: "white",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", top: 12, insetInlineEnd: 12 }}>
          {b.levelCEFR && (
            <span
              className="pill"
              style={{ background: "rgba(255,255,255,0.25)", color: "white", fontSize: 10, fontWeight: 700 }}
            >
              {b.levelCEFR}
            </span>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, opacity: 0.85, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
            {b.kind ?? "Article"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 4, lineHeight: 1.3 }}>{b.title}</div>
        </div>
      </div>
      <div style={{ padding: 14 }}>
        {b.description && <div className="body-sm" style={{ marginBottom: 8 }}>{b.description}</div>}
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--omnic-gray-500)", flexWrap: "wrap" }}>
          {b.estimatedReadMinutes ? (
            <span><Icon name="clock" size={11} /> {b.estimatedReadMinutes} min</span>
          ) : null}
          {b.sourceUrl ? (
            <span><Icon name="external" size={11} /> Source</span>
          ) : null}
        </div>
        {b.topicTags && b.topicTags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {b.topicTags.map((tag) => (
              <span key={tag} className="pill pill-new" style={{ fontSize: 10 }}>{tag}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
