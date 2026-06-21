import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  tenants,
  featureFlags,
  crmTasks,
  emailSuppressions,
  emailPreferences,
  emailSendingDomains,
  leads,
  mediaAssets,
  messages,
} from "../schema";

describe("db schema", () => {
  it("tenants table has required columns", () => {
    const cols = Object.keys(tenants);
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("slug");
    expect(cols).toContain("plan");
    expect(cols).toContain("status");
  });

  it("featureFlags table has required columns", () => {
    const cols = Object.keys(featureFlags);
    expect(cols).toContain("key");
    expect(cols).toContain("enabled");
  });

  it("CRM deal tables have tenant RLS policies", () => {
    const migration = readFileSync(
      new URL("../../migrations/0032_crm_safety_hardening.sql", import.meta.url),
      "utf8",
    );

    for (const table of ["deal_stages", "deals", "deal_activities"]) {
      expect(migration).toContain(`CREATE POLICY ${table}_tenant_isolation`);
      expect(migration).toContain("current_setting('app.tenant_id', TRUE)::uuid");
      expect(migration).toMatch(
        new RegExp(`CREATE POLICY ${table}_tenant_isolation[\\s\\S]+WITH CHECK`),
      );
    }
  });

  it("CRM tasks table has required tenant-aware columns", () => {
    const cols = Object.keys(crmTasks);
    expect(cols).toContain("id");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("contactId");
    expect(cols).toContain("title");
    expect(cols).toContain("status");
    expect(cols).toContain("priority");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("CRM tasks migration has tenant RLS policy", () => {
    const migration = readFileSync(
      new URL("../../migrations/0033_crm_tasks.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE crm_tasks");
    expect(migration).toContain("tenant_id");
    expect(migration).toContain("ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE POLICY crm_tasks_tenant_isolation");
    expect(migration).toContain("current_setting('app.tenant_id', TRUE)::uuid");
    expect(migration).toMatch(/CREATE POLICY crm_tasks_tenant_isolation[\s\S]+WITH CHECK/);
  });

  it("email suppressions table has required tenant-aware columns", () => {
    const cols = Object.keys(emailSuppressions);
    expect(cols).toContain("id");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("contactId");
    expect(cols).toContain("email");
    expect(cols).toContain("reason");
    expect(cols).toContain("source");
    expect(cols).toContain("suppressedAt");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("email suppressions migration has tenant RLS policy", () => {
    const migration = readFileSync(
      new URL("../../migrations/0034_email_suppressions.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE email_suppressions");
    expect(migration).toContain("tenant_id");
    expect(migration).toContain("ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("CREATE POLICY email_suppressions_tenant_isolation");
    expect(migration).toContain("current_setting('app.tenant_id', TRUE)::uuid");
    expect(migration).toMatch(/CREATE POLICY email_suppressions_tenant_isolation[\s\S]+WITH CHECK/);
  });

  it("email preferences table has required tenant-aware columns", () => {
    const cols = Object.keys(emailPreferences);
    expect(cols).toContain("id");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("contactId");
    expect(cols).toContain("email");
    expect(cols).toContain("marketingOptIn");
    expect(cols).toContain("source");
    expect(cols).toContain("updatedFromIp");
    expect(cols).toContain("updatedFromUserAgent");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("email sending domains table has required tenant-aware columns", () => {
    const cols = Object.keys(emailSendingDomains);
    expect(cols).toContain("id");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("domain");
    expect(cols).toContain("status");
    expect(cols).toContain("verifyToken");
    expect(cols).toContain("fromName");
    expect(cols).toContain("fromLocalPart");
    expect(cols).toContain("isPrimary");
    expect(cols).toContain("verifiedAt");
    expect(cols).toContain("lastDnsCheckAt");
    expect(cols).toContain("lastDnsCheckError");
  });

  it("email preferences and sending domains migration has tenant RLS policies", () => {
    const migration = readFileSync(
      new URL("../../migrations/0035_email_preferences_and_sending_domains.sql", import.meta.url),
      "utf8",
    );

    for (const table of ["email_preferences", "email_sending_domains"]) {
      expect(migration).toContain(`CREATE TABLE ${table}`);
      expect(migration).toContain("tenant_id");
      expect(migration).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`CREATE POLICY ${table}_tenant_isolation`);
      expect(migration).toContain("current_setting('app.tenant_id', TRUE)::uuid");
      expect(migration).toMatch(
        new RegExp(`CREATE POLICY ${table}_tenant_isolation[\\s\\S]+WITH CHECK`),
      );
    }
  });

  it("media assets table has required tenant-aware columns", () => {
    const cols = Object.keys(mediaAssets);
    expect(cols).toContain("id");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("bucket");
    expect(cols).toContain("objectKey");
    expect(cols).toContain("contentType");
    expect(cols).toContain("byteSize");
    expect(cols).toContain("scope");
    expect(cols).toContain("visibility");
    expect(cols).toContain("status");
    expect(cols).toContain("createdAt");
    expect(cols).toContain("updatedAt");
  });

  it("media assets migration has tenant RLS policy", () => {
    const migration = readFileSync(
      new URL("../../migrations/0037_media_assets.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "media_assets"');
    expect(migration).toContain('"tenant_id"');
    expect(migration).toContain('ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY "media_assets_tenant_isolation"');
    expect(migration).toContain("current_setting('app.current_tenant_id', true)::uuid");
    expect(migration).toMatch(/CREATE POLICY "media_assets_tenant_isolation"[\s\S]+WITH CHECK/);
  });

  it("messages schema exposes WhatsApp automation metadata columns", () => {
    const cols = Object.keys(messages);
    expect(cols).toContain("messageType");
    expect(cols).toContain("meta");
    expect(cols).toContain("policyState");
    expect(cols).toContain("errorMessage");
  });

  it("leads schema exposes workflow metadata columns", () => {
    const cols = Object.keys(leads);
    expect(cols).toContain("workflowKind");
    expect(cols).toContain("workflowState");
    expect(cols).toContain("sourceChannel");
    expect(cols).toContain("structuredData");
    expect(cols).toContain("lastAutomationAt");
  });

  it("WhatsApp automation migration adds message, task, and lead metadata columns", () => {
    const migration = readFileSync(
      new URL("../../migrations/0041_whatsapp_automation_foundations.sql", import.meta.url),
      "utf8",
    );

    expect(migration).toContain("ALTER TABLE messages");
    expect(migration).toContain("message_type");
    expect(migration).toContain("ALTER TABLE crm_tasks");
    expect(migration).toContain("meta jsonb");
    expect(migration).toContain("ALTER TABLE leads");
    expect(migration).toContain("workflow_kind");
    expect(migration).toContain("source_channel");
    expect(migration).toContain("structured_data");
  });
});
