---
status: accepted
---

# Docs files are served by a prerendered endpoint, not copied into `public/`

Raw docs and docs assets are served at their path under the docs directory by one prerendered `/[...path]` endpoint that `astroServeDocsFiles` (formerly `syncDocsToPublic`) injects. In dev it reads each file from source on request, and in a build Astro writes each one into the output directory like any other prerendered route. Nothing is written to `public/`.

The old plugin copied the docs directory into `public/`, and on every dev start and build deleted each top-level directory in `public/` it hadn't been told to preserve. Installing it into a site with its own `public/` content would delete that content. `public/` is the user's again: the plugin never writes to it or deletes from it.

## Consequences

- A served path collision is an error. One with a `public/` file is found at dev startup and build start, and one that appears during a dev session only errors at that URL. The error mentions that the `public/` copy may be a stale leftover from `syncDocsToPublic` 3.x. One with another route's output (a Starlight page, a `src/pages` route) is found in `astro:build:done` from Astro's `assets` map, not predicted from source docs. Astro on its own only warns when two routes share a URL, dropping one of the pages, and says nothing when two routes write the same output file under different URLs.
- The served-file rule (no drafts, no `_`- or `.`-prefixed files or directories, no `ignorePatterns` matches) is defined once and shared. `astroLocalLinks` reads it from the integration it finds by name in `config.integrations`, so dev link validation agrees with what's served. A build checks links against the output directory itself.
- Adding or deleting a file during a dev session clears Astro's route cache through its internal `astro:content-changed` hot event, since the endpoint's `getStaticPaths` is otherwise cached. This is not public Astro API, so it is kept in one function that an Astro upgrade can break in only one place.
- The endpoint is a second catch-all next to Starlight's doc route. Astro tries each in turn, so pages and 404s are unaffected. `astroLocalLinks`'s shadowed doc check doesn't count the endpoint as shadowing a source doc, and leaves those clashes to the serve plugin's error.
- `preserveDirs` is removed.

## Considered Options

- **Keep copying into `public/`, but delete only what a manifest says the plugin wrote.** Rejected: it still writes into a directory the user owns, and it still needs a policy for collisions and stale files.
- **Dev middleware that serves from source, plus a copy into the output directory in `astro:build:done`.** Rejected: dev and build would use two different mechanisms, and SSR builds would need the copy pointed at `build.client`. The endpoint gets both modes and SSR from Astro's own routing.
- **Make deletion opt-in with a `managedDirs` option.** Rejected: it's still destructive inside those dirs, and the footgun stays for anyone who misconfigures it.
