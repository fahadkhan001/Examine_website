import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { HeaderReport } from "@/lib/audit/headers";
import type { AuditMetrics, CategoryScore, Finding, Grade, PageRow } from "@/lib/audit/types";

export const audits = pgTable(
  "audits",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    finalUrl: text("final_url"),
    host: text("host").notNull(),
    pageTitle: text("page_title"),
    status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    total: integer("total").notNull().default(0),
    score: integer("score"),
    grade: text("grade").$type<Grade>(),
    categoryScores: jsonb("category_scores").$type<CategoryScore[]>(),
    findings: jsonb("findings").$type<Finding[]>().notNull().default([]),
    pages: jsonb("pages").$type<PageRow[]>().notNull().default([]),
    speedNote: text("speed_note"),
    metrics: jsonb("metrics").$type<AuditMetrics>(),
    headers: jsonb("headers").$type<HeaderReport>(),
    error: text("error"),
    durationMs: integer("duration_ms"),
    monitorId: text("monitor_id"),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("audits_url_created_idx").on(t.url, t.createdAt),
    index("audits_ip_created_idx").on(t.ipHash, t.createdAt),
    index("audits_monitor_idx").on(t.monitorId, t.createdAt),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    company: text("company"),
    auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
    consentMarketing: boolean("consent_marketing").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("leads_email_audit_uq").on(t.email, t.auditId), index("leads_created_idx").on(t.createdAt)],
);

export const monitors = pgTable(
  "monitors",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    url: text("url").notNull(),
    frequency: text("frequency", { enum: ["daily", "weekly"] }).notNull().default("weekly"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    lastAuditId: text("last_audit_id"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("monitors_email_url_uq").on(t.email, t.url), index("monitors_due_idx").on(t.active, t.nextRunAt)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id").notNull().references(() => monitors.id, { onDelete: "cascade" }),
    auditId: text("audit_id").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alerts_monitor_idx").on(t.monitorId, t.sentAt)],
);

export type AuditRow = typeof audits.$inferSelect;
export type LeadRow = typeof leads.$inferSelect;
export type MonitorRow = typeof monitors.$inferSelect;
