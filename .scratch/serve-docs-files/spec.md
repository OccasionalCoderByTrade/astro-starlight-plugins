Status: ready-for-agent

# astroServeDocsFiles: serve docs files without touching `public/`

See ADR 0011 (`docs/adr/0011-docs-files-are-served-by-an-endpoint-not-copied-to-public.md`), ADR 0010 (partly superseded by 0011), ADR 0007 and ADR 0008, and these terms in `CONTEXT.md`: raw doc, docs asset, raw doc link, source doc, served path collision.

Primary source: the throwaway branch `prototype/docs-asset-endpoint` (commit `d5bacea`), which showed the endpoint approach working in dev and build. The commit message holds its verdict.

## Problem Statement

`syncDocsToPublic` makes docs assets (a PDF next to a source doc) and raw docs reachable by copying the docs directory into `public/`. To clear stale copies, every dev start and build deletes each top-level directory in `public/` that isn't listed in `preserveDirs`. So:

- Someone adding the plugin to a site that already has `public/images/`, `public/fonts/` or similar loses those directories the first time they run dev. `preserveDirs` only protects them if the user knows ahead of time to list everything.
- In dev, deleting a directory under the docs directory deletes the directory at the same path in `public/`, even if the user owns it.
- Top-level files copied in from the docs directory are never cleaned up, so they go stale.
- `public/` gets filled with generated copies. A site has to gitignore them, and `public/` stops being a directory the user can author.
- `_`-prefixed files are copied and served by mistake, though Astro and Starlight treat them as private.
- The sync hardcodes `public` and `src/content/docs` instead of reading the site's config, so it disagrees with `astroLocalLinks` on a site with a custom `publicDir` or `srcDir`.

## Solution

The plugin is renamed `astroServeDocsFiles`. It serves every raw doc and docs asset at its path under the docs directory through one prerendered endpoint. Nothing is copied into `public/` or deleted from it. In dev each file is read from source on request, so saved edits show up straight away, and files added or deleted during the session are picked up without a restart. In a build, Astro writes each file into the output directory like any other prerendered route.

Drafts, `_`- or `.`-prefixed files and directories, and `ignorePatterns` matches aren't served. A served path collision is an error. A docs file sharing its served path with a `public/` file fails dev at startup and the build. A docs file sharing an output file with any other route (a Starlight page, a `src/pages` route, another integration's route) fails the build. Each error lists every clash, and as a possible cause mentions a stale leftover from `syncDocsToPublic` 3.x. `preserveDirs` is removed. The page-action bar options stay on this plugin.

`astroLocalLinks` accepts links to raw docs and docs assets that the plugin serves. In a build it checks the output directory. In dev it uses the plugin's served-file rule, so dev and build agree on what's served.

## User Stories

1. As a site author adding the plugin to an existing site, I want my existing `public/` content left untouched, so that installing the plugin can't delete my files.
2. As a site author, I want `public/` to only hold files I put there, so that I don't have to gitignore generated copies.
3. As a docs author, I want a PDF next to my source doc to be served at its path under the docs directory, so that a relative link to it works.
4. As a docs author, I want docs assets in nested directories served at their nested paths, so that the docs directory's layout is the site's layout.
5. As a docs author, I want a docs asset with a non-slug filename (spaces, capitals, punctuation) served at that exact path, so that a link to it written as the file's path works.
6. As a docs author, I want a raw doc served at its source path with its extension, so that a raw doc link offers the Markdown for download or viewing.
7. As a docs author, I want a raw doc served byte-for-byte, frontmatter included, so that what readers get is the file I wrote.
8. As a docs author, I want docs assets and raw docs served with a content type matching their extension, so that browsers open PDFs and show Markdown as text.
9. As a docs author, I want an `.mdx` source doc served as a raw doc the same way as `.md`, so that both formats behave the same.
10. As a docs author, I want a draft source doc not to be served as a raw doc in a build, and served in dev like Starlight renders its page, so that unpublished writing isn't reachable on the site but I can still preview it. (Revised: ticket 09.)
11. As a docs author, I want `_`-prefixed files and everything under `_`-prefixed directories left out, so that the plugin follows Astro's and Starlight's convention for private files.
12. As a docs author, I want `.`-prefixed files and directories (`.DS_Store`, `.obsidian/`) left out, so that editor and OS clutter in a notes vault isn't published.
13. As a docs author, I want a docs asset next to a draft doc still served, so that only the draft itself is held back.
14. As a docs author, I want a source doc with `sidebar.hidden` still served as a raw doc, so that hiding a page from the sidebar doesn't change what's reachable.
15. As a site author, I want `ignorePatterns` to leave out matching files, so that I can keep scratch files out of the site.
16. ~~As a site author, I want the existing error when `ignorePatterns` would hide raw docs the page-action bar needs, so that I don't ship a broken "View raw" button.~~ Replaced by ticket 10: a page whose raw doc isn't served has no page-action bar, so the error is removed.
17. As a docs author in dev, I want an edited docs asset or raw doc served with its new contents on the next request, so that I don't need to restart.
18. As a docs author in dev, I want a newly added docs asset served without restarting the dev server, so that adding a PDF just works.
19. As a docs author in dev, I want a deleted docs asset to 404 without restarting the dev server, so that dev matches what a build would do.
20. As a docs author in dev, I want changes outside the docs directory not to trigger a route cache clear, so that unrelated saves don't do needless work.
21. As a site author, I want pages, the home page and Starlight's 404 page to keep working with the plugin installed, so that serving files doesn't interfere with page routing.
22. As a site author, I want an unknown URL to still get Starlight's 404 page, so that missing files look like any other missing page.
23. As a site author, I want docs assets and raw docs written into the build output with their exact bytes, so that the deployed site serves the same files as dev.
24. As a site author, I want the endpoint prerendered even on a site with SSR output, so that serving files never needs a server at request time.
25. As a site author, I want a file that exists both in `public/` and under the docs directory to fail dev at startup and the build, so that neither copy silently wins.
26. As a site author upgrading from 3.x, I want the collision error to mention that the `public/` copy may be a stale leftover from `syncDocsToPublic` 3.x, so that I know the old synced copies are a likely cause and can delete them.
27. As a site author, I want the collision error worded so the stale copy is offered as one possible cause, not the assumed one, so that it isn't misleading when I placed both files on purpose.
28. As a site author, I want a build to fail when a docs file and any other route write the same output file (an extensionless `reference/foo` next to `reference/foo.md`, a `reference/index.html` next to `reference/index.md`, or a docs `zap/index.html` next to `src/pages/zap.astro`), so that a page is never silently dropped or overwritten.
29. As a site author, I want that check to hold whatever `build.format` is set to, so that switching formats doesn't hide a clash.
30. As a site author, I want every served path collision listed in one error, so that I can fix them all at once.
31. As a docs author in dev, I want a `public/` collision created during the session to show an error at that URL without stopping the server, so that one bad file doesn't kill the dev server.
32. As a site author with both plugins installed, I want a collision involving a docs file reported once, as a served path collision, so that I'm not also told my doc is shadowed by the serve plugin's route.
33. As a site author, I want unparseable frontmatter in a source doc to fail dev at startup and the build, so that a draft is never served because its frontmatter couldn't be read.
34. As a docs author in dev, I want unparseable frontmatter introduced during the session to only be logged, so that one bad save doesn't stop the server.
35. As a site author, I want the plugin to read the docs directory from the site's `srcDir`, so that a custom `srcDir` works and matches `astroLocalLinks`.
36. As a site author, I want to configure the plugin without `preserveDirs`, so that there's no required option guarding against deletions that no longer happen.
37. As a site author upgrading, I want the README to say what changed in 4.0.0 (the rename, `preserveDirs` removed, deleting old synced copies from `public/`), so that I can upgrade without reading the source.
38. As a site author, I want the page-action bar options (`exposePageSrcButton`, `enableAskAiOption`) to keep working on the renamed plugin, so that "Copy page" and the "Ask" entries still find raw docs.
39. As a docs author, I want a link to a served docs asset to pass link validation in a build, so that I can link to PDFs next to my docs.
40. As a docs author, I want a link to a docs asset that isn't served (ignored, `_`-prefixed, missing) to fail link validation in a build, so that I don't ship a 404.
41. As a docs author, I want a raw doc link to a served raw doc to pass, and one to a draft or ignored doc to fail, so that raw doc links mean what's actually served.
42. As a docs author, I want the broken raw doc link error to explain that the raw doc isn't served, and how to link to the page instead, so that I can fix the link without knowing about `public/`.
43. As a docs author in dev, I want link validation to accept the same docs files that the plugin serves, so that dev and build don't disagree.
44. As a docs author in dev without the plugin installed, I want link validation to only accept files in `public/`, so that it doesn't pass links that would 404.
45. As a docs author, I want files I put in `public/` myself to still pass link validation, so that `public/` stays a valid place for site-wide assets.
46. As a plugin user, I want the two plugins to keep working when installed independently, so that neither requires the other.

## Implementation Decisions

- **Rename.** `syncDocsToPublic` becomes `astroServeDocsFiles`, and its plugin directory, build entry, package export, root re-export and README section are renamed with it. The integration name changes to match, since `astroLocalLinks` finds it by name. This is a breaking change for the unreleased 4.0.0. No version bump.
- **Options.** `preserveDirs` is removed. `ignorePatterns`, `exposePageSrcButton` and `enableAskAiOption` stay with the same meaning. The check that `ignorePatterns` doesn't hide raw docs while the page-action bar is on stays.
- **Docs and public directories.** Both are read from Astro's config (`srcDir` + `content/docs/`, and `publicDir`), the same way `astroLocalLinks` does. Nothing is hardcoded.
- **Serving mechanism.** `astro:config:setup` injects one route with pattern `/[...path]`, prerendered, whose entrypoint is a route module shipped with the plugin. Its `getStaticPaths` lists every served file's path relative to the docs directory, and its `GET` returns the file's bytes unchanged with a content type from its extension (falling back to `application/octet-stream`). Raw docs (`.md`, `.mdx`) are served as `text/markdown; charset=utf-8`. The route module gets the plugin's resolved options without importing the integration; how is an implementation choice. The route module ships as its own build entry so the injected entrypoint resolves in the published package as well as in this repo, the same way the page-action bar script and `astroLocalLinks`'s dev middleware do now.
- **Served-file rule.** One function decides whether a path relative to the docs directory is served. It leaves out drafts (source docs with `draft: true` in frontmatter), any file or directory whose name starts with `_` or `.` (along with everything under such a directory), and `ignorePatterns` matches. It applies to every file under the docs directory, not only source docs. Unparseable frontmatter is an error. The rule lives in the shared utils, since both plugins need it.
- **Exposing the rule.** The integration object `astroServeDocsFiles` returns carries the resolved served-file rule as a public, documented field. `astroLocalLinks` finds the integration by name in `config.integrations` during `astro:config:setup` and keeps the rule if it's there. Neither plugin imports the other.
- **Live dev changes.** `astro:server:setup` watches the docs directory. On an add or delete there, it sends Astro's `astro:content-changed` hot event to every non-client Vite environment, which clears the route cache so `getStaticPaths` reruns. That event is internal Astro API, so it's sent from one function only. Edits need nothing, since `GET` reads from source on every request. The prototype's version:

  ```ts
  // from the prototype
  server.watcher.on("all", (event, filePath) => {
    if (event !== "add" && event !== "unlink") return;
    if (!filePath.startsWith(docsDirPath)) return;
    for (const environment of Object.values(server.environments)) {
      if (environment.name === "client") continue;
      environment.hot.send("astro:content-changed", {});
    }
  });
  ```

- **Removed.** The full sync, incremental sync, copy step, debounce and every write to or deletion from `public/` go away.
- **Served path collisions with `public/`.** A startup scan, run at dev server setup and at build start, finds every served file whose served path is also a file in `public/`. Any hit throws one error listing every clash, with both files for each one. The error offers a stale leftover from `syncDocsToPublic` 3.x as a possible cause, not the assumed one. A collision that appears mid-session in dev errors only at that URL. Per ADR 0008, startup faults fail dev and build.
- **Served path collisions with other routes.** In `astro:build:done`, the plugin reads Astro's `assets` map (route → output files written) and fails the build, listing every clash, when the endpoint and any other route share an output file. That's the ground truth, so it covers Starlight pages, `src/pages` routes, other integrations' routes and every `build.format` without predicting output paths from source docs. Dev doesn't check for these clashes; they need an extensionless file or a stray `.html` in the docs directory, and the build catches them. Astro on its own doesn't catch them reliably. A prototype run on Astro 7.4 found:
  - Two routes with the same URL: Astro only warns and drops the lower-priority one. An extensionless `reference/bar` beat Starlight's page for `reference/bar.md`, and the page was lost.
  - Two routes with different URLs but the same output file: no warning, and the last one written wins. A docs `zap/index.html` silently replaced `src/pages/zap.astro`.
- **Shadowed docs in `astroLocalLinks`.** Its shadowed doc check doesn't count the serve plugin's endpoint as the route serving a source doc's page path. It identifies the endpoint by the route the serve integration injects. Clashes involving the endpoint are left to the serve plugin's own error, so they're reported once. Without this, `astroLocalLinks` reports a misleading shadowed doc naming `/[...path]`, as the prototype run showed.
- **Link validation in a build.** `astroLocalLinks` resolves a file-target link against the build output directory it's given in `astro:build:done`. That covers `public/` files, served docs files, and anything other integrations write. ADR 0007 already runs link validation there.
- **Link validation in dev.** A file target passes if it's a file in `public/`, or if the serve integration was found and its served-file rule accepts the path and the file exists under the docs directory.
- **Raw doc link errors.** The wording changes from "the copy in `public/` doesn't exist" to "the raw doc isn't served", still naming the link to use for the page instead. Per ADR 0010, raw doc links are still never rewritten.
- **Docs.** The README's Sync Docs to Public section is rewritten for `astroServeDocsFiles`, including a short 4.0.0 upgrade note (rename, `preserveDirs` removed, delete old synced copies from `public/`). The Local Links section's lines about files needing to be in `public/` are updated. This repo's demo `astro.config.mjs` switches to the new plugin.

## Testing Decisions

- Tests check behaviour through each seam's public surface: what's injected, what's served, what's thrown, what passes link validation. They don't check internal helpers. Prefer one test per user-visible rule over tests of individual functions.
- **Seam 1: the `astroServeDocsFiles(options)` integration object.** Call its hooks directly with fake Astro objects, the way the current plugin test does with `runDevSetup` and the `makeFileTree` helper. Cover:
  - The route is injected, prerendered, with the expected pattern.
  - Options are validated (the `ignorePatterns` and page-action bar conflict).
  - The startup collision scan fails dev setup and build start for `public/` clashes, lists every clash, and includes the stale 3.x note.
  - `astro:build:done` with a fake `assets` map fails when the endpoint shares an output file with another route (a doc page, a `src/pages` route), lists every clash, and passes when nothing is shared.
  - An existing `public/` tree is byte-identical after dev setup and build start.
  - The watcher sends the cache-clear event to non-client environments on an add or delete under the docs dir, and not for changes elsewhere or for edits.
  - The exposed served-file rule handles drafts, `_`/`.`-prefixed files and dirs, `ignorePatterns` and unparseable frontmatter.
- **Seam 2: the injected route module.** Call `getStaticPaths` and `GET` directly, after giving the module its options the same way the integration does. Cover: exactly the served files are listed; bytes come back unchanged for nested and non-slug paths; content types match their extensions.
- **Seam 3: `astroLocalLinks`.** Extend the existing `build:done` tests (with `makeSite` and `pageHtml`) and the dev request handler tests:
  - Build: a link to a docs asset passes when the file is in the output dir and fails when it isn't. A raw doc link to a draft fails with the new wording.
  - Dev: with the serve integration in `config.integrations`, a link to a served asset passes and a link to an ignored one fails. Without it, only `public/` counts.
  - The shadowed doc check doesn't report the serve plugin's endpoint as shadowing a source doc.
- **Manual end-to-end.** Follow the CLAUDE.md browser-verification steps in a real dev server and a real build. Repeat the prototype's checks: assets, raw docs, pages, the home page and 404s in dev; live add, edit and delete; outputs byte-identical in the build; a `public/` collision fails both, and a stray `index.html` or extensionless file next to a source doc fails the build. This is the only coverage for the internal cache-clear event against real Astro.

## Out of Scope

- ~~The page-action bar guessing the raw doc URL from the page URL, which fails for non-slug paths. It's a separate fix for later.~~ Now ticket 10 (ADR 0012).
- Automatically deleting stale `syncDocsToPublic` 3.x copies from `public/`. The plugin never deletes from `public/`, so the collision error and the upgrade note cover it.
- A compatibility mode or alias that keeps the old copy-into-`public/` behaviour.
- Serving files from any directory other than the docs directory.
- Bumping the package version or publishing.

## Further Notes

- The prototype showed that Astro, left to itself, keeps the `public/` file in a collision and only warns during the build. The startup scan makes that an error in both modes. Astro's handling of clashes between routes is covered under Served path collisions with other routes.
- The prototype also showed that a URL with `%26` in the path 404s while a literal `&` works. Browsers send a literal `&`, so this doesn't need handling.
- Once this lands, the demo site's `public/` still holds copies the old sync left there, which the startup scan will report. Delete them as part of switching the demo config over.

## Comments

Resolved on branch `serve-docs-files` (`git log db93e0d..serve-docs-files`). Deviations found during implementation:

- **Exposing the rule.** Astro's config validation strips every integration field except `name` and `hooks` from `config.integrations`, so a `servedFileRule` field never reaches `astroLocalLinks`. The rule is also exposed as the custom hook `astro-serve-docs-files:served-file-rule`, which is what `astroLocalLinks` reads (ticket 08).
- **Route collisions.** The `assets` map misses same-URL clashes, since Astro drops the losing route before rendering. The plugin also collects Astro's prerender route conflict warnings from the logger (internal API, one function). With `prerenderConflictBehavior: "ignore"` Astro logs nothing, so the plugin warns at build start instead (ticket 07, review fixes).
- **Mid-session bad frontmatter.** In dev, a docs file whose frontmatter can't be parsed is left out of the endpoint and logged, and a link to it fails validation naming the parse error. Startup still throws.

Follow-ups from a later grilling session (2026-10-22), as tickets 09 and 10. See ADR 0012 and the term page-action bar in `CONTEXT.md`:

- **Drafts in dev (ticket 09).** The served-file rule serves drafts in dev and leaves them out of builds, matching Starlight. This revises story 10.
- **Page-action bar finds its raw doc from the page (ticket 10).** Each doc route page with a served raw doc carries a `<link rel="alternate" type="text/markdown">` naming it, and the bar reads that instead of guessing. Pages without one have no bar. The `ignorePatterns` check (story 16) is removed, and the Starlight peer dependency rises to `>=0.32.0`.
