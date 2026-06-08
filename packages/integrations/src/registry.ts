import type { IIntegrationAdapter } from "./interface";

const adapters = new Map<string, IIntegrationAdapter>();

export function registerAdapter(adapter: IIntegrationAdapter): void {
  if (adapters.has(adapter.provider)) {
    throw new Error(`Integration adapter '${adapter.provider}' is already registered`);
  }
  adapters.set(adapter.provider, adapter);
}

export function getAdapter(provider: string): IIntegrationAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) {
    throw new Error(`No adapter registered for provider '${provider}'`);
  }
  return adapter;
}

export function listAdapters(): IIntegrationAdapter[] {
  return [...adapters.values()];
}
