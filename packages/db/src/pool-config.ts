export type DatabasePoolConfig = {
  max: number;
  idleTimeoutSeconds: number;
  maxLifetimeSeconds: number;
};

export function resolveDatabasePoolConfig(input: {
  configuredMax?: number;
  isServerless: boolean;
}): DatabasePoolConfig {
  return {
    max: input.configuredMax ?? (input.isServerless ? 1 : 3),
    idleTimeoutSeconds: input.isServerless ? 5 : 20,
    maxLifetimeSeconds: input.isServerless ? 5 * 60 : 30 * 60,
  };
}
