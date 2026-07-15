import { spawn } from "node:child_process";
import type { PiInvocation, PiResult, PiRunner } from "./types.js";

export function buildPiArgs(invocation: Pick<PiInvocation, "model" | "thinking">): string[] {
  const args = ["--print", "--model", invocation.model];
  if (invocation.thinking) args.push("--thinking", invocation.thinking);
  return args;
}

export function createPiRunner(options: { timeoutMs?: number } = {}): PiRunner {
  const timeoutMs = options.timeoutMs ?? 240_000;

  return (invocation) =>
    new Promise<PiResult>((resolve) => {
      const child = spawn("pi", buildPiArgs(invocation), { stdio: ["pipe", "pipe", "pipe"] });
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

      child.stdin.end(invocation.prompt);
    });
}
