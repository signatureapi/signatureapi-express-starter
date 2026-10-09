import { createApp } from "./app.ts";
import { openDatabase } from "./db.ts";

if (!process.env.SIGNATUREAPI_KEY) {
  console.error("SIGNATUREAPI_KEY is not set. Run `npx --yes signatureapi init` to write a test key to .env.");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
const app = createApp(openDatabase("agreements.sqlite"));

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
