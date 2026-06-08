import { GASTROFIX_BASE_URL } from "./config";

export interface GastrofixReservation {
  id: string;
  tableId: string;
  guestCount: number;
  startTime: string;
  endTime: string;
  status: "pending" | "confirmed" | "cancelled";
  guestName: string;
}

export interface GastrofixMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceChf: number;
  available: boolean;
}

export interface GastrofixClient {
  listReservations(date: string): Promise<GastrofixReservation[]>;
  listMenuItems(): Promise<GastrofixMenuItem[]>;
}

export function createGastrofixClient(apiKey: string): GastrofixClient {
  async function apiFetch<T>(path: string): Promise<T> {
    const res = await fetch(`${GASTROFIX_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Gastrofix API error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    listReservations: (date: string) =>
      apiFetch<GastrofixReservation[]>(`/reservations?date=${date}`),
    listMenuItems: () => apiFetch<GastrofixMenuItem[]>("/menu/items"),
  };
}
