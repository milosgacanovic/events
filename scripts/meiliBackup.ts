import fs from "node:fs";
import path from "node:path";

import { MeiliSearch } from "meilisearch";

const meiliUrl = process.env.MEILI_URL ?? "http://localhost:17700";
const meiliMasterKey = process.env.MEILI_MASTER_KEY ?? "change_me";
const indexUid = "event_occurrences";
const pageSize = 1000;

async function main() {
  const client = new MeiliSearch({
    host: meiliUrl,
    apiKey: meiliMasterKey,
  });
  const index = client.index(indexUid);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.resolve(process.cwd(), "backups");
  await fs.promises.mkdir(backupDir, { recursive: true });
  const outputPath = path.join(backupDir, `meili_occurrences_${timestamp}.json`);
  const stream = fs.createWriteStream(outputPath, { encoding: "utf8" });

  try {
    stream.write("[");
    let offset = 0;
    let total = 0;
    let first = true;

    while (true) {
      const page = await index.getDocuments<Record<string, unknown>>({
        offset,
        limit: pageSize,
      });
      if (!page.results.length) {
        break;
      }

      for (const doc of page.results) {
        if (!first) {
          stream.write(",\n");
        }
        stream.write(JSON.stringify(doc));
        first = false;
        total += 1;
      }

      offset += page.results.length;
      if (page.results.length < pageSize) {
        break;
      }
    }

    stream.write("]\n");
    await new Promise<void>((resolve, reject) => {
      stream.end(() => resolve());
      stream.on("error", reject);
    });

    console.log(JSON.stringify({
      backup_file: outputPath,
      total_documents: total,
    }, null, 2));
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
