import { logger, initOtel, shutdownOtel } from "@marketing/shared";
import "./queues/noop";

initOtel("marketing-workers");
logger.info("Workers started — listening for jobs");

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received — shutting down workers");
  await shutdownOtel();
  process.exit(0);
});
