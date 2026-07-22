// DDEX ERN validation core.
//
// This is the skeleton stage of a four-layer validation roadmap:
//
//   Layer 1  XML well-formedness      (implemented here — fast-xml-parser)
//   Layer 2  XSD schema validity      (pending)
//   Layer 3  profile Schematron rules (pending)
//   Layer 4  cross-asset integrity    (pending)
//
// Today we ship Layer 1 plus a structural parse via ddex-parser (the DDEX Suite
// Rust core with native Node bindings), which yields a release/resource summary and
// surfaces malformed-structure errors. Version and message-type detection is done
// directly on the raw XML so it still works when the strict parser rejects an
// incomplete-but-well-formed document.

import { XMLParser, XMLValidator } from "fast-xml-parser";
import ddexPkg from "ddex-parser";

const { DdexParser } = ddexPkg;

// ERN version tokens — from MessageSchemaVersionId="ern/43" or the ddex.net
// namespace suffix (.../ern/43) — mapped to dotted versions. ERN 4.3.x is the
// primary supported target and 3.8.2 the supported legacy target; other ERN
// versions are detected and reported honestly but fall outside validated scope.
const TOKEN_TO_VERSION = {
  43: "4.3",
  42: "4.2",
  41: "4.1",
  382: "3.8.2",
  381: "3.8.1",
  38: "3.8",
  371: "3.7.1",
  351: "3.5.1",
};

// ddex-parser reports the version as an enum like "V4_3" / "V3_8_2".
function parserVersionToDotted(v) {
  if (typeof v !== "string") return null;
  return v.replace(/^V/, "").replaceAll("_", ".");
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false,
  parseTagValue: false,
});

function localName(qname) {
  const i = qname.indexOf(":");
  return i === -1 ? qname : qname.slice(i + 1);
}

// Layer 1 — well-formedness. fast-xml-parser's validator returns the offending
// line/column on failure, which we pass through in the error object.
export function checkWellFormed(xml) {
  const result = XMLValidator.validate(xml, { allowBooleanAttributes: true });
  if (result === true) return { wellFormed: true };
  const err = result.err || {};
  return {
    wellFormed: false,
    error: { message: err.msg || "Malformed XML", line: err.line },
  };
}

// Sniff ERN version + message type straight from the XML, independent of the
// strict DDEX parser. Returns nulls when nothing recognizable is present.
export function sniff(xml) {
  let doc;
  try {
    doc = xmlParser.parse(xml);
  } catch {
    return { ernVersion: null, messageType: null };
  }

  const rootKey = Object.keys(doc).find((k) => k !== "?xml");
  if (!rootKey) return { ernVersion: null, messageType: null };

  const root = doc[rootKey] || {};
  const local = localName(rootKey);
  const messageType = local.endsWith("Message") ? local : null;

  // Version: prefer MessageSchemaVersionId, then any ddex.net ERN namespace URI.
  let token = null;
  const schemaId = root["@_MessageSchemaVersionId"];
  if (typeof schemaId === "string") {
    const m = schemaId.match(/ern\/(\d+)/i);
    if (m) token = m[1];
  }
  if (!token) {
    for (const [key, value] of Object.entries(root)) {
      if (key.startsWith("@_") && typeof value === "string") {
        const m = value.match(/ddex\.net\/xml\/ern\/(\d+)/i);
        if (m) {
          token = m[1];
          break;
        }
      }
    }
  }

  const ernVersion = token ? (TOKEN_TO_VERSION[token] ?? null) : null;
  return { ernVersion, messageType };
}

// Structural parse via ddex-parser. Returns a summary on success, or a
// parser-layer error message on failure (missing required fields, etc.).
export function parseSummary(xml) {
  try {
    const parser = new DdexParser();
    const r = parser.parseSync(xml);
    return {
      ok: true,
      version: parserVersionToDotted(r.version),
      messageType: r.messageType || null,
      summary: {
        release_count: r.releaseCount ?? (r.releases?.length ?? 0),
        resource_count:
          r.resourceCount ?? Object.keys(r.resources || {}).length,
        track_count: r.trackCount ?? 0,
        deal_count: r.dealCount ?? 0,
        message_id: r.messageId || null,
      },
    };
  } catch (e) {
    return { ok: false, error: { message: e.message } };
  }
}

// Top-level entry point: run the currently-implemented layers and assemble the
// response contract. `layers_pending` documents the roadmap honestly.
export function validateErn(xml) {
  const layers_run = [];
  const layers_pending = ["xsd", "schematron", "cross_asset"];
  const errors = [];

  const empty = typeof xml !== "string" || xml.trim().length === 0;

  // Layer 1 — XML well-formedness.
  layers_run.push("xml");
  if (empty) {
    errors.push({ layer: "xml", message: "Empty request body" });
    return baseFailure(errors, layers_run, layers_pending);
  }

  const wf = checkWellFormed(xml);
  if (!wf.wellFormed) {
    errors.push({ layer: "xml", message: wf.error.message, line: wf.error.line });
    return baseFailure(errors, layers_run, layers_pending);
  }

  // Version + message-type detection (parser-independent).
  const sniffed = sniff(xml);

  // Structural parse (ddex-parser) for the summary.
  layers_run.push("parser");
  const parsed = parseSummary(xml);
  let summary = null;
  if (parsed.ok) {
    summary = parsed.summary;
  } else {
    errors.push({ layer: "parser", message: parsed.error.message });
  }

  return {
    well_formed: true,
    ern_version: sniffed.ernVersion ?? (parsed.ok ? parsed.version : null),
    message_type: sniffed.messageType ?? (parsed.ok ? parsed.messageType : null),
    parsed: summary,
    errors,
    layers_run,
    layers_pending,
  };
}

function baseFailure(errors, layers_run, layers_pending) {
  return {
    well_formed: false,
    ern_version: null,
    message_type: null,
    parsed: null,
    errors,
    layers_run,
    layers_pending,
  };
}
