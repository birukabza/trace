import { extractText } from "unpdf";
import { RESEARCH_LIMITS } from "../capabilities";

const MAX_BYTES = RESEARCH_LIMITS.sourceBytes;
export const MAX_SOURCE_LENGTH = RESEARCH_LIMITS.sourceCharacters;
const HOSTS = new Set(["arxiv.org", "www.arxiv.org", "export.arxiv.org", "github.com", "api.github.com", "raw.githubusercontent.com"]);

export function validateSourceUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Enter a valid arXiv paper or public GitHub repository URL."); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !HOSTS.has(url.hostname)) {
    throw new Error("Only HTTPS arXiv papers and public GitHub repositories are supported in this version.");
  }
  return url;
}

async function publicFetch(input: URL, signal: AbortSignal, redirects = 0): Promise<Response> {
  validateSourceUrl(input.toString());
  const response = await fetch(input, { redirect: "manual", signal, headers: { "User-Agent": "ReproAgent/0.1 research prototype", "Accept": "application/json,text/html,application/pdf,text/plain" } });
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    if (redirects >= 3 || !response.headers.get("location")) throw new Error("Source redirected too many times.");
    return publicFetch(new URL(response.headers.get("location")!, input), signal, redirects + 1);
  }
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}. Check that it is publicly available.`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Source exceeds the 12 MB download limit.");
  return response;
}

async function boundedBody(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new Error("Source returned no content.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error("Source exceeds the 12 MB download limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function plainHtml(html: string) {
  return html.replace(/<(script|style|nav)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

export async function readSource(input: string, abort?: AbortSignal) {
  const url = validateSourceUrl(input);
  const signal = abort ? AbortSignal.any([abort, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
  if (url.hostname === "github.com") {
    const [, owner, repo] = url.pathname.split("/");
    if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new Error("Use a public GitHub repository URL.");
    const endpoint = new URL(`https://api.github.com/repos/${owner}/${repo}/readme`);
    const readme = JSON.parse(new TextDecoder().decode(await boundedBody(await publicFetch(endpoint, signal))));
    if (typeof readme.content !== "string" || readme.encoding !== "base64") throw new Error("Repository README could not be read.");
    const text = Buffer.from(readme.content, "base64").toString("utf8").slice(0, MAX_SOURCE_LENGTH);
    return { title: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}`, text, sourceType: "github" as const, truncated: text.length >= MAX_SOURCE_LENGTH };
  }
  if (!url.hostname.endsWith("arxiv.org")) throw new Error("Start with an arXiv paper or GitHub repository URL.");
  const id = url.pathname.replace(/^\/(abs|html|pdf)\//, "").replace(/\.pdf$/, "");
  if (!/^(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?$/.test(id)) throw new Error("This arXiv paper identifier is not supported.");
  let text: string;
  let title = `arXiv ${id}`;
  let sourceType: "arxiv_html" | "arxiv_pdf" = "arxiv_html";
  try {
    const html = new TextDecoder().decode(await boundedBody(await publicFetch(new URL(`https://arxiv.org/html/${id}`), signal)));
    title = plainHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || title);
    text = plainHtml(html);
    if (text.length < 800) throw new Error("HTML unavailable");
  } catch (error) {
    if (abort?.aborted) throw error;
    const pdf = await boundedBody(await publicFetch(new URL(`https://arxiv.org/pdf/${id}`), signal));
    const extracted = await extractText(pdf, { mergePages: true });
    text = extracted.text;
    sourceType = "arxiv_pdf";
  }
  if (text.length < 200) throw new Error("Paper text could not be extracted. Scanned PDFs are not supported yet.");
  return { title, url: `https://arxiv.org/abs/${id}`, text: text.slice(0, MAX_SOURCE_LENGTH), sourceType, truncated: text.length > MAX_SOURCE_LENGTH };
}
