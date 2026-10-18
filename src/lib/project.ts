// An experiment is a small Python project. It is stored as one text "bundle"
// so attempts, diffs, repairs and reports keep working on a single string.
// Code written before multi-file support has no markers and is main.py.

export type ProjectFile = { path: string; content: string };

export const ENTRYPOINT = "main.py";
export const PROJECT_LIMITS = { maxFiles: 8, maxFileBytes: 60_000, maxTotalBytes: 160_000 } as const;
const MARKER = /^# ==== file: (.+?) ====$/;
const PATH = /^[A-Za-z_][A-Za-z0-9_-]*(\/[A-Za-z_][A-Za-z0-9_-]*)*\.(py|json|txt|csv)$/;

export function bundleProject(files: ProjectFile[]): string {
  return files.map(file => `# ==== file: ${file.path} ====\n${file.content.replace(/\n+$/, "")}`).join("\n\n");
}

export function parseProject(bundle: string): ProjectFile[] {
  const lines = bundle.split("\n");
  if (!MARKER.test(lines[0] ?? "")) return [{ path: ENTRYPOINT, content: bundle }];
  const files: ProjectFile[] = [];
  for (const line of lines) {
    const match = line.match(MARKER);
    if (match) files.push({ path: match[1], content: "" });
    else files.at(-1)!.content += (files.at(-1)!.content ? "\n" : "") + line;
  }
  return files.map(file => ({ path: file.path, content: file.content.replace(/\n+$/, "") + "\n" }));
}

/** Rejects unsafe paths and oversized projects before anything reaches the sandbox. */
export function validateProject(files: ProjectFile[]): string | undefined {
  if (!files.length) return "The project has no files.";
  if (files.length > PROJECT_LIMITS.maxFiles) return `The project has ${files.length} files; the limit is ${PROJECT_LIMITS.maxFiles}.`;
  const seen = new Set<string>();
  let total = 0;
  for (const file of files) {
    if (!PATH.test(file.path) || file.path.split("/").length > 3) return `File path "${file.path}" is not allowed. Use simple relative names like model.py or utils/data.py.`;
    if (seen.has(file.path)) return `File "${file.path}" appears twice.`;
    seen.add(file.path);
    const bytes = new TextEncoder().encode(file.content).length;
    if (bytes > PROJECT_LIMITS.maxFileBytes) return `File "${file.path}" is too large.`;
    total += bytes;
  }
  if (total > PROJECT_LIMITS.maxTotalBytes) return "The project is too large.";
  if (!seen.has(ENTRYPOINT)) return `The project must include ${ENTRYPOINT} as its entry point.`;
}
