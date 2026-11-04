import { ImageResponse } from "next/og";
import { PUBLIC_SHARE_CARD } from "@/lib/publicShareCard";

export const alt = PUBLIC_SHARE_CARD.imageAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const markUrl = new URL(
    "/brand/tenant/logo-yellow.svg",
    process.env.NEXT_PUBLIC_APP_URL ?? "https://omnicaenglish.com",
  ).toString();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "72px 86px",
          background: "#6716A4",
          color: "#FFF9ED",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 780 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#FFCA00" }}>OMNICA ENGLISH</div>
          <div style={{ marginTop: 34, fontSize: 84, lineHeight: 1.03, fontWeight: 900, letterSpacing: "-3px" }}>Speak English with confidence.</div>
        </div>
        {/* The source is the app's bundled, authoritative Omnica mark. */}
        <img src={markUrl} alt="" width="260" height="260" />
      </div>
    ),
    size,
  );
}
