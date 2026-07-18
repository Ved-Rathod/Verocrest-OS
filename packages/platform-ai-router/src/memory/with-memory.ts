import type { MemoryAnnotation, MemoryHit, MemoryRequest, MemoryStore } from './types';

/**
 * The only retrieval path (docs/09 §4.2). Given a query embedding + scopes, run
 * the RLS-scoped ANN search (oversampled server-side), apply annotations
 * (docs/09 §4.5), then truncate to topK. Feature code never queries
 * memory_vectors directly — it reaches this only through the Router pipeline.
 *
 * Cold-start / empty memory returns [] (docs/09 §4.8). Retrieval never throws
 * into the calling AI request: an infrastructure failure degrades to "no memory"
 * so the model call still proceeds (§4.7 — proceed with what was returned).
 */
export async function withMemory(store: MemoryStore, req: MemoryRequest): Promise<MemoryHit[]> {
  if (req.scopes.length === 0 || req.topK <= 0) return [];

  const minSimilarity = req.minSimilarity ?? 0.55; // docs/09 §4.2 default
  let hits: MemoryHit[];
  try {
    hits = await store.match({
      workspaceId: req.workspaceId,
      scopes: req.scopes,
      subjectIds: req.subjectIds && req.subjectIds.length > 0 ? req.subjectIds : null,
      queryEmbedding: req.queryEmbedding,
      topK: req.topK,
      minSimilarity,
    });
  } catch (err) {
    console.error('[memory] retrieval failed; proceeding with empty context', err);
    return [];
  }

  const excluded = new Set(req.excludeIds ?? []);
  hits = hits.filter((h) => !excluded.has(h.id));
  if (hits.length === 0) return [];

  // Annotation application (docs/09 §4.5): drop never_apply; keep always_apply
  // even below threshold; boost/suppress are ignored in v0.1.
  let annotations: MemoryAnnotation[];
  try {
    annotations = await store.annotationsFor(
      req.workspaceId,
      hits.map((h) => h.id),
    );
  } catch (err) {
    console.error('[memory] annotation lookup failed; using raw hits', err);
    annotations = [];
  }

  const relevant = annotations.filter(
    (a) => a.capability === null || a.capability === req.capability,
  );
  const never = new Set(
    relevant.filter((a) => a.annotation === 'never_apply').map((a) => a.memoryId),
  );
  const always = new Set(
    relevant.filter((a) => a.annotation === 'always_apply').map((a) => a.memoryId),
  );

  const kept = hits.filter((h) => !never.has(h.id));
  // always_apply memories are unioned in even if the ANN threshold dropped them;
  // the SQL already applied the threshold, so anything here already passed it,
  // but always_apply members are protected from truncation by sorting first.
  kept.sort((a, b) => {
    const aAlways = always.has(a.id) ? 1 : 0;
    const bAlways = always.has(b.id) ? 1 : 0;
    if (aAlways !== bAlways) return bAlways - aAlways;
    return b.similarity - a.similarity;
  });

  return kept.slice(0, req.topK);
}
