import type { Request, Response } from "express";
import { Webhook } from "standardwebhooks";
import type { AgreementStatus, Agreements } from "./db.ts";

interface SignatureAPIEvent {
  id: string;
  type: string;
  timestamp: string;
  data: { envelope_id?: string; object_id: string; object_type: string };
}

// Event type → final agreement status. Add an entry to react to another event.
const STATUS_BY_EVENT: Record<string, Exclude<AgreementStatus, "sent">> = {
  "envelope.completed": "completed",
  "recipient.rejected": "rejected",
  "envelope.failed": "failed",
  "envelope.canceled": "canceled",
};

/**
 * POST /webhooks/signatureapi. Must be mounted with `express.raw()`: the
 * signature covers the exact request bytes, so the body cannot be parsed first.
 */
export function webhookHandler(agreements: Agreements) {
  return (req: Request, res: Response) => {
    const secret = process.env.SIGNATUREAPI_WEBHOOK_SECRET;
    if (!secret) {
      console.error("SIGNATUREAPI_WEBHOOK_SECRET is not set. Run `npx --yes signatureapi listen` to write it to .env.");
      res.sendStatus(500);
      return;
    }

    let event: SignatureAPIEvent;
    try {
      event = new Webhook(secret).verify(req.body, req.headers as Record<string, string>) as SignatureAPIEvent;
    } catch {
      res.sendStatus(401);
      return;
    }

    const status = STATUS_BY_EVENT[event.type];
    // Unknown envelopes and other event types are acknowledged and ignored.
    if (status && event.data.envelope_id) agreements.finish(event.data.envelope_id, status);
    res.sendStatus(204);
  };
}
