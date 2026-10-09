import { DatabaseSync } from "node:sqlite";

export type AgreementStatus = "sent" | "completed" | "rejected" | "failed" | "canceled";

export interface Agreement {
  id: number;
  signer_name: string;
  signer_email: string;
  envelope_id: string | null;
  status: AgreementStatus;
  created_at: string;
  updated_at: string;
}

/** Opens the SQLite database and creates the schema if it does not exist yet. */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS agreements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signer_name TEXT NOT NULL,
      signer_email TEXT NOT NULL,
      envelope_id TEXT UNIQUE,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}

/** The `Agreement` model: every query the app runs against the `agreements` table. */
export class Agreements {
  db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  all(): Agreement[] {
    return this.db.prepare("SELECT * FROM agreements ORDER BY id DESC").all() as unknown as Agreement[];
  }

  find(id: number): Agreement | undefined {
    return this.db.prepare("SELECT * FROM agreements WHERE id = ?").get(id) as unknown as Agreement | undefined;
  }

  create(signerName: string, signerEmail: string): Agreement {
    const now = new Date().toISOString();
    return this.db
      .prepare(
        "INSERT INTO agreements (signer_name, signer_email, status, created_at, updated_at) VALUES (?, ?, 'sent', ?, ?) RETURNING *",
      )
      .get(signerName, signerEmail, now, now) as unknown as Agreement;
  }

  setEnvelopeId(id: number, envelopeId: string): void {
    this.db
      .prepare("UPDATE agreements SET envelope_id = ?, updated_at = ? WHERE id = ?")
      .run(envelopeId, new Date().toISOString(), id);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM agreements WHERE id = ?").run(id);
  }

  /**
   * Moves a `sent` agreement to a final status. Final statuses never change
   * again, so a late or repeated webhook is a harmless no-op.
   */
  finish(envelopeId: string, status: Exclude<AgreementStatus, "sent">): void {
    this.db
      .prepare("UPDATE agreements SET status = ?, updated_at = ? WHERE envelope_id = ? AND status = 'sent'")
      .run(status, new Date().toISOString(), envelopeId);
  }
}
