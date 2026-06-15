export const META_GRAPH_VERSION = "v21.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

// Instagram publishing requires a separate app review process.
// For now we only request Facebook Page scopes, which work in dev mode immediately.
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
