import { parseArgs as parseNodeArgs } from "node:util";
import { diagnose, renderReport } from "./doctor.ts";
import { homes, type Homes } from "./sources.ts";

// pstack-flex addition. Entry point for `pstack-monitor`.

const HELP = `Usage: pstack-monitor <command> [options]

Commands:
  doctor [--hours <n>]   Index recent transcripts headlessly and report how well
                         each source parsed. Prints counts, never content.

Options:
  --hours <n>            How far back to index (default 24).
  -h, --help             Show this help.
`;

export interface Io {
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
}

const defaultIo: Io = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

class UsageError extends Error {}

interface Options {
  readonly command: "doctor" | "help";
  readonly hours: number;
}

export function parseArgs(argv: readonly string[]): Options {
  let parsed: ReturnType<typeof parseNodeArgs>;
  try {
    parsed = parseNodeArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        hours: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
  const command = parsed.positionals[0];
  if (parsed.values.help === true || command === undefined || command === "help") {
    return { command: "help", hours: 24 };
  }
  if (command !== "doctor") throw new UsageError(`unknown command: ${command}`);
  const rawHours = parsed.values.hours;
  const hours = typeof rawHours === "string" ? Number(rawHours) : 24;
  if (!Number.isFinite(hours) || hours <= 0) throw new UsageError("--hours must be a number greater than zero");
  return { command, hours };
}

export async function main(
  argv: readonly string[],
  io: Io = defaultIo,
  where: Homes = homes(),
): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    io.stderr(`error: ${error instanceof Error ? error.message : String(error)}\n${HELP}`);
    return 64;
  }
  switch (options.command) {
    case "help":
      io.stdout(HELP);
      return 0;
    case "doctor": {
      const report = await diagnose(where, Date.now() - options.hours * 3_600_000);
      io.stdout(renderReport(report, options.hours));
      return report.health.some((source) => source.state !== "ok") ? 1 : 0;
    }
  }
}
