import type { CheckDef } from "../types";
import { accessibilityChecks } from "./accessibility";
import { exposureChecks } from "./exposure";
import { performanceChecks } from "./performance";
import { securityChecks } from "./security";
import { seoChecks } from "./seo";
import { sslChecks } from "./ssl";

export const ALL_CHECKS: CheckDef[] = [
  ...securityChecks,
  ...exposureChecks,
  ...sslChecks,
  ...seoChecks,
  ...performanceChecks,
  ...accessibilityChecks,
];

export const CHECK_BY_ID = new Map(ALL_CHECKS.map((c) => [c.id, c]));
