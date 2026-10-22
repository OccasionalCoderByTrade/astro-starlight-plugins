// Route entrypoint the integration injects at `/[...path]`. Its settings come from a virtual
// module the integration serves, since a route entrypoint can't take arguments.
// @ts-expect-error virtual module served by the integration's Vite plugin
import settings from "virtual:astro-serve-docs-files/settings";
import { createDocsFileRoute } from "./docs-file-route.js";

const docsFileRoute = createDocsFileRoute(settings);

export const getStaticPaths = docsFileRoute.getStaticPaths;
export const GET = docsFileRoute.GET;
