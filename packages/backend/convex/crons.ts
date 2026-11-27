import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "reconcile aging Pey payments",
  { minutes: 5 },
  internal.pey.actions.reconcilePayments,
);

export default crons;
