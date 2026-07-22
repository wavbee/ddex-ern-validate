# ddex-ern-validate

A small, stateless HTTP service that parses and validates [DDEX](https://ddex.net)
**ERN** (Electronic Release Notification) `NewReleaseMessage` payloads. It is the
pre-delivery quality-control step for release metadata: catch malformed or
non-conformant ERN *before* it is delivered to a store.

Built by **wavbee** for its release-QC pipeline, and open-sourced (MIT) because the
ERN tooling ecosystem is thin. This repository is the **skeleton stage** — a working
parse/validate endpoint, with the deeper validation layers stubbed out on an honest
roadmap (see below).

## Supported ERN versions

| Version | Status |
|---|---|
| **ERN 4.3.x** | Primary target |
| **ERN 3.8.2** | Legacy target |
| Other ERN (4.2, 4.1, 3.8.x, 3.7.x …) | Detected and reported, but outside validated scope |

Version and message type are sniffed directly from the document
(`MessageSchemaVersionId` / the `ddex.net` namespace), so they are reported even for
documents the structural parser rejects.

## Four-layer validation roadmap

The service is designed as a cheapest-first cascade. Today it ships Layer 1 plus a
structural parse; the remaining layers are stubbed and reported in every response as
`layers_pending` so integrators can see the roadmap honestly.

| Layer | What it checks | Status |
|---|---|---|
| **1. XML well-formedness** | Is it valid, parseable XML? | **Shipped** (`fast-xml-parser`) |
| **1b. Structural parse** | Parse to a release/resource summary; surface missing-required-field errors | **Shipped** ([ddex-parser](https://www.npmjs.com/package/ddex-parser), the DDEX Suite Rust core) |
| **2. XSD schema validity** | Conformance to the ERN XSD for the detected version | Planned |
| **3. Profile Schematron** | Per-profile business rules (Audio / Video / Image profile conformance) | Planned |
| **4. Cross-asset integrity** | Every `ResourceList` reference resolves; ISRC/UPC check-digits & uniqueness; deal territory/date sanity; declared-vs-actual audio consistency | Planned |

## API

### `POST /validate`

Send raw ERN XML with `Content-Type: application/xml` (or `text/xml`). Body limit is
~50 MB.

Response (`200 OK`):

```json
{
  "well_formed": true,
  "ern_version": "4.3",
  "message_type": "NewReleaseMessage",
  "parsed": {
    "release_count": 1,
    "resource_count": 1,
    "track_count": 0,
    "deal_count": 0,
    "message_id": "MSG00000001"
  },
  "errors": [],
  "layers_run": ["xml", "parser"],
  "layers_pending": ["xsd", "schematron", "cross_asset"]
}
```

Field notes:

- `well_formed` — `false` if the body is empty or not parseable XML; `parsed` is then
  `null` and the reason is in `errors` at `layer: "xml"`.
- `ern_version` — `"4.3"`, `"3.8.2"`, another detected dotted version, or `null`.
- `message_type` — e.g. `"NewReleaseMessage"`, or `null` if not an ERN message.
- `parsed` — release/resource summary when the structural parse succeeds, else `null`.
- `errors[]` — `{ "layer": "xml" | "schema" | "parser", "message": "...", "line"?: 12 }`.
- `layers_run` / `layers_pending` — which validation layers actually ran vs. which are
  on the roadmap.

An unsupported `Content-Type` returns `415`.

### `GET /healthz`

Liveness probe. Returns `200 { "status": "ok" }`.

### curl example

```bash
curl -sS -X POST \
  -H 'Content-Type: application/xml' \
  --data-binary @release.xml \
  http://localhost:3000/validate
```

## Run it

Requires **Node.js 24+**.

```bash
npm ci
npm start          # listens on 0.0.0.0:3000 (override with PORT / HOST)
npm test           # node:test suite
```

## Docker quickstart

```bash
docker build -t ddex-ern-validate .
docker run --rm -p 3000:3000 ddex-ern-validate
curl -sS http://localhost:3000/healthz
```

The image is Node 24 on Debian slim, runs as a non-root user, and declares a
`HEALTHCHECK`. It is built for **linux/amd64**: `ddex-parser` ships a prebuilt native
binary for `linux-x64-gnu` (and `darwin-arm64`) but not `linux-arm64`. On an
unsupported architecture the service still boots and serves Layer 1 — the structural
parser reports itself unavailable rather than crashing the process.

## Credits

- [**DDEX**](https://ddex.net) — the standards body behind ERN, MEAD, PIE and the rest
  of the digital-supply-chain standards this service validates against.
- [**ddex-suite / ddex-parser**](https://www.npmjs.com/package/ddex-parser) — the
  Rust-core DDEX parser with native Node bindings that powers the structural-parse layer.

## License

[MIT](LICENSE) © 2026 wavbee
