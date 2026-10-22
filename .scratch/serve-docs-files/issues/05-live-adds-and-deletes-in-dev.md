# 05: Live adds and deletes in dev

**What to build:** In dev, a file added under the docs directory is served, and a deleted one 404s, without restarting the server. The endpoint's `getStaticPaths` is cached, so on a watcher add or delete under the docs directory the plugin sends Astro's internal `astro:content-changed` hot event to every non-client Vite environment, which clears the route cache. That event isn't public Astro API, so it's sent from one function only. See the spec (`../spec.md`) and ADR 0011.

From the prototype:

```ts
server.watcher.on("all", (event, filePath) => {
  if (event !== "add" && event !== "unlink") return;
  if (!filePath.startsWith(docsDirPath)) return;
  for (const environment of Object.values(server.environments)) {
    if (environment.name === "client") continue;
    environment.hot.send("astro:content-changed", {});
  }
});
```

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Add and delete under the docs dir send the event to every non-client environment; changes outside it, and edits, don't (test with a fake watcher and environments)
- [ ] Checked in a real dev server: a new file serves without a restart, and a deleted one 404s
- [ ] A comment where the event is sent says it's internal Astro API
