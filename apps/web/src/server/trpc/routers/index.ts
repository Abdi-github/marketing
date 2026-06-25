import { router } from "../trpc";
import { authRouter } from "./auth";
import { billingRouter } from "./billing";
import { brandRouter } from "./brand";
import { contactsRouter } from "./contacts";
import { contentRouter } from "./content";
import { copilotRouter } from "./copilot";
import { domainsRouter } from "./domains";
import { experimentsRouter } from "./experiments";
import { formsRouter } from "./forms";
import { landingPagesRouter } from "./landing-pages";
import { integrationsRouter } from "./integrations";
import { opsRouter } from "./ops";
import { platformRouter } from "./platform";
import { dealsRouter } from "./deals";
import { inboxRouter } from "./inbox";
import { segmentsRouter } from "./segments";
import { sequencesRouter } from "./sequences";
import { tenancyRouter } from "./tenancy";
import { uploadsRouter } from "./uploads";
import { smsAutomationRouter } from "./sms-automation";
import { smsRouter } from "./sms";
import { notificationsRouter } from "./notifications";

export const appRouter = router({
  auth: authRouter,
  billing: billingRouter,
  brand: brandRouter,
  contacts: contactsRouter,
  content: contentRouter,
  copilot: copilotRouter,
  deals: dealsRouter,
  domains: domainsRouter,
  experiments: experimentsRouter,
  forms: formsRouter,
  inbox: inboxRouter,
  landingPages: landingPagesRouter,
  integrations: integrationsRouter,
  notifications: notificationsRouter,
  ops: opsRouter,
  platform: platformRouter,
  segments: segmentsRouter,
  sequences: sequencesRouter,
  smsAutomation: smsAutomationRouter,
  sms: smsRouter,
  tenancy: tenancyRouter,
  uploads: uploadsRouter,
});

export type AppRouter = typeof appRouter;
