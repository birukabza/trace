# Research workspace

The home page keeps its warm paper and orange sphere. The research interior
uses the dark surfaces, restrained typography, rounded panels, and quieter
navigation of the [Grok Bot reference](https://x.ai/bot).

The previous workspace repeated small labels and bordered sections without
giving the experiment a clear reading order. The new hierarchy is the source,
the hypothesis, the method, the scope boundaries, and an explicit approval.
Completed runs put measurements and limitations ahead of raw process output.
Failed runs open to their error logs.

The source rail separates inspecting a claim from approving its protocol. A
claim can be expanded to read its full text and original excerpt. On phones,
source context opens on demand so it does not push the experiment below a long
sidebar. Tabs support arrow keys, Home, and End. History supports search, and
modal focus returns to its opening control.

## Shader use

`ResearchField` composes FlowingGradient, ContourLines, and FilmGrain from
`shaders/react`. Its contour field appears across the investigation views,
planning, active execution, research history, and connection settings. Its
animation speed follows whether a run is active. It is ambient artwork, not a
plot of scientific measurements.

Offscreen fields and hidden documents stop rendering. Reduced-motion settings,
GPU unavailability, and the pause control use a static gradient fallback. The
existing spherical shader remains specific to the home page.

## Verification

The browser pass exercised existing live evidence, failed execution logs,
history filtering and its empty state, modal focus, tab keyboard navigation,
full claim/source expansion, and the review dock. A copied protocol was opened
for approval and cancelled without running another experiment.

At 390 px the source disclosure expanded and collapsed, and document width
matched the viewport with no horizontal page overflow. Pausing the research
field changed its rendered canvas count from one to zero. The desktop and
mobile captures are kept in ignored `artifacts/`.

The initialization request aborts during effect cleanup. Explicit navigation
also invalidates earlier request results and clears the loading state. This
prevents a delayed response from restoring the original investigation after
the user opens another run or returns home.
