---
status: accepted
---

# Raw docs keep their source path, and each page names its own raw doc

A raw doc is served only at its source path (`/reference/List%20Syntax.md`), never at a slugified one (`/reference/list-syntax.md`), even though Starlight serves its page at `/reference/list-syntax/`. Starlight slugifies page paths because a page has no file of its own. A raw doc is a file, and files under the docs directory keep their names, the same as docs assets. That way a raw doc link written as the file path, which an editor can follow, means the same file on the site without being rewritten (ADR 0010).

Since the page path can't predict the raw doc's path, `astroServeDocsFiles` adds a raw doc alternate link, `<link rel="alternate" type="text/markdown" href="...">` with the raw doc's path under Astro's `base`, to every doc route page whose raw doc is served. It does this whether or not the page-action bar is enabled. The page-action bar reads that link instead of guessing the URL with `HEAD` requests, and a page without one has no page-action bar. Crawlers and agents that follow link relations can find the raw doc the same way.

## Consequences

- The raw doc alternate link comes from the source doc's entry, not the page URL, so a non-slug path, a frontmatter `slug:` override and every source doc extension all get the right URL. `slug:` overrides still aren't a supported way of authoring.
- Drafts (outside dev), ignored docs, pages whose frontmatter can't be parsed mid-session, the 404 page and `src/pages` routes get no raw doc alternate link and no page-action bar. Neither do docs with `?` or `#` in their path: Astro's `decodeURI` leaves `%3F` and `%23` encoded in route params, so their raw docs can't be served at all. The check that `ignorePatterns` doesn't hide raw docs while the bar is enabled is removed.
- The raw doc alternate link is added by an Astro middleware that reads Starlight's `locals.starlightRoute`, so the plugin needs Starlight 0.32 or later.

## Considered Options

- **Serve raw docs at the slugified path, alone or as well.** Rejected: raw doc links would need rewriting, raw docs would be the only renamed files under the docs directory, and slugifying adds clashes (`Foo.md` and `foo.md`, `x.md` and `x.mdx`) and an open question for index files.
- **A Starlight route middleware pushing the link into `starlightRoute.head`.** Rejected: it needs a companion Starlight plugin in the user's config.
- **A manifest route mapping page paths to raw docs.** Rejected: it means copying Starlight's slug logic, or reading the content collection from the route.
