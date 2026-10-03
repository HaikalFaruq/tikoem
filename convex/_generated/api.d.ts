/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as batasLaju from "../batasLaju.js";
import type * as hitung from "../hitung.js";
import type * as lokasi from "../lokasi.js";
import type * as nominatim from "../nominatim.js";
import type * as ors from "../ors.js";
import type * as overpass from "../overpass.js";
import type * as pengenal from "../pengenal.js";
import type * as room from "../room.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  batasLaju: typeof batasLaju;
  hitung: typeof hitung;
  lokasi: typeof lokasi;
  nominatim: typeof nominatim;
  ors: typeof ors;
  overpass: typeof overpass;
  pengenal: typeof pengenal;
  room: typeof room;
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
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
