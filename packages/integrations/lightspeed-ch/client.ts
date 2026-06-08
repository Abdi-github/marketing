import { LIGHTSPEED_BASE_URL } from "./config";

export interface LightspeedCatalogItem {
  id: string;
  name: string;
  description: string | null;
  priceChf: number;
  categoryId: string;
  available: boolean;
}

export interface LightspeedCategory {
  id: string;
  name: string;
}

export interface LightspeedClient {
  listCategories(): Promise<LightspeedCategory[]>;
  listItems(): Promise<LightspeedCatalogItem[]>;
}

export function createLightspeedClient(apiKey: string, businessLocationId: string): LightspeedClient {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  async function apiFetch<T>(path: string): Promise<T> {
    const res = await fetch(
      `${LIGHTSPEED_BASE_URL}/businesses/${businessLocationId}${path}`,
      { headers },
    );
    if (!res.ok) {
      throw new Error(`Lightspeed CH API error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    listCategories: () => apiFetch<LightspeedCategory[]>("/menus/categories"),
    listItems: () => apiFetch<LightspeedCatalogItem[]>("/menus/items"),
  };
}
