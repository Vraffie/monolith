# monolith

A repository for self-contained sub-projects. Each lives under `projects/` with its own README, tests and tooling; CI in `.github/workflows/` runs from the sub-project directory.

| Project | What it is |
|---|---|
| [`projects/hitchly`](projects/hitchly) | **Hitchly**: a self-hosted URL shortener with click analytics plus a browser toolbox of 42 everyday tools (zero runtime dependencies, Python 3.10+). |
| [`projects/games`](projects/games) | **Wordplay**: three daily word games that run in the browser (Nearest, Fours, Bridge), static and offline-capable. |
| [`projects/xmlgraph`](projects/xmlgraph) | **xmlgraph**: scans a repository of key-linked XML files and renders the reference graph as an interactive HTML page, Mermaid or Graphviz (zero dependencies, Python 3.10+). |
| [`projects/catalog-lens`](projects/catalog-lens) | **Catalog Lens**: interactive graph, price timelines and consistency checks for product-catalogue offer packages (XML + prices.csv). Static, runs in the browser. |

