import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import { Agreements } from "./db.ts";
import type { DatabaseSync } from "node:sqlite";
import { createEnvelope, listDeliverables, SignatureAPIError, uploadDocument } from "./signatureapi.ts";
import { homePage } from "./views.ts";
import { webhookHandler } from "./webhooks.ts";

const root = join(import.meta.dirname, "..");
const samplePdf = readFileSync(join(root, "assets", "sample-agreement.pdf"));

export function createApp(db: DatabaseSync) {
  const agreements = new Agreements(db);
  const app = express();

  // Registered before any body parser: verification needs the raw bytes.
  app.post("/webhooks/signatureapi", express.raw({ type: "application/json" }), webhookHandler(agreements));

  app.use(express.static(join(root, "public")));
  app.use(express.urlencoded({ extended: false }));

  app.get("/", (_req, res) => {
    res.send(homePage({ agreements: agreements.all() }));
  });

  app.post("/agreements", async (req, res) => {
    const { signer_name: signerName, signer_email: signerEmail } = req.body as Record<string, string>;
    let agreement;
    try {
      const documentUrl = await uploadDocument(samplePdf);
      // Saved before the envelope exists so its id can go in the envelope metadata.
      agreement = agreements.create(signerName, signerEmail);
      const envelope = await createEnvelope({ agreementId: agreement.id, signerName, signerEmail, documentUrl });
      agreements.setEnvelopeId(agreement.id, envelope.id);
    } catch (error) {
      if (agreement) agreements.delete(agreement.id);
      if (!(error instanceof SignatureAPIError)) throw error;
      res.status(422).send(homePage({ agreements: agreements.all(), error: error.message }));
      return;
    }
    res.redirect(303, "/");
  });

  app.get("/agreements/:id/signed.pdf", async (req, res) => {
    const agreement = agreements.find(Number(req.params.id));
    if (!agreement?.envelope_id || agreement.status !== "completed") {
      res.status(404).type("text").send("This agreement is not completed.");
      return;
    }
    // Deliverable URLs expire after an hour, so ask for a fresh one on every download.
    const deliverable = (await listDeliverables(agreement.envelope_id)).find((d) => d.url);
    if (!deliverable?.url) {
      res.status(404).type("text").send("The signed PDF is not ready yet. Try again in a few seconds.");
      return;
    }
    res.redirect(302, deliverable.url);
  });

  return app;
}
