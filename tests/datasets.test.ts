import test from "node:test";
import assert from "node:assert/strict";
import { candidatesFromUrl, extractUrls, resolveDownload, safeHttpsUrl, searchDatasets } from "../src/lib/server/datasets";

test("only public HTTPS URLs are accepted for data", () => {
  assert.ok(safeHttpsUrl("https://data.openml.org/datasets/0000/0554/dataset_554.pq"));
  for (const bad of ["http://example.com/a.csv", "https://user:pw@example.com/a.csv", "https://127.0.0.1/a.csv", "https://localhost/a.csv", "https://example.com:8443/a.csv", "https://db.internal/a.csv", "ftp://example.com/a.csv"]) {
    assert.equal(safeHttpsUrl(bad), undefined, bad);
  }
});

test("links are extracted from paper text without trailing punctuation", () => {
  const urls = extractUrls("Code is at https://github.com/org/repo. Data: (https://zenodo.org/records/123), see http://insecure.org/x.");
  assert.deepEqual(urls, ["https://github.com/org/repo", "https://zenodo.org/records/123"]);
});

function stubFetch(t: test.TestContext, routes: Record<string, () => Response>) {
  return t.mock.method(globalThis, "fetch", async (input: unknown) => {
    const url = String(input);
    const route = Object.keys(routes).find(prefix => url.startsWith(prefix));
    if (!route) return new Response("not found", { status: 404 });
    return routes[route]();
  });
}

test("a GitHub repository is scanned for data files, skipping docs and code", async t => {
  stubFetch(t, {
    "https://api.github.com/repos/org/repo/git/trees/": () => Response.json({ tree: [
      { type: "blob", path: "data/train.csv", size: 5_000 },
      { type: "blob", path: "data/test.csv", size: 1_000 },
      { type: "blob", path: "docs/example.csv", size: 10 },
      { type: "blob", path: "src/model.py", size: 900 },
      { type: "blob", path: "README.md", size: 100 },
    ] }),
    "https://api.github.com/repos/org/repo": () => Response.json({ default_branch: "main" }),
  });
  const found = await candidatesFromUrl("bench", "https://github.com/org/repo");
  assert.deepEqual(found.map(item => item.url), ["https://raw.githubusercontent.com/org/repo/main/data/train.csv", "https://raw.githubusercontent.com/org/repo/main/data/test.csv"]);
  assert.equal(found[0].source, "github");
});

test("OpenML search returns the parquet file with row and column counts", async t => {
  stubFetch(t, {
    "https://www.openml.org/api/v1/json/data/list/": () => Response.json({ data: { dataset: [{ did: 554, name: "mnist_784", version: 1, quality: [{ name: "NumberOfInstances", value: "70000.0" }, { name: "NumberOfFeatures", value: "785.0" }] }] } }),
    "https://www.openml.org/api/v1/json/data/554": () => Response.json({ data_set_description: { name: "mnist_784", parquet_url: "https://data.openml.org/datasets/0000/0554/dataset_554.pq", url: "https://openml.org/data/v1/download/52667/mnist_784.arff" } }),
    "https://huggingface.co/api/datasets": () => Response.json([]),
  });
  const found = await searchDatasets([{ name: "MNIST", purpose: "benchmark", queries: ["mnist_784"], urls: [] }], { paperText: "" });
  assert.equal(found.MNIST[0].url, "https://data.openml.org/datasets/0000/0554/dataset_554.pq");
  assert.match(found.MNIST[0].detail!, /70,000 rows, 785 columns/);
  assert.equal(found.MNIST[0].id, "mnist-1");
});

test("downloads follow redirects to the final host but refuse web pages and unsafe redirects", async t => {
  let step = 0;
  stubFetch(t, {
    "https://huggingface.co/": () => new Response(null, { status: 302, headers: { location: "https://cdn.example.org/file.parquet" } }),
    "https://cdn.example.org/": () => new Response(null, { status: 200, headers: { "content-length": "2595890", "content-type": "application/octet-stream" } }),
    "https://page.example.org/": () => new Response(null, { status: 200, headers: { "content-type": "text/html" } }),
    "https://evil.example.org/": () => { step++; return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }); },
  });
  assert.deepEqual(await resolveDownload("https://huggingface.co/datasets/x/resolve/a.parquet"), { url: "https://cdn.example.org/file.parquet", bytes: 2595890 });
  await assert.rejects(resolveDownload("https://page.example.org/data"), /web page/);
  await assert.rejects(resolveDownload("https://evil.example.org/data"), /unsafe/);
  assert.equal(step, 1);
});
