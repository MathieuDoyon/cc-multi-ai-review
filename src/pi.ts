import { spawn } from "node:child_process";
import type { PiInvocation, PiResult, PiRunner } from "./types.js";

export function buildPiArgs(invocation: Pick<PiInvocation, "model" | "thinking">): string[] {
  const args = ["--print", "--model", invocation.model];
  if (invocation.thinking) args.push("--thinking", invocation.thinking);
  return args;
}

export function createPiRunner(options: { timeoutMs?: number; command?: string } = {}): PiRunner {
  const timeoutMs = options.timeoutMs ?? 240_000;
  const command = options.command ?? "pi";

  return (invocation) =>
    new Promise<PiResult>((resolve) => {
      const child = spawn(command, buildPiArgs(invocation), { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ model: invocation.model, ok: false, reason: `Timed out after ${timeoutMs}ms` });
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({ model: invocation.model, ok: false, reason: error.message });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && stdout.trim().length > 0) {
          resolve({ model: invocation.model, ok: true, stdout });
        } else {
          resolve({ model: invocation.model, ok: false, reason: stderr.trim() || `pi exited with code ${code}` });
        }
      });

      child.stdin.on("error", () => {
        // A stdin write failure (e.g. EPIPE when the child exits before
        // reading a large prompt) is always followed by the child's
        // "close" event, which already resolves the result based on exit
        // code / stdout. Swallow the stream error so it doesn't surface
        // as an unhandled 'error' event and crash the process.
      });
      child.stdin.end(invocation.prompt);
    });
}
