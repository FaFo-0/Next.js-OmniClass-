import { ImageResponse } from "next/og";

export const alt = "Omnica English — индивидуальные уроки английского онлайн";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const markUrl = new URL(
    "/brand/tenant/logo-yellow.svg",
    process.env.NEXT_PUBLIC_APP_URL ?? "https://next-js-omni-class.vercel.app",
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
          <div style={{ marginTop: 34, fontSize: 68, lineHeight: 1.04, fontWeight: 900, letterSpacing: "-3px" }}>Говорите по-английски увереннее</div>
          <div style={{ marginTop: 30, fontSize: 30, lineHeight: 1.35 }}>Индивидуальные онлайн-уроки · понятный прогресс · цены в тенге</div>
        </div>
        {/* The source is the app's bundled, authoritative Omnica mark. */}
        <img src={markUrl} alt="" width="260" height="260" style={{ borderRadius: 56 }} />
      </div>
    ),
    size,
  );
}
