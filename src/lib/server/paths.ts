import { join, resolve } from "node:path";

export function dataPath(...parts: string[]) {
  return join(resolve(process.env.TRACE_DATA_DIR || join(process.cwd(), "data")), ...parts);
}
