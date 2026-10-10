import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/r/", "/admin", "/api/", "/monitors/", "/unsubscribe"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
