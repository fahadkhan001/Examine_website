/**
 * Run an audit from the terminal without the web app or a database.
 *   npm run audit -- example.com
 *   npm run audit -- example.com --json
 */
import { normalizeInputUrl } from "@/lib/audit/safe-fetch";
import { runAudit } from "@/lib/audit/runner";
import { CATEGORY_META } from "@/lib/audit/types";

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("Usage: npm run audit -- <url> [--json]");
  process.exit(1);
}

const icon = { pass: "✓", warn: "!", fail: "✗", info: "·" } as const;

const result = await runAudit(normalizeInputUrl(target), {
  onProgress: (done, total, f) => {
    if (!args.includes("--json")) process.stderr.write(`\r${done}/${total} ${f.title.padEnd(48).slice(0, 48)}`);
  },
});

if (args.includes("--json")) {
  console.log(JSON.stringify(result, null, 2));
} else {
  process.stderr.write("\n\n");
  console.log(`${result.finalUrl}  →  ${result.score}/100  grade ${result.grade}  (${(result.durationMs / 1000).toFixed(1)}s)\n`);
  for (const c of result.categoryScores) {
    console.log(`  ${CATEGORY_META[c.category].label.padEnd(20)} ${c.score ?? "–"}`);
    for (const f of result.findings.filter((x) => x.category === c.category)) {
      console.log(`    ${icon[f.status]} [${f.status === "pass" ? "    " : f.severity.slice(0, 4)}] ${f.title}: ${f.summary}`);
    }
  }
}
