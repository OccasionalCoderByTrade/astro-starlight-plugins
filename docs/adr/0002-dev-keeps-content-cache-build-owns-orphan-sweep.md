---
status: accepted
---

# Dev keeps the content layer cache; build owns the full orphan sweep

In dev, Starlight's content layer cache stays on, so a Markdown doc whose content hasn't changed is not re-rendered and dev start stays fast. The cost is that dev never sees what cached docs reference, so it can't tell which compiled tex diagrams are orphaned site-wide. Build clears the cache, wipes every debug tex diagram image at the start (every doc regenerates its own), runs every doc, and sweeps every orphaned tex diagram at the end. Dev only deletes a compiled tex diagram that was first written during the current dev session and that no doc recorded this session still references, and it waits until no doc is mid-render, so a doc that found the diagram already on disk doesn't lose it before recording its outputs. Anything already on disk at startup is left for the next build.

This means dev leaves some orphans on disk until the next build: the old diagram of a block that existed at startup and was then edited, and the diagrams of docs deleted during the session. It never deletes a diagram that a cached doc still shows.

## Considered Options

- **Clear the content layer cache on dev start too** (as build does), so every doc runs the transformer and dev can sweep at `astro:server:start`. Rejected: every doc is re-rendered on every dev start, even when nothing changed.
- **Persist the per-file ledger to `.astro/`** so a cached doc's references survive between sessions, allowing a dev startup sweep with the cache on. Rejected as more machinery than the leftover orphans justify, since build already removes them.
- **Read references out of Astro's cached data store**. Rejected: depends on Astro's internal serialization format.
- **Plain per-file diff in dev** (the behaviour before this decision). Rejected: when two docs share a diagram and one is cached, editing the other deletes a diagram the cached doc still shows.
