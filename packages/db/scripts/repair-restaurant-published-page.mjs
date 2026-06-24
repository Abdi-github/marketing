import postgres from "postgres";

const [tenantSlug, pageSlug] = process.argv.slice(2);
if (!tenantSlug || !pageSlug) {
  throw new Error(
    "Usage: node scripts/repair-restaurant-published-page.mjs <tenant-slug> <page-slug>",
  );
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

function repairComposition(composition, address) {
  const city = address.split(",").at(-2)?.trim() || "Neuchatel";
  const replaceLegacyLocation = (value) =>
    typeof value === "string" ? value.replaceAll("Le Locle", city) : value;
  const repairSection = (section) => {
    const repaired = {
      ...section,
      heading: replaceLegacyLocation(section?.heading),
      body: replaceLegacyLocation(section?.body),
    };
    if (section?.type !== "contact") return repaired;
    const extras = { ...(section.extras ?? {}) };
    delete extras.mapEmbedUrl;
    extras.address = address;
    return { ...repaired, extras };
  };
  const site = composition.site
    ? {
        ...composition.site,
        nav: composition.site.nav
          ? {
              ...composition.site.nav,
              cta: {
                ...(composition.site.nav.cta ?? { pageSlug: "contact" }),
                label: "Reserve a table",
              },
            }
          : composition.site.nav,
        pages: composition.site.pages?.map((page) => ({
          ...page,
          sections: page.sections.map(repairSection),
        })),
      }
    : composition.site;
  return {
    ...composition,
    sections: composition.sections.map(repairSection),
    site,
  };
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const result = await sql.begin(async (tx) => {
    const [row] = await tx`
      SELECT
        lp.id AS page_id,
        lp.tenant_id,
        lp.published_version_id,
        bp.address_street,
        bp.address_postal_code,
        bp.address_city,
        bp.address_country,
        lpv.composition
      FROM landing_pages lp
      JOIN tenants t ON t.id = lp.tenant_id
      JOIN business_profiles bp ON bp.tenant_id = lp.tenant_id
      JOIN landing_page_versions lpv ON lpv.id = lp.published_version_id
      WHERE t.slug = ${tenantSlug} AND lp.slug = ${pageSlug}
      FOR UPDATE OF lp
    `;
    if (!row) throw new Error("Published restaurant page was not found.");

    const cityLine = [row.address_postal_code, row.address_city].filter(Boolean).join(" ");
    const country = row.address_country === "CH" ? "Switzerland" : row.address_country;
    const address =
      [row.address_street, cityLine, country].filter(Boolean).join(", ") ||
      "Neuchatel, Switzerland";
    const [{ next_version }] = await tx`
      SELECT COALESCE(MAX(version), 0) + 1 AS next_version
      FROM landing_page_versions
      WHERE landing_page_id = ${row.page_id}
    `;
    const [version] = await tx`
      INSERT INTO landing_page_versions (
        landing_page_id,
        tenant_id,
        version,
        composition
      )
      VALUES (
        ${row.page_id},
        ${row.tenant_id},
        ${Number(next_version)},
        ${tx.json(repairComposition(row.composition, address))}
      )
      RETURNING id, version
    `;
    await tx`
      UPDATE landing_pages
      SET
        current_version_id = ${version.id},
        published_version_id = ${version.id},
        updated_at = now()
      WHERE id = ${row.page_id} AND tenant_id = ${row.tenant_id}
    `;
    return { pageId: row.page_id, versionId: version.id, version: version.version, address };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end();
}
