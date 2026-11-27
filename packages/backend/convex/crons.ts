import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("prune expired waitlist requests", { hours: 6 }, internal.waitlist.pruneExpired);

crons.interval(
  "prune expired mobile notifications",
  { hours: 6 },
  internal.mobileNotifications.pruneExpired,
);

crons.interval(
  "reconcile aging Pey payments",
  { minutes: 5 },
  internal.pey.actions.reconcilePayments,
);

export default crons;
