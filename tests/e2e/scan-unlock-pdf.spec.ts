import { expect, test } from "@playwright/test";

// Scans a real public site, so it needs network access.
test("scan → locked report → unlock → PDF", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Website address").first().fill("example.com");
  await page.getByRole("button", { name: "Examine" }).first().click();

  await expect(page).toHaveURL(/\/r\/[\w-]+$/);
  await expect(page.getByRole("heading", { name: "example.com" })).toBeVisible();

  // Report finishes and is locked: details are not in the API payload.
  await expect(page.getByText(/See all \d+ issues/)).toBeVisible({ timeout: 90_000 });
  const id = page.url().split("/r/")[1];
  const locked = await (await page.request.get(`/api/audits/${id}`)).json();
  expect(locked.unlocked).toBe(false);
  expect(locked.findings.every((f: object) => !("howToFix" in f))).toBe(true);

  await page.locator("#unlock-email").fill("e2e@example.com");
  await page.locator("#unlock button[type=submit]").click();
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();

  const pdf = await page.request.get(`/api/audits/${id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
});

test("rejects private targets", async ({ request }) => {
  const res = await request.post("/api/audits", { data: { url: "http://169.254.169.254/" } });
  expect(res.status()).toBe(400);
});
