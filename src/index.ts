import "dotenv/config";
import { runSession, collectSessionInputs, boot } from "./agents/director";

process.on("SIGINT", () => {
  console.log("\n\n👋 Studio session ended. See you next time.");
  process.exit(0);
});

async function main(): Promise<void> {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  SOCIAL MEDIA STUDIO");
  console.log("  AI-Powered Video Production Pipeline");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  try {
    boot();
    const context = await collectSessionInputs();
    await runSession(context);
  } catch (err) {
    console.error("\n✗ Fatal error:", String(err));
    process.exit(1);
  }
}

main();
