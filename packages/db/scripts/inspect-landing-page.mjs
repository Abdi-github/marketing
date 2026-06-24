import postgres from "postgres";

const [tenantSlug, pageSlug] = process.argv.slice(2);
if (!tenantSlug || !pageSlug) {
  throw new Error("Usage: node scripts/inspect-landing-page.mjs <tenant-slug> <page-slug>");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const rows = await sql`
    SELECT
      t.id,
      t.name,
      t.slug,
      b.business_name,
      b.vertical,
      b.address_street,
      b.address_postal_code,
      b.address_city,
      lp.id AS page_id,
      lp.slug AS page_slug,
      lp.current_version_id,
      lp.published_version_id,
      lpv.composition
    FROM tenants t
    LEFT JOIN business_profiles b ON b.tenant_id = t.id
    LEFT JOIN landing_pages lp ON lp.tenant_id = t.id AND lp.slug = ${pageSlug}
    LEFT JOIN landing_page_versions lpv ON lpv.id = lp.published_version_id
    WHERE t.slug = ${tenantSlug}
  `;
  console.log(
    JSON.stringify(
      rows.map((row) => ({
        ...row,
        composition: row.composition
          ? {
              title: row.composition.title,
              sections: row.composition.sections?.map((section) => ({
                order: section.order,
                type: section.type,
                heading: section.heading,
                variant: section.variant,
              })),
              pages: row.composition.site?.pages?.map((page) => ({
                slug: page.slug,
                sections: page.sections?.map((section) => section.type),
              })),
            }
          : null,
      })),
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
