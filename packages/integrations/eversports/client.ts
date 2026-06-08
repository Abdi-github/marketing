import { EVERSPORTS_BASE_URL } from "./config";

export interface EversportsActivity {
  id: string;
  name: string;
  description: string | null;
  startTime: string;
  endTime: string;
  spotsTotal: number;
  spotsRemaining: number;
  instructorName: string | null;
}

export interface EversportsClient {
  listActivities(fromDate: string, toDate: string): Promise<EversportsActivity[]>;
}

export function createEversportsClient(apiKey: string): EversportsClient {
  async function apiFetch<T>(path: string): Promise<T> {
    const res = await fetch(`${EVERSPORTS_BASE_URL}${path}`, {
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Eversports API error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  return {
    listActivities: (fromDate: string, toDate: string) =>
      apiFetch<EversportsActivity[]>(`/schedule?from=${fromDate}&to=${toDate}`),
  };
}
