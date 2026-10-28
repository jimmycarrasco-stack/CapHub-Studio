/**
 * Lightweight, provider-independent retrieval for agent knowledge bases.
 * Documents are split into paragraph chunks and ranked with BM25 against the
 * latest user message. No embeddings, so it works identically with any provider.
 */

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
}

export interface Chunk {
  docId: string;
  title: string;
  text: string;
}

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from has have how i if in is it its me my of on or our so that the their them there this to us was we what when where which who why will with you your".split(" "),
);

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9$%]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function chunkDocs(docs: KnowledgeDoc[], maxChars = 900): Chunk[] {
  const chunks: Chunk[] = [];
  for (const d of docs) {
    let buf = "";
    for (const para of d.content.split(/\n\s*\n/)) {
      const p = para.trim();
      if (!p) continue;
      if (buf && buf.length + p.length > maxChars) {
        chunks.push({ docId: d.id, title: d.title, text: buf });
        buf = "";
      }
      // Hard-split very long paragraphs.
      for (let i = 0; i < p.length; i += maxChars) {
        const piece = p.slice(i, i + maxChars);
        if (buf && buf.length + piece.length > maxChars) {
          chunks.push({ docId: d.id, title: d.title, text: buf });
          buf = "";
        }
        buf = buf ? `${buf}\n\n${piece}` : piece;
      }
    }
    if (buf) chunks.push({ docId: d.id, title: d.title, text: buf });
  }
  return chunks;
}

export function rankChunks(query: string, chunks: Chunk[], k = 5): Chunk[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !chunks.length) return [];
  const docsTokens = chunks.map((c) => tokenize(`${c.title} ${c.text}`));
  const avgLen = docsTokens.reduce((s, t) => s + t.length, 0) / docsTokens.length || 1;
  const df = new Map<string, number>();
  for (const toks of docsTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);

  const N = chunks.length;
  const k1 = 1.4;
  const b = 0.75;
  const scored = docsTokens.map((toks, i) => {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term);
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks.length) / avgLen)));
    }
    return { i, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => chunks[s.i]);
}

/**
 * Picks knowledge to put in the prompt. Small knowledge bases are included whole
 * (most reliable); larger ones fall back to ranked retrieval.
 */
export function selectKnowledge(query: string, docs: KnowledgeDoc[], budgetChars = 12_000): Chunk[] {
  const total = docs.reduce((s, d) => s + d.content.length, 0);
  const chunks = chunkDocs(docs);
  if (total <= budgetChars) return chunks;
  const picked: Chunk[] = [];
  let used = 0;
  for (const c of rankChunks(query, chunks, 12)) {
    if (used + c.text.length > budgetChars) break;
    picked.push(c);
    used += c.text.length;
  }
  return picked;
}
