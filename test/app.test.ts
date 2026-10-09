import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import request from "supertest";
import { Webhook } from "standardwebhooks";
import { createApp } from "../src/app.ts";
import { Agreements, openDatabase } from "../src/db.ts";

// A fixed test secret in the `whsec_<base64>` format SignatureAPI uses.
const SECRET = `whsec_${Buffer.from("test-secret-for-unit-tests-only!").toString("base64")}`;
process.env.SIGNATUREAPI_KEY = "key_test_unit";
process.env.SIGNATUREAPI_WEBHOOK_SECRET = SECRET;

type FetchCall = { url: string; init: RequestInit };

/** Replaces global fetch with canned responses, in order, and records each call. */
function mockFetch(...responses: Response[]): FetchCall[] {
  const calls: FetchCall[] = [];
  mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const res = responses.shift();
    if (!res) throw new Error(`Unexpected fetch to ${url}`);
    return res;
  });
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function signedWebhook(payload: object, secret = SECRET) {
  const body = JSON.stringify(payload);
  const id = "msg_test";
  const timestamp = new Date();
  return {
    body,
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": new Webhook(secret).sign(id, timestamp, body),
    },
  };
}

function event(type: string, envelopeId: string) {
  return {
    id: "evt_test",
    type,
    timestamp: new Date().toISOString(),
    data: { envelope_id: envelopeId, object_id: envelopeId, object_type: "envelope" },
  };
}

let agreements: Agreements;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const db = openDatabase(":memory:");
  agreements = new Agreements(db);
  app = createApp(db);
});

afterEach(() => mock.restoreAll());

function sentAgreement(envelopeId = "env_1") {
  const a = agreements.create("Ada Lovelace", "ada@example.com");
  agreements.setEnvelopeId(a.id, envelopeId);
  return a;
}

const post = (payload: ReturnType<typeof signedWebhook>) =>
  request(app).post("/webhooks/signatureapi").set(payload.headers).send(payload.body);

describe("GET /", () => {
  test("renders the form and the empty state", async () => {
    const res = await request(app).get("/").expect(200);
    assert.match(res.text, /<button type="submit">Send for signature<\/button>/);
    assert.match(res.text, /No agreements yet\./);
  });

  test("escapes signer data", async () => {
    agreements.create("<script>", "x@example.com");
    const res = await request(app).get("/").expect(200);
    assert.match(res.text, /&lt;script&gt;/);
    assert.doesNotMatch(res.text, /<script>/);
  });
});

describe("POST /agreements", () => {
  test("uploads the PDF, creates the envelope and saves the agreement", async () => {
    const calls = mockFetch(
      json({ id: "upl_1", url: "https://api.signatureapi.com/v1/uploads/upl_1" }, 201),
      json({ id: "env_123", status: "processing" }, 201),
    );

    await request(app)
      .post("/agreements")
      .type("form")
      .send({ signer_name: "Ada Lovelace", signer_email: "ada@example.com" })
      .expect(303)
      .expect("Location", "/");

    const [upload, envelope] = calls;
    assert.equal(upload.url, "https://api.signatureapi.com/v1/uploads");
    assert.equal(upload.init.method, "POST");
    const uploadHeaders = upload.init.headers as Record<string, string>;
    assert.equal(uploadHeaders["Content-Type"], "application/pdf");
    assert.equal(uploadHeaders["X-API-Key"], "key_test_unit");
    assert.equal(Buffer.from(upload.init.body as Uint8Array).subarray(0, 5).toString(), "%PDF-");

    assert.equal(envelope.url, "https://api.signatureapi.com/v1/envelopes");
    const [saved] = agreements.all();
    assert.deepEqual(JSON.parse(envelope.init.body as string), {
      title: "Sample agreement",
      documents: [
        {
          format: "pdf",
          url: "https://api.signatureapi.com/v1/uploads/upl_1",
          places: [{ key: "signer_signature", type: "signature", recipient_key: "signer" }],
        },
      ],
      recipients: [{ type: "signer", key: "signer", name: "Ada Lovelace", email: "ada@example.com" }],
      metadata: { agreement_id: String(saved.id) },
    });

    assert.equal(saved.envelope_id, "env_123");
    assert.equal(saved.status, "sent");
  });

  test("re-renders the page with the API error", async () => {
    mockFetch(
      json({ id: "upl_1", url: "https://api.signatureapi.com/v1/uploads/upl_1" }, 201),
      json(
        {
          type: "https://signatureapi.com/docs/v1/errors/validation-error",
          title: "Validation Error",
          status: 422,
          errors: ["recipients[0].email must be a valid email address"],
        },
        422,
      ),
    );

    const res = await request(app)
      .post("/agreements")
      .type("form")
      .send({ signer_name: "Ada", signer_email: "ada@example.com" })
      .expect(422);

    assert.match(res.text, /Could not create the envelope: recipients\[0\]\.email must be a valid email address/);
    assert.equal(agreements.all().length, 0);
  });
});

describe("GET /agreements/:id/signed.pdf", () => {
  test("redirects to a fresh deliverable URL", async () => {
    const a = sentAgreement("env_1");
    agreements.finish("env_1", "completed");
    const calls = mockFetch(
      json({ data: [{ id: "del_1", status: "generated", url: "https://files.example.com/signed.pdf?sig=abc" }] }),
    );

    await request(app)
      .get(`/agreements/${a.id}/signed.pdf`)
      .expect(302)
      .expect("Location", "https://files.example.com/signed.pdf?sig=abc");
    assert.equal(calls[0].url, "https://api.signatureapi.com/v1/envelopes/env_1/deliverables");
  });

  test("404 while the deliverable is not generated", async () => {
    const a = sentAgreement("env_1");
    agreements.finish("env_1", "completed");
    mockFetch(json({ data: [{ id: "del_1", status: "processing", url: null }] }));

    await request(app).get(`/agreements/${a.id}/signed.pdf`).expect(404);
  });

  test("404 for an agreement that is not completed", async () => {
    const a = sentAgreement("env_1");
    await request(app).get(`/agreements/${a.id}/signed.pdf`).expect(404);
  });
});

describe("POST /webhooks/signatureapi", () => {
  test("a verified event updates the status", async () => {
    const a = sentAgreement("env_1");
    await post(signedWebhook(event("envelope.completed", "env_1"))).expect(204);
    assert.equal(agreements.find(a.id)?.status, "completed");
  });

  test("recipient.rejected marks the agreement rejected", async () => {
    const a = sentAgreement("env_1");
    await post(signedWebhook(event("recipient.rejected", "env_1"))).expect(204);
    assert.equal(agreements.find(a.id)?.status, "rejected");
  });

  test("a bad signature is rejected with 401", async () => {
    const a = sentAgreement("env_1");
    const otherSecret = `whsec_${Buffer.from("some-other-secret-not-the-real-1").toString("base64")}`;
    await post(signedWebhook(event("envelope.completed", "env_1"), otherSecret)).expect(401);
    assert.equal(agreements.find(a.id)?.status, "sent");
  });

  test("an unsigned request is rejected with 401", async () => {
    await request(app)
      .post("/webhooks/signatureapi")
      .set("content-type", "application/json")
      .send(JSON.stringify(event("envelope.completed", "env_1")))
      .expect(401);
  });

  test("other event types are acknowledged and ignored", async () => {
    const a = sentAgreement("env_1");
    await post(signedWebhook(event("recipient.viewed", "env_1"))).expect(204);
    assert.equal(agreements.find(a.id)?.status, "sent");
  });

  test("unknown envelopes are acknowledged and ignored", async () => {
    await post(signedWebhook(event("envelope.completed", "env_unknown"))).expect(204);
  });

  test("a final status is never overwritten", async () => {
    const a = sentAgreement("env_1");
    await post(signedWebhook(event("envelope.completed", "env_1"))).expect(204);
    await post(signedWebhook(event("envelope.canceled", "env_1"))).expect(204);
    assert.equal(agreements.find(a.id)?.status, "completed");
  });
});
