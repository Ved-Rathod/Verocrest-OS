/**
 * Token-aware chunker (docs/09 §5.2, docs/05 §3.5): ~500 tokens/chunk, 100-token
 * overlap, rounded to the nearest sentence boundary within ±50 tokens. Ships in
 * Sprint 3.4 as the shared substrate utility; its Knowledge-Layer consumers
 * (KB / offer / ICP indexers) arrive in Sprint 6.
 *
 * Tokens are approximated at ~4 chars/token (the embedding cost estimator uses
 * the same heuristic); provider-exact tokenization is a documented refinement.
 */

const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = 500;
const OVERLAP_TOKENS = 100;
const BOUNDARY_SLACK_TOKENS = 50;

export type Chunk = {
  content: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
};

const toChars = (tokens: number) => tokens * CHARS_PER_TOKEN;

/** Nearest sentence boundary to `target`, within ±slack chars; else `target`. */
function nearestBoundary(text: string, target: number, slack: number): number {
  if (target >= text.length) return text.length;
  const lo = Math.max(0, target - slack);
  const hi = Math.min(text.length, target + slack);
  let best = -1;
  let bestDist = Infinity;
  // Sentence terminators followed by whitespace.
  const re = /[.!?]\s/g;
  re.lastIndex = lo;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const boundary = match.index + 1; // include the terminator
    if (boundary > hi) break;
    const dist = Math.abs(boundary - target);
    if (dist < bestDist) {
      best = boundary;
      bestDist = dist;
    }
  }
  return best === -1 ? target : best;
}

export function chunkText(input: string): Chunk[] {
  const text = input.trim();
  if (text === '') return [];

  const targetChars = toChars(TARGET_TOKENS);
  const overlapChars = toChars(OVERLAP_TOKENS);
  const slackChars = toChars(BOUNDARY_SLACK_TOKENS);

  if (text.length <= targetChars) {
    return [{ content: text, chunkIndex: 0, charStart: 0, charEnd: text.length }];
  }

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;
  while (start < text.length) {
    const rawEnd = start + targetChars;
    const end = nearestBoundary(text, rawEnd, slackChars);
    const content = text.slice(start, end).trim();
    if (content !== '') {
      chunks.push({ content, chunkIndex: index, charStart: start, charEnd: end });
      index += 1;
    }
    if (end >= text.length) break;
    // Advance with overlap; guarantee forward progress.
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}
