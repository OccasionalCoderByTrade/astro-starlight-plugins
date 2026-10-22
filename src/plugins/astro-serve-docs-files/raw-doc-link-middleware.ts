// Middleware entrypoint the integration adds in dev and builds. Its settings come from a
// virtual module the integration serves, since a middleware entrypoint can't take arguments.
// @ts-expect-error virtual module served by the integration's Vite plugin
import settings from "virtual:astro-serve-docs-files/settings";
import { createRawDocLinkMiddleware } from "./raw-doc-link.js";

export const onRequest = createRawDocLinkMiddleware(settings);
