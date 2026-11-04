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
          background: "#FFCA00",
          color: "#18181B",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#6716A4" }}>OMNICA ENGLISH</div>
          <div style={{ marginTop: 34, fontSize: 68, lineHeight: 1.04, fontWeight: 900, letterSpacing: "-3px" }}>Speak English with confidence.</div>
          {/* Two explicit lines: the second is short, so letting it wrap ragged reads badly. */}
          <div style={{ marginTop: 30, fontSize: 30, lineHeight: 1.35 }}>One-to-one online lessons · clear progress</div>
          <div style={{ fontSize: 30, lineHeight: 1.35 }}>Prices in tenge</div>
        </div>
        {/* The source is the app's bundled, authoritative Omnica mark. */}
        <img src={markUrl} alt="" width="260" height="260" style={{ borderRadius: 56 }} />
      </div>
    ),
    size,
  );
}
