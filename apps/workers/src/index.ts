import "./load-env";
import { logger, initOtel, shutdownOtel } from "@marketing/shared";
import "./queues/social-post/worker";
import "./queues/social-creative/worker";
import "./queues/social-image/worker";
import "./queues/landing-page/worker";
import "./queues/integration-event/worker";
import "./queues/integration-sync/worker";
import "./queues/domain-cert/worker";
import "./queues/data-erasure/worker";
import "./queues/contact-score/worker";
import "./queues/email-sequence-tick/worker";
import "./queues/deal-summarize/worker";
import "./queues/whatsapp-inbound/worker";

initOtel("marketing-workers");
logger.info("Workers started — listening for jobs");

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received — shutting down workers");
  await shutdownOtel();
  process.exit(0);
});
