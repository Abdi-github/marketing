/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependencies are not allowed.",
      from: {},
      to: { circular: true },
    },
    {
      name: "shared-no-cross-module-imports",
      severity: "error",
      comment: "shared must not import from any other module package.",
      from: { path: "^packages/shared" },
      to: { path: "^packages/(?!(shared))" },
    },
    {
      name: "auth-only-depends-on-shared",
      severity: "error",
      comment: "auth must only depend on shared (enforces the DAG root).",
      from: { path: "^packages/auth" },
      to: {
        path: "^packages/(?!(auth|shared))",
      },
    },
    {
      name: "tenancy-allowed-deps",
      severity: "error",
      comment: "tenancy may only depend on auth and shared.",
      from: { path: "^packages/tenancy" },
      to: {
        path: "^packages/(?!(tenancy|auth|shared))",
      },
    },
    {
      name: "billing-allowed-deps",
      severity: "error",
      comment: "billing may only depend on tenancy and shared.",
      from: { path: "^packages/billing" },
      to: {
        path: "^packages/(?!(billing|tenancy|shared))",
      },
    },
    {
      name: "ai-router-allowed-deps",
      severity: "error",
      comment: "ai-router may only depend on tenancy and shared.",
      from: { path: "^packages/ai-router" },
      to: {
        path: "^packages/(?!(ai-router|tenancy|shared))",
      },
    },
    {
      name: "leads-allowed-deps",
      severity: "error",
      comment: "leads may only depend on tenancy and shared.",
      from: { path: "^packages/leads" },
      to: {
        path: "^packages/(?!(leads|tenancy|shared))",
      },
    },
    {
      name: "crm-allowed-deps",
      severity: "error",
      comment: "crm may only depend on leads, tenancy, and shared.",
      from: { path: "^packages/crm" },
      to: {
        path: "^packages/(?!(crm|leads|tenancy|shared))",
      },
    },
    {
      name: "integrations-allowed-deps",
      severity: "error",
      comment: "integrations may only depend on tenancy and shared.",
      from: { path: "^packages/integrations" },
      to: {
        path: "^packages/(?!(integrations|tenancy|shared))",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    tsPreCompilationDeps: true,
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
