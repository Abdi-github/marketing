import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const segments = pgTable(
  "segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    /** AND/OR rule tree — see SegmentRule type below. */
    ruleJson: jsonb("rule_json")
      .notNull()
      .$default(() => ({ op: "and", children: [] })),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("segments_tenant_idx").on(t.tenantId)],
);

export type Segment = typeof segments.$inferSelect;

// ─── Rule type system ─────────────────────────────────────────────────────────
// Flat leaf rules only at MVP (no nested groups). The top-level op (and/or)
// applies across all children. Step-29+ can extend to recursive nesting.

export type SegmentField = "lifecycle_stage" | "lead_score" | "tags" | "source" | "email";
export type SegmentOp = "eq" | "neq" | "gte" | "lte" | "contains" | "not_contains";

export type SegmentLeafRule = {
  field: SegmentField;
  op: SegmentOp;
  value: string;
};

export type SegmentGroupRule = {
  op: "and" | "or";
  children: SegmentLeafRule[];
};

export type SegmentRule = SegmentGroupRule;
