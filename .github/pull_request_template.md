**What this changes**

**Which phase / issue**

**Checklist**

- [ ] `node --experimental-strip-types scripts/test-normalize.mjs` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npx next build` passes
- [ ] No hardcoded scoring values, roster slots, week or season
- [ ] No new required API key or paid service
- [ ] Nothing outside `src/lib/platforms/` imports an adapter directly
