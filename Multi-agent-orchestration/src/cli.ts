import "dotenv/config";
import readline from "readline";
import { orchestrate } from "./orchestrator";

async function runOrchestrator(
  query: string,
  userId: string
): Promise<string> {
  const result = await orchestrate(query, userId);
  return result.response;
}

function exitAfterStdout(
  message: string,
  exitCode: number
): void {
  process.stdout.write(`${message}\n`, () => {
    process.exit(exitCode);
  });
}

function exitAfterStderr(
  message: string,
  exitCode: number
): void {
  process.stderr.write(`${message}\n`, () => {
    process.exit(exitCode);
  });
}

async function runOneShot(
  query: string,
  userId: string
): Promise<void> {
  try {
    const response = await runOrchestrator(query, userId);
    exitAfterStdout(response, 0);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    exitAfterStderr(
      `Multi-agent orchestration failed:\n${message}`,
      1
    );
  }
}

async function runInteractive(
  userId: string
): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Multi-agent orchestrator is ready.");
  console.log("Type 'exit' to quit.");

  const askQuestion = () => {
    rl.question("\nYou: ", async (query) => {
      const trimmedQuery = query.trim();

      if (trimmedQuery.toLowerCase() === "exit") {
        rl.close();
        return;
      }

      if (!trimmedQuery) {
        askQuestion();
        return;
      }

      try {
        const response = await runOrchestrator(
          trimmedQuery,
          userId
        );

        console.log("\nAgent:");
        console.log(response);
      } catch (error) {
        console.error("\nMulti-agent orchestration failed:");

        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error(error);
        }
      }

      askQuestion();
    });
  };

  askQuestion();
}

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();

  const userId =
    process.env.OPENCLAW_USER_ID?.trim() ||
    "openclaw-user";

  if (query) {
    await runOneShot(query, userId);
    return;
  }

  await runInteractive(userId);
}

main();
