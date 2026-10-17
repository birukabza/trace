import { ChevronDown } from "lucide-react";
import { RESEARCH_LIMITS } from "@/lib/capabilities";

const characters = (value: number) => value.toLocaleString("en-US");

export function ResearchScope() {
  return <section className="research-scope" aria-label="What Trace can investigate">
    <p className="research-scope-title">One paper. One focused experiment.</p>
    <p className="research-scope-caption">Trace writes, runs, and repairs the code automatically.</p>
    <details className="product-disclosure">
      <summary>What can Trace verify?<ChevronDown size={13} aria-hidden="true" /></summary>
      <div className="product-disclosure-body">
        <p>Small numerical studies: a mathematical component, an algorithm comparison, or a reduced experiment using NumPy. Trace measures the experiment we describe. A successful script alone does not establish a scientific claim or verify every result in the paper.</p>
        <dl className="research-boundaries">
          <div><dt>What Trace reads</dt><dd>An arXiv paper as HTML or PDF, up to {RESEARCH_LIMITS.sourceBytes / 1_000_000} MB per download and the first {characters(RESEARCH_LIMITS.sourceCharacters)} extracted characters. This is a text limit, not a page limit.</dd></div>
          <div><dt>With an author repository</dt><dd>Up to {characters(RESEARCH_LIMITS.paperWithRepositoryCharacters)} paper characters plus {characters(RESEARCH_LIMITS.repositoryCharacters)} characters from a public GitHub README. Trace uses the README as context; it does not clone or run the author’s repository.</dd></div>
          <div><dt>What runs</dt><dd>Generated numerical Python, with up to {RESEARCH_LIMITS.executionSeconds} seconds per attempt and {RESEARCH_LIMITS.maxAttempts} attempts in total. When code fails, Trace can inspect the error, edit it, and try again.</dd></div>
          <div><dt>What needs a larger study</dt><dd>GPU training, large dataset experiments, and large model inference. Trace does not promise a full benchmark reproduction; the result states the scope and its limitations.</dd></div>
        </dl>
      </div>
    </details>
  </section>;
}
