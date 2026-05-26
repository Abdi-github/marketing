// No-op OTel init for skeleton — replace with real OTLP exporter in Phase 3.
// When OTEL_EXPORTER_OTLP_ENDPOINT is set the SDK will auto-configure via
// OTEL env vars; for now we keep the surface identical to what Phase 3 will use.

let _initialized = false;

export function initOtel(_serviceName: string): void {
  if (_initialized) return;
  _initialized = true;
  // Will be replaced with NodeSDK + OTLP exporter when observability infra is provisioned.
}

export function shutdownOtel(): Promise<void> {
  return Promise.resolve();
}
