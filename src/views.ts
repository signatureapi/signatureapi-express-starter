import type { Agreement } from "./db.ts";
import { html } from "./html.ts";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// `2026-10-09T15:04:05.000Z` → `2026-10-09 15:04` (UTC).
const formatDate = (iso: string) => iso.slice(0, 16).replace("T", " ");

function agreementRow(a: Agreement) {
  return html`
          <tr data-agreement-id="${a.id}" data-envelope-id="${a.envelope_id}">
            <td class="signer"><strong>${a.signer_name}</strong>${a.signer_email}</td>
            <td><span class="status status-${a.status}" data-status="${a.status}">${capitalize(a.status)}</span></td>
            <td>${formatDate(a.created_at)}</td>
            ${a.status === "completed" ? html`<td><a href="/agreements/${a.id}/signed.pdf">Signed PDF</a></td>` : ""}
          </tr>`;
}

export function homePage({ agreements, error }: { agreements: Agreement[]; error?: string }): string {
  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Send an agreement · SignatureAPI example</title>
  <link rel="stylesheet" href="/app.css">
</head>
<body>
  <main>
    <header>
      <h1>Send an agreement</h1>
      <p class="hint">A SignatureAPI e-signature API example for Express. Test mode: no emails are sent.</p>
    </header>

    <section class="card">
      <h2>New agreement</h2>
      <form method="post" action="/agreements">
        <label>Signer name <input name="signer_name" required autocomplete="off"></label>
        <label>Signer email <input name="signer_email" type="email" required autocomplete="off"></label>
        <button type="submit">Send for signature</button>
      </form>
      ${error ? html`<p class="error" role="alert">Could not create the envelope: ${error}</p>` : ""}
    </section>

    <section class="card">
      <h2>Agreements</h2>
      <table>
        <thead><tr><th>Signer</th><th>Status</th><th>Sent</th><th></th></tr></thead>
        <tbody>${
          agreements.length > 0
            ? agreements.map(agreementRow)
            : html`
          <tr><td colspan="4" class="empty">No agreements yet.</td></tr>`
        }
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>
`.toString();
}
