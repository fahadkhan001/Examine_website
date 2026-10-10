import { ImageResponse } from "next/og";
import { brand } from "@/lib/config";

export const alt = `${brand.name}: ${brand.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0b0d10", color: "#f1f2f3", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 34, fontWeight: 700 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: "#2bd576" }} />
          {brand.name.toLowerCase()}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 64 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.05 }}>Examine any website</div>
            <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, color: "#8b9098" }}>in 30 seconds.</div>
          </div>
          <div style={{ width: 220, height: 220, borderRadius: 110, border: "22px solid #2bd576", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 110, fontWeight: 800, color: "#2bd576" }}>A</div>
        </div>
        <div style={{ fontSize: 28, color: "#8b9098" }}>Security · Exposed files · SSL · SEO · Speed · Accessibility</div>
      </div>
    ),
    size,
  );
}
