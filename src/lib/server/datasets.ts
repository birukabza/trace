import type { DatasetFile, DatasetRequest } from "../types";

// Finds downloadable files for the datasets an experiment needs. This runs on
// the backend, which has normal internet access; the sandbox never searches.
// Sources: links the paper or README gives (including GitHub repositories and
// Zenodo records), OpenML, and Hugging Face.

export type DatasetCandidate = DatasetFile & { id: string; detail?: string };

export const DATA_LIMITS = { maxFileBytes: 1_500_000_000, maxTotalBytes: 3_000_000_000, maxCandidatesPerDataset: 12, maxFilesPerExperiment: 12 } as const;
const USER_AGENT = "TraceResearchAgent/0.3 (+https://github.com/birukabza/trace)";
const DATA_EXTENSIONS = /\.(csv|tsv|txt|json|jsonl|parquet|pq|arff|npy|npz|h5|hdf5|mat|gz|zip|tar|tgz|bz2|xz|pkl|data|idx\d-ubyte|ubyte)$/i;

/** Accepts only plain public HTTPS URLs; rejects credentials, odd ports, IP literals and local names. */
export function safeHttpsUrl(raw: string): URL | undefined {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return; }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || /(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) return;
  return url;
}

/** URLs that appear in a paper's text, with trailing punctuation removed. */
export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"'()\]{}]+/g) ?? [];
  return [...new Set(found.map(url => url.replace(/[.,;:!?]+$/, "")))].filter(url => safeHttpsUrl(url)).slice(0, 60);
}

async function getJson(url: string, signal?: AbortSignal, timeoutMs = 20_000): Promise<any> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`);
  return response.json();
}

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "data";
const safeFilename = (value: string) => (value.split("/").pop() || "data").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 120) || "data";

async function fromOpenML(dataset: string, query: string, signal?: AbortSignal): Promise<Omit<DatasetCandidate, "id">[]> {
  const names = [...new Set([query, query.replace(/[\s-]+/g, "_"), query.toLowerCase().replace(/[\s-]+/g, "_")])];
  const results: Omit<DatasetCandidate, "id">[] = [];
  for (const name of names) {
    let list: any;
    try { list = await getJson(`https://www.openml.org/api/v1/json/data/list/data_name/${encodeURIComponent(name)}/limit/3/status/active`, signal); } catch { continue; }
    for (const item of list?.data?.dataset ?? []) {
      const quality = (key: string) => item.quality?.find((entry: any) => entry.name === key)?.value;
      let description: any;
      try { description = (await getJson(`https://www.openml.org/api/v1/json/data/${item.did}`, signal))?.data_set_description; } catch { continue; }
      const url = description?.parquet_url || description?.url;
      if (!url) continue;
      results.push({
        dataset, source: "openml", title: `${item.name} (OpenML #${item.did}, version ${item.version})`, pageUrl: `https://www.openml.org/d/${item.did}`,
        url, filename: `${safeFilename(item.name)}.${description?.parquet_url ? "parquet" : "arff"}`,
        detail: [quality("NumberOfInstances") && `${Number(quality("NumberOfInstances")).toLocaleString()} rows`, quality("NumberOfFeatures") && `${Number(quality("NumberOfFeatures"))} columns`, quality("NumberOfClasses") && `${Number(quality("NumberOfClasses"))} classes`].filter(Boolean).join(", "),
      });
    }
    if (results.length) break;
  }
  return results;
}

async function huggingFaceFiles(dataset: string, id: string, signal?: AbortSignal): Promise<Omit<DatasetCandidate, "id">[]> {
  const listing = await getJson(`https://datasets-server.huggingface.co/parquet?dataset=${encodeURIComponent(id)}`, signal);
  return (listing?.parquet_files ?? []).slice(0, 8).map((file: any) => ({
    dataset, source: "huggingface" as const, title: `${id} · ${file.config}/${file.split}`, pageUrl: `https://huggingface.co/datasets/${id}`,
    url: file.url, filename: safeFilename(`${file.config}-${file.split}-${file.filename}`), bytes: typeof file.size === "number" ? file.size : undefined,
  }));
}

async function fromHuggingFace(dataset: string, query: string, signal?: AbortSignal) {
  const ids: string[] = ((await getJson(`https://huggingface.co/api/datasets?search=${encodeURIComponent(query)}&limit=3&sort=downloads`, signal)) ?? []).map((item: any) => item.id).filter(Boolean);
  const results: Omit<DatasetCandidate, "id">[] = [];
  for (const id of ids) { try { results.push(...await huggingFaceFiles(dataset, id, signal)); } catch { /* Gated or unconverted dataset. */ } }
  return results;
}

async function fromGitHub(dataset: string, url: URL, signal?: AbortSignal): Promise<Omit<DatasetCandidate, "id">[]> {
  const [, owner, repo, kind, branchFromUrl, ...rest] = url.pathname.split("/");
  if (!owner || !repo) return [];
  const name = repo.replace(/\.git$/, "");
  if (kind === "blob" && branchFromUrl && rest.length) {
    const path = rest.join("/");
    return [{ dataset, source: "github", title: `${owner}/${name}: ${path}`, pageUrl: url.toString(), url: `https://raw.githubusercontent.com/${owner}/${name}/${branchFromUrl}/${path}`, filename: safeFilename(path) }];
  }
  const meta = await getJson(`https://api.github.com/repos/${owner}/${name}`, signal);
  const branch = branchFromUrl && kind === "tree" ? branchFromUrl : meta?.default_branch;
  if (!branch) return [];
  const prefix = kind === "tree" ? rest.join("/") : "";
  const tree = await getJson(`https://api.github.com/repos/${owner}/${name}/git/trees/${encodeURIComponent(branch)}?recursive=1`, signal);
  const files = (tree?.tree ?? []).filter((item: any) => item.type === "blob" && DATA_EXTENSIONS.test(item.path) && (!prefix || item.path.startsWith(prefix)) && !/(^|\/)(\.github|docs?|tests?|examples?)\//i.test(item.path) && !/(readme|license|requirements|changelog|setup)/i.test(item.path) && item.size <= DATA_LIMITS.maxFileBytes);
  // Prefer files inside data-like folders, then larger files.
  files.sort((a: any, b: any) => Number(/(^|\/)(data|datasets?|raw|benchmarks?)\//i.test(b.path)) - Number(/(^|\/)(data|datasets?|raw|benchmarks?)\//i.test(a.path)) || b.size - a.size);
  return files.slice(0, 10).map((item: any) => ({
    dataset, source: "github" as const, title: `${owner}/${name}: ${item.path}`, pageUrl: `https://github.com/${owner}/${name}/blob/${branch}/${item.path}`,
    url: `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${item.path}`, filename: safeFilename(item.path), bytes: item.size,
  }));
}

async function fromZenodo(dataset: string, id: string, signal?: AbortSignal): Promise<Omit<DatasetCandidate, "id">[]> {
  const record = await getJson(`https://zenodo.org/api/records/${encodeURIComponent(id)}`, signal);
  return (record?.files ?? []).filter((file: any) => file.size <= DATA_LIMITS.maxFileBytes).slice(0, 10).map((file: any) => ({
    dataset, source: "zenodo" as const, title: `${record?.metadata?.title ?? `Zenodo ${id}`}: ${file.key}`, pageUrl: `https://zenodo.org/records/${id}`,
    url: file.links?.self, filename: safeFilename(file.key), bytes: file.size,
  })).filter((file: any) => file.url);
}

/** Turns one link from a paper or README into concrete file candidates. */
export async function candidatesFromUrl(dataset: string, raw: string, signal?: AbortSignal): Promise<Omit<DatasetCandidate, "id">[]> {
  const url = safeHttpsUrl(raw);
  if (!url) return [];
  const host = url.hostname.replace(/^www\./, "");
  if (host === "github.com") return fromGitHub(dataset, url, signal);
  if (host === "huggingface.co" && url.pathname.startsWith("/datasets/")) return huggingFaceFiles(dataset, url.pathname.split("/").slice(2, 4).join("/"), signal);
  const zenodo = host === "zenodo.org" && url.pathname.match(/\/records?\/(\d+)/);
  if (zenodo) return fromZenodo(dataset, zenodo[1], signal);
  const openml = host.endsWith("openml.org") && url.pathname.match(/\/d\/(\d+)/);
  if (openml) {
    const description = (await getJson(`https://www.openml.org/api/v1/json/data/${openml[1]}`, signal))?.data_set_description;
    const file = description?.parquet_url || description?.url;
    return file ? [{ dataset, source: "openml", title: `${description.name} (OpenML #${openml[1]})`, pageUrl: url.toString(), url: file, filename: `${safeFilename(description.name)}.${description.parquet_url ? "parquet" : "arff"}` }] : [];
  }
  if (DATA_EXTENSIONS.test(url.pathname)) return [{ dataset, source: "url", title: `${host}${url.pathname}`, pageUrl: url.toString(), url: url.toString(), filename: safeFilename(url.pathname) }];
  return [];
}

/** Searches every source for each requested dataset. Failures of one source never stop the others. */
export async function searchDatasets(requests: DatasetRequest[], context: { paperText: string; repositoryUrl?: string }, signal?: AbortSignal) {
  const paperRepos = extractUrls(context.paperText).filter(url => /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(url)).slice(0, 2);
  const byDataset: Record<string, DatasetCandidate[]> = {};
  for (const request of requests.slice(0, 4)) {
    const found: Omit<DatasetCandidate, "id">[] = [];
    const links = [...request.urls, ...(request.urls.length ? [] : [context.repositoryUrl, ...paperRepos].filter((url): url is string => Boolean(url)))];
    for (const link of [...new Set(links)].slice(0, 6)) { try { found.push(...await candidatesFromUrl(request.name, link, signal)); } catch { /* Try other sources. */ } }
    for (const query of [...new Set(request.queries)].slice(0, 3)) {
      try { found.push(...await fromOpenML(request.name, query, signal)); } catch { /* Try other sources. */ }
      try { found.push(...await fromHuggingFace(request.name, query, signal)); } catch { /* Try other sources. */ }
    }
    const unique = [...new Map(found.map(item => [item.url, item])).values()].slice(0, DATA_LIMITS.maxCandidatesPerDataset);
    byDataset[request.name] = unique.map((item, index) => ({ ...item, id: `${slug(request.name)}-${index + 1}` }));
  }
  return byDataset;
}

/** Follows redirects from the backend so the sandbox can be allowed to reach exactly the final host. */
export async function resolveDownload(raw: string, signal?: AbortSignal): Promise<{ url: string; bytes?: number }> {
  let current = safeHttpsUrl(raw);
  for (let hop = 0; current && hop < 6; hop++) {
    const options = { redirect: "manual" as const, headers: { "User-Agent": USER_AGENT }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) };
    let response = await fetch(current, { ...options, method: "HEAD" });
    if (response.status === 405 || response.status === 403) response = await fetch(current, { ...options, method: "GET", headers: { ...options.headers, Range: "bytes=0-0" } });
    await response.body?.cancel().catch(() => {});
    if ([301, 302, 303, 307, 308].includes(response.status)) { current = safeHttpsUrl(new URL(response.headers.get("location") ?? "", current).toString()); continue; }
    if (!response.ok) throw new Error(`The data file returned HTTP ${response.status}.`);
    if (/text\/html/i.test(response.headers.get("content-type") ?? "")) throw new Error("The link points to a web page, not a data file.");
    const range = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
    const bytes = Number(range ?? response.headers.get("content-length"));
    return { url: current.toString(), bytes: Number.isFinite(bytes) && bytes > 1 ? bytes : undefined };
  }
  throw new Error("The data link redirected too many times or to an unsafe address.");
}

/** Short text list of candidates for the agent to choose from. */
export function describeCandidates(byDataset: Record<string, DatasetCandidate[]>) {
  return Object.entries(byDataset).map(([dataset, candidates]) => `Dataset "${dataset}":\n${candidates.length ? candidates.map(candidate => `  [${candidate.id}] ${candidate.source}: ${candidate.title}${candidate.bytes ? `, ${(candidate.bytes / 1e6).toFixed(1)} MB` : ""}${candidate.detail ? `, ${candidate.detail}` : ""} (${candidate.pageUrl})`).join("\n") : "  No candidates were found."}`).join("\n\n");
}

export const datasetSlug = slug;
