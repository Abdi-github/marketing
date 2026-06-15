import pino from "pino";

// No transport: avoids thread-stream worker threads whose bundled paths
// may be wrong when running locally after a Docker/WSL build.
// Pipe stdout through `pino-pretty` CLI for pretty output if needed.
export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
});
