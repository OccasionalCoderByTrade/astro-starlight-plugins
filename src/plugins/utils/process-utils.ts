import { spawn } from "node:child_process";

export function execProcess(
  command: string,
  args: string[],
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(command, args);

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      reject(err);
    });

    proc.on("close", (code) => {
      resolve({ status: code ?? 1, stdout, stderr });
    });
  });
}
