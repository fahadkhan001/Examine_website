import type { CheckDef } from "../types";
import { list } from "../util";

export const accessibilityChecks: CheckDef[] = [
  {
    id: "psi-a11y",
    category: "accessibility",
    title: "Lighthouse accessibility score",
    severity: "medium",
    weight: 4,
    whyItMatters:
      "About 1 in 6 people live with a disability. Accessible sites reach more customers, rank better and reduce legal risk.",
    howToFix: "Fix the failing audits listed in the evidence, starting with contrast and missing labels.",
    async run(ctx) {
      const psi = await ctx.psi();
      const run = psi.mobile ?? psi.desktop;
      if (!run || run.accessibility === undefined) return { status: "info", summary: psi.error ?? "No Lighthouse accessibility data." };
      const s = run.accessibility;
      const evidence = run.failingA11y.length ? list(run.failingA11y.map((a) => a.title)) : undefined;
      if (s >= 90) return { status: "pass", summary: `${s}/100.`, evidence };
      if (s >= 70) return { status: "warn", summary: `${s}/100.`, evidence };
      return { status: "fail", severity: "high", summary: `${s}/100.`, evidence };
    },
  },
  {
    id: "img-alt",
    category: "accessibility",
    title: "Images have alt text",
    severity: "medium",
    weight: 3,
    whyItMatters: "Screen readers read alt text aloud, and Google Images uses it to understand pictures. Without it, images are invisible to both.",
    howToFix: "Add a short alt describing each meaningful image. Use alt=\"\" for purely decorative images.",
    fixSnippet: `<img src="/bag.webp" alt="Tan leather tote bag with brass buckle">
<img src="/divider.svg" alt="">`,
    async run(ctx) {
      const { $: page } = await ctx.content();
      const imgs = page("img");
      if (!imgs.length) return { status: "pass", summary: "No <img> elements." };
      const missing = imgs.filter((_, el) => page(el).attr("alt") === undefined).map((_, el) => page(el).attr("src") ?? "(no src)").get();
      if (!missing.length) return { status: "pass", summary: `All ${imgs.length} images have alt attributes.` };
      const ratio = missing.length / imgs.length;
      return {
        status: ratio > 0.3 ? "fail" : "warn",
        summary: `${missing.length} of ${imgs.length} images have no alt attribute.`,
        evidence: list(missing),
      };
    },
  },
  {
    id: "form-labels",
    category: "accessibility",
    title: "Form fields have labels",
    severity: "medium",
    weight: 2,
    whyItMatters: "Without labels, screen-reader users cannot tell what to type, and everyone loses the label when the placeholder disappears.",
    howToFix: "Pair each input with a <label for=\"id\">, or use aria-label when a visible label is not possible.",
    fixSnippet: `<label for="email">Email</label>
<input id="email" type="email" name="email" autocomplete="email">`,
    async run(ctx) {
      const { $: page } = await ctx.content();
      const $ = page;
      const fields = $("input, select, textarea").filter((_, el) => {
        const t = ($(el).attr("type") ?? "").toLowerCase();
        return !["hidden", "submit", "button", "reset", "image"].includes(t);
      });
      if (!fields.length) return { status: "pass", summary: "No form fields on the homepage." };
      const unlabeled = fields
        .filter((_, el) => {
          const e = $(el);
          const id = e.attr("id");
          if (e.attr("aria-label") || e.attr("aria-labelledby") || e.attr("title")) return false;
          if (id && $(`label[for="${id.replace(/"/g, '\\"')}"]`).length) return false;
          if (e.closest("label").length) return false;
          return true;
        })
        .map((_, el) => `<${el.tagName} name="${$(el).attr("name") ?? ""}" placeholder="${$(el).attr("placeholder") ?? ""}">`)
        .get();
      if (!unlabeled.length) return { status: "pass", summary: `All ${fields.length} form fields are labeled.` };
      return { status: "fail", summary: `${unlabeled.length} of ${fields.length} form fields have no label.`, evidence: list(unlabeled) };
    },
  },
  {
    id: "link-names",
    category: "accessibility",
    title: "Links and buttons have names",
    severity: "medium",
    weight: 2,
    whyItMatters: "Icon-only links and buttons are announced as just \"link\" or \"button\" to screen-reader users.",
    howToFix: "Add visible text, or aria-label on icon-only links and buttons.",
    fixSnippet: `<a href="https://instagram.com/brand" aria-label="Instagram"><svg …></svg></a>`,
    async run(ctx) {
      const { $: page } = await ctx.content();
      const $ = page;
      const empty = $("a[href], button")
        .filter((_, el) => {
          const e = $(el);
          if (e.text().trim()) return false;
          if (e.attr("aria-label") || e.attr("aria-labelledby") || e.attr("title")) return false;
          if (e.find("img[alt]").filter((_, i) => !!$(i).attr("alt")?.trim()).length) return false;
          if (e.find("[aria-label]").length) return false;
          return true;
        })
        .map((_, el) => (el.tagName === "a" ? `<a href="${$(el).attr("href")}">` : "<button>"))
        .get();
      if (!empty.length) return { status: "pass", summary: "All links and buttons have accessible names." };
      return { status: empty.length > 5 ? "fail" : "warn", summary: `${empty.length} link(s)/button(s) have no accessible name.`, evidence: list(empty) };
    },
  },
  {
    id: "html-lang",
    category: "accessibility",
    title: "Page language declared",
    severity: "low",
    weight: 1,
    whyItMatters: "The lang attribute makes screen readers use the right pronunciation and helps search engines serve the right audience.",
    howToFix: "Set lang on the <html> element.",
    fixSnippet: `<html lang="en">`,
    run(ctx) {
      const lang = ctx.$("html").attr("lang");
      return lang ? { status: "pass", summary: `lang="${lang}"` } : { status: "fail", summary: "<html> has no lang attribute." };
    },
  },
  {
    id: "viewport",
    category: "accessibility",
    title: "Mobile viewport and zoom",
    severity: "high",
    weight: 2,
    whyItMatters: "Without a viewport tag, phones show a tiny desktop page. Disabling zoom blocks people with low vision from enlarging text.",
    howToFix: "Use the standard viewport tag and do not set maximum-scale=1 or user-scalable=no.",
    fixSnippet: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    run(ctx) {
      const v = ctx.$('meta[name="viewport"]').attr("content");
      if (!v) return { status: "fail", summary: "No viewport meta tag; the page is not mobile-friendly." };
      if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(v)) {
        return { status: "warn", severity: "medium", summary: "Viewport disables pinch zoom.", evidence: v };
      }
      return { status: "pass", summary: "Responsive viewport, zoom allowed.", evidence: v };
    },
  },
];
