import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "prune expired mobile notifications",
  { hours: 6 },
  internal.mobileNotifications.pruneExpired,
);

export default crons;
