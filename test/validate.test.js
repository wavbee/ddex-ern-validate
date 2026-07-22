import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildApp } from "../src/app.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const fixture = (name) => readFileSync(join(FIXTURES, name), "utf8");

let app;

before(async () => {
  app = buildApp();
  await app.ready();
});

after(async () => {
  await app.close();
});

function postXml(payload, contentType = "application/xml") {
  return app.inject({
    method: "POST",
    url: "/validate",
    headers: { "content-type": contentType },
    payload,
  });
}

test("GET /healthz returns ok", async () => {
  const res = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok" });
});

test("POST /validate accepts a well-formed ERN 4.3 NewReleaseMessage", async () => {
  const res = await postXml(fixture("ern-4.3-newrelease.xml"));
  assert.equal(res.statusCode, 200);
  const body = res.json();

  assert.equal(body.well_formed, true);
  assert.equal(body.ern_version, "4.3");
  assert.equal(body.message_type, "NewReleaseMessage");
  assert.deepEqual(body.errors, []);

  assert.ok(body.parsed, "parser summary present");
  assert.equal(body.parsed.release_count, 1);
  assert.equal(body.parsed.resource_count, 1);
  assert.equal(body.parsed.message_id, "MSG00000001");

  assert.deepEqual(body.layers_run, ["xml", "parser"]);
  assert.deepEqual(body.layers_pending, ["xsd", "schematron", "cross_asset"]);
});

test("POST /validate detects an ERN 3.8.2 legacy NewReleaseMessage", async () => {
  const res = await postXml(fixture("ern-3.8.2-newrelease.xml"), "text/xml");
  assert.equal(res.statusCode, 200);
  const body = res.json();

  assert.equal(body.well_formed, true);
  assert.equal(body.ern_version, "3.8.2");
  assert.equal(body.message_type, "NewReleaseMessage");
  assert.deepEqual(body.errors, []);
  assert.ok(body.parsed, "parser summary present");
  assert.equal(body.parsed.release_count, 1);
  assert.equal(body.parsed.resource_count, 1);
});

test("POST /validate flags malformed XML at the xml layer", async () => {
  const res = await postXml(fixture("malformed.xml"));
  assert.equal(res.statusCode, 200);
  const body = res.json();

  assert.equal(body.well_formed, false);
  assert.equal(body.parsed, null);
  assert.equal(body.errors.length, 1);
  assert.equal(body.errors[0].layer, "xml");
  assert.equal(typeof body.errors[0].line, "number");
  // The parser layer must not run once well-formedness fails.
  assert.deepEqual(body.layers_run, ["xml"]);
});

test("POST /validate handles an empty body", async () => {
  const res = await postXml("");
  assert.equal(res.statusCode, 200);
  const body = res.json();

  assert.equal(body.well_formed, false);
  assert.equal(body.parsed, null);
  assert.equal(body.errors[0].layer, "xml");
  assert.match(body.errors[0].message, /empty/i);
});

test("POST /validate rejects a non-XML content type with 415", async () => {
  const res = await postXml("{}", "application/json");
  assert.equal(res.statusCode, 415);
});
