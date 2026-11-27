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
import type * as businesses from "../businesses.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as healthCheck from "../healthCheck.js";
import type * as http from "../http.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_expiry from "../lib/expiry.js";
import type * as lib_handles from "../lib/handles.js";
import type * as lib_identifiers from "../lib/identifiers.js";
import type * as lib_inventory from "../lib/inventory.js";
import type * as lib_messageModeration from "../lib/messageModeration.js";
import type * as lib_passwordRecovery from "../lib/passwordRecovery.js";
import type * as lib_storage from "../lib/storage.js";
import type * as messageSupport from "../messageSupport.js";
import type * as messages from "../messages.js";
import type * as orders from "../orders.js";
import type * as p2p from "../p2p.js";
import type * as passwordResetEmail from "../passwordResetEmail.js";
import type * as pey_actions from "../pey/actions.js";
import type * as pey_client from "../pey/client.js";
import type * as pey_mutations from "../pey/mutations.js";
import type * as pey_paymentLookup from "../pey/paymentLookup.js";
import type * as pey_queries from "../pey/queries.js";
import type * as pey_reconciliation from "../pey/reconciliation.js";
import type * as pey_types from "../pey/types.js";
import type * as pey_webhook from "../pey/webhook.js";
import type * as privateData from "../privateData.js";
import type * as products from "../products.js";
import type * as splits from "../splits.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  businesses: typeof businesses;
  contacts: typeof contacts;
  crons: typeof crons;
  healthCheck: typeof healthCheck;
  http: typeof http;
  "lib/email": typeof lib_email;
  "lib/expiry": typeof lib_expiry;
  "lib/handles": typeof lib_handles;
  "lib/identifiers": typeof lib_identifiers;
  "lib/inventory": typeof lib_inventory;
  "lib/messageModeration": typeof lib_messageModeration;
  "lib/passwordRecovery": typeof lib_passwordRecovery;
  "lib/storage": typeof lib_storage;
  messageSupport: typeof messageSupport;
  messages: typeof messages;
  orders: typeof orders;
  p2p: typeof p2p;
  passwordResetEmail: typeof passwordResetEmail;
  "pey/actions": typeof pey_actions;
  "pey/client": typeof pey_client;
  "pey/mutations": typeof pey_mutations;
  "pey/paymentLookup": typeof pey_paymentLookup;
  "pey/queries": typeof pey_queries;
  "pey/reconciliation": typeof pey_reconciliation;
  "pey/types": typeof pey_types;
  "pey/webhook": typeof pey_webhook;
  privateData: typeof privateData;
  products: typeof products;
  splits: typeof splits;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
