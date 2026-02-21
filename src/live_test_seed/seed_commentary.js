import data from "./commentary_data.json" with { type: "json" };

const API_URL = "http://localhost:8000/commentary"; // ← update to your endpoint

function stripNulls(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== null && v !== undefined)
  );
}

async function seed() {
  let success = 0;

  for (const item of data) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stripNulls(item)),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status} — ${body}`);
      }

      console.log(`✓ [${++success}/${data.length}] ${item.message.slice(0, 60)}`);
    } catch (err) {
      console.error(`✗ Failed on: "${item.message.slice(0, 60)}"`);
      console.error(`  Error: ${err.cause?.message ?? err.message}`);
      console.error(`\n  ⚠ Stopping early — fix the issue above and re-run.\n`);
      break;
    }
  }

  console.log(`Done: ${success}/${data.length} records inserted.`);
}

seed();