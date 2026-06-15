import { META_GRAPH_BASE } from "./config";

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
};

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
};

type PagesResponse = {
  data: MetaPage[];
};

type IgAccountResponse = {
  instagram_business_account?: { id: string };
  id: string;
};

type FbPostResponse = {
  id: string;
};

type IgContainerResponse = {
  id: string;
};

async function graphFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json()) as { error?: { message: string; type: string } } & T;
  if (!res.ok || (json as { error?: { message: string } }).error) {
    const err = (json as { error?: { message: string } }).error;
    throw new Error(`Meta API error: ${err?.message ?? res.statusText}`);
  }
  return json as T;
}

async function graphPost<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: { message: string; type: string } } & T;
  if (!res.ok || (json as { error?: { message: string } }).error) {
    const err = (json as { error?: { message: string } }).error;
    throw new Error(`Meta API error: ${err?.message ?? res.statusText}`);
  }
  return json as T;
}

/** Exchange authorization code for a short-lived user access token. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string,
): Promise<string> {
  const url = `${META_GRAPH_BASE}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
  const data = await graphFetch<TokenResponse>(url);
  return data.access_token;
}

/** Exchange short-lived token for a 60-day long-lived user access token. */
export async function getLongLivedToken(
  shortToken: string,
  appId: string,
  appSecret: string,
): Promise<string> {
  const url = `${META_GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
  const data = await graphFetch<TokenResponse>(url);
  return data.access_token;
}

/** Get all FB pages the user manages (with page-level access tokens). */
export async function getPages(userAccessToken: string): Promise<MetaPage[]> {
  const url = `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`;
  const data = await graphFetch<PagesResponse>(url);
  return data.data;
}

/** Get the Instagram Business/Creator account ID linked to a FB page (null if none). */
export async function getIgUserId(pageId: string, pageAccessToken: string): Promise<string | null> {
  try {
    const url = `${META_GRAPH_BASE}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`;
    const data = await graphFetch<IgAccountResponse>(url);
    return data.instagram_business_account?.id ?? null;
  } catch {
    return null;
  }
}

/** Publish a text-only post to a Facebook page. Returns the FB post ID. */
export async function publishToFbPage(
  pageId: string,
  pageAccessToken: string,
  message: string,
): Promise<string> {
  const url = `${META_GRAPH_BASE}/${pageId}/feed`;
  const data = await graphPost<FbPostResponse>(url, {
    message,
    access_token: pageAccessToken,
  });
  return data.id;
}

/** Publish a photo post to a Facebook page. Returns the FB post ID. */
export async function publishPhotoToFbPage(
  pageId: string,
  pageAccessToken: string,
  message: string,
  imageUrl: string,
): Promise<string> {
  // POST /{page-id}/photos attaches the image and creates a feed story with caption.
  const url = `${META_GRAPH_BASE}/${pageId}/photos`;
  const data = await graphPost<FbPostResponse>(url, {
    url: imageUrl,
    message,
    access_token: pageAccessToken,
  });
  // /photos returns { id, post_id } — post_id is the feed post, id is the photo object.
  // Return post_id when available so it matches what the feed/publishToFbPage returns.
  return (data as unknown as { post_id?: string }).post_id ?? data.id;
}

/**
 * Publish an image post to Instagram.
 * IG requires a publicly accessible image URL — text-only posts are not supported.
 * Returns the IG media ID.
 */
export async function publishToIg(
  igUserId: string,
  pageAccessToken: string,
  caption: string,
  imageUrl: string,
): Promise<string> {
  // Step 1: Create media container
  const containerUrl = `${META_GRAPH_BASE}/${igUserId}/media`;
  const container = await graphPost<IgContainerResponse>(containerUrl, {
    caption,
    image_url: imageUrl,
    media_type: "IMAGE",
    access_token: pageAccessToken,
  });

  // Step 2: Publish the container
  const publishUrl = `${META_GRAPH_BASE}/${igUserId}/media_publish`;
  const published = await graphPost<FbPostResponse>(publishUrl, {
    creation_id: container.id,
    access_token: pageAccessToken,
  });

  return published.id;
}
