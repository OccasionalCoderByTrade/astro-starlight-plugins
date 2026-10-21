// Middleware entrypoint the integration adds in dev. Its settings come from a virtual module
// the integration serves, since a middleware entrypoint can't take arguments.
// @ts-expect-error virtual module served by the integration's Vite plugin
import settings from "virtual:astro-local-links/settings";
import { createOnRequest } from "./on-request.js";

export const onRequest = createOnRequest(settings);
