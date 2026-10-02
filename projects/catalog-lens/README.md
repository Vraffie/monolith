# Catalog Lens

An interactive graph and checker for product-catalogue offer packages (the XML layout used by Infonova-style billing catalogues): **offers → feature groups → charge clusters → bill types → tax**, plus up/downgrade rules, price timelines and consistency checks. Static files, no server, no dependencies; the package is read in your browser and never uploaded.

## Use it

```sh
python3 -m http.server 8091 -d site      # open http://localhost:8091
```

Open a package zip (or several at once, or the unzipped folder), or drop it on the page. **Load sample** opens a small fictional catalogue (`Nordlys Fiber`) with deliberate mistakes.

A package is often one offer cut out of a bigger repository, so things it refers to may live in other files. Those appear as dashed "elsewhere" boxes (hidden until you tick *Elsewhere*) and as notes in the checks, not as errors. Open the other zips together and the references resolve.

### Pick a folder

Load a whole repository, then type or pick a folder in the **Folder** box (it suggests every folder that holds XML). Only the files under it are analysed, and the box shows how many files that is. Matching is on whole path segments, so `offers/RBO_AIB_PLUS` selects that folder and not `RBO_AIB_PLUS_X`; a bare folder name matches at any depth; a single file path works too. Clear the box to go back to everything. Note that references to things outside the chosen folder show up as "elsewhere" boxes and notes: scope narrows what is read, it does not look things up elsewhere.

### Graph

Columns: other offers (from up/downgrade rules) · bundle offers · base offers · feature groups · charge clusters · bill types · tax.

- Click a box (or Tab + Enter): everything it depends on and everything that depends on it lights up, the rest dims; the side panel shows its details, findings, price chart and timeline, and links to related boxes.
- *Isolate* shows only the box and its neighbourhood; the search box highlights matches; the checkboxes hide columns; *Dependencies* draws feature-group `EXCLUDED` (red) and `REQUIRES` (blue) arcs.
- Drag to pan, scroll or +/− to zoom, *Fit* to reset. A red/orange/blue dot on a box means it has an error/warning/note.
- **Prices as of** (top bar) changes the amount shown on charge clusters, so you can see what a customer would pay on any date.

### Prices

Every charge with the amount in force on the chosen date, the next change (and its percentage), and timeline problems; click a row for the step chart.

### Checks

| Group | What is checked |
|---|---|
| References | tariff model, feature group, offer, charge cluster, bill type, tax type and dependency references resolve (case differences are flagged as typos; plain absences are notes because the thing may live in another file) |
| Price timelines | bad dates, empty/inverted periods, overlaps, gaps, more than one open end, price cuts and jumps of 10 % or more, timelines that end |
| Discounts | a free-months discount must cancel its parent price on every date; "…_3M_FREE" / "N_Months_Free" / "Discount_N_Months" features must have a validity period of N months |
| Up/downgrade rules | the key (`UPGRADE_a_TO_b`) matches the file name, `isUpgrade` and `offerKey`; early-termination-fee handling that differs from the rest; missing reverse rule |
| Hygiene | file name vs key, duplicate keys across files, unused clusters/bill types/groups/models, unreadable XML |

Severity: **error** = the files contradict themselves; **warn** = probable mistake; **info** = worth knowing.

`prices.csv` files in a package are ignored; the XML timelines are the source of truth.

## Command line

```sh
node tools/lens.mjs package.zip              # or an unzipped folder
node tools/lens.mjs repo/ --path=portfolio/offers/RBO_AIB_PLUS   # only that folder inside it
node tools/lens.mjs package.zip --json --min=warn   # exit code 1 on warnings too, for gating a change in CI
```

## Tests

```sh
node --test tests/*.test.mjs                 # parser, zip, CSV, prices, checks, graph model and layout
python3 -m http.server 8091 -d site &        # then, with playwright installed:
node tests/e2e.cjs                           # drives the UI: selection, isolate, search, dates, tabs, errors
CATALOG_ZIP=package.zip node --test tests/*.test.mjs   # also run against a real package
node tools/sample.mjs                        # regenerate site/data/sample.zip
```

Real packages are never committed: the tests use the generated sample.

## Limits

- The checks encode conventions seen in one catalogue (naming of free-month features, discount clusters named `*FREE*`, `UPGRADE_x_TO_y` rule keys). Where a package follows other conventions they simply find nothing; they do not know your business rules.
- Only the elements the graph needs are read; services, resources, barring and business-rule parameters are not interpreted.
- Fit-to-screen keeps boxes legible (minimum zoom 50 %), so with *Elsewhere* on a large package you pan rather than see everything at once. Dates are plain `YYYY-MM-DD`; time zones and time of day are not modelled.
- Layout is a column-by-column ordering heuristic (barycentre sweeps); edges can still cross.
