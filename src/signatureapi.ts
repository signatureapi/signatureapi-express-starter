// The SignatureAPI client: plain HTTP with fetch, no SDK.
// Field names follow https://spec.signatureapi.com/openapi.yaml.

const BASE_URL = "https://api.signatureapi.com/v1";

export class SignatureAPIError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SignatureAPIError";
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: BodyInit, contentType?: string): Promise<T> {
  const headers: Record<string, string> = {
    "X-API-Key": process.env.SIGNATUREAPI_KEY ?? "",
    Accept: "application/json",
  };
  if (contentType) headers["Content-Type"] = contentType;

  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body });
  if (!res.ok) {
    // Errors are RFC 9457 problem details; validation errors list each problem in `errors`.
    const problem = (await res.json().catch(() => ({}))) as { title?: string; detail?: string; errors?: string[] };
    const message = problem.errors?.join("; ") || problem.detail || problem.title || `HTTP ${res.status}`;
    throw new SignatureAPIError(message, res.status);
  }
  return (await res.json()) as T;
}

/** Uploads a PDF and returns its URL, to use as a document `url` in an envelope. */
export async function uploadDocument(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const upload = await request<{ url: string }>("POST", "/uploads", bytes, "application/pdf");
  return upload.url;
}

export interface EnvelopeInput {
  agreementId: number;
  signerName: string;
  signerEmail: string;
  documentUrl: string;
}

/**
 * Creates the envelope. The signer gets the signing link by email
 * (`email_link`, the API default), so the body sets no ceremony.
 */
export async function createEnvelope(input: EnvelopeInput): Promise<{ id: string }> {
  const body = {
    title: "Sample agreement",
    documents: [
      {
        format: "pdf",
        url: input.documentUrl,
        // Placed on the `[[signer_signature]]` placeholder in the PDF.
        places: [{ key: "signer_signature", type: "signature", recipient_key: "signer" }],
      },
    ],
    recipients: [{ type: "signer", key: "signer", name: input.signerName, email: input.signerEmail }],
    metadata: { agreement_id: String(input.agreementId) },
  };
  return request<{ id: string }>("POST", "/envelopes", JSON.stringify(body), "application/json");
}

export interface Deliverable {
  id: string;
  status: "pending" | "processing" | "generated" | "failed";
  /** Pre-signed download link. Expires after one hour, so fetch it on demand. */
  url: string | null;
}

export async function listDeliverables(envelopeId: string): Promise<Deliverable[]> {
  const list = await request<{ data: (Deliverable | null)[] }>(
    "GET",
    `/envelopes/${encodeURIComponent(envelopeId)}/deliverables`,
  );
  return list.data.filter((d): d is Deliverable => d !== null);
}
