/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as pey_actions from "../pey/actions.js";
import type * as pey_client from "../pey/client.js";
import type * as pey_mutations from "../pey/mutations.js";
import type * as pey_queries from "../pey/queries.js";
import type * as pey_types from "../pey/types.js";
import type * as pey_webhook from "../pey/webhook.js";
import type * as privateData from "../privateData.js";

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  healthCheck: typeof healthCheck;
  http: typeof http;
  "pey/actions": typeof pey_actions;
  "pey/client": typeof pey_client;
  "pey/mutations": typeof pey_mutations;
  "pey/queries": typeof pey_queries;
  "pey/types": typeof pey_types;
  "pey/webhook": typeof pey_webhook;
  privateData: typeof privateData;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
