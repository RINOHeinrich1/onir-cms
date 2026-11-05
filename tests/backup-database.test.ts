import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import { backupDatabase } from "@/infrastructure/db/backup-database";

type FakeChild = EventEmitter & { stderr: EventEmitter };

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stderr = new EventEmitter();
  return child;
}

/** Programme l'évènement du faux processus APRÈS l'attachement des listeners. */
function mockSpawn(emit: (child: FakeChild) => void): void {
  spawnMock.mockImplementation(() => {
    const child = fakeChild();
    setImmediate(() => emit(child));
    return child;
  });
}

let backupDir: string;

beforeAll(async () => {
  backupDir = await mkdtemp(join(tmpdir(), "onir-backup-test-"));
});

afterAll(async () => {
  await rm(backupDir, { recursive: true, force: true });
});

beforeEach(() => {
  spawnMock.mockReset();
  process.env.DATABASE_URL = "postgres://onir_cms:secret@127.0.0.1:5432/onir_cms_test";
  process.env.BACKUP_DIR = backupDir;
});

describe("backupDatabase — dump custom complet obligatoire", () => {
  it("lance pg_dump --format=custom --no-owner vers BACKUP_DIR", async () => {
    mockSpawn((child) => child.emit("close", 0));

    const file = await backupDatabase();

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args] = spawnMock.mock.calls[0] as [string, string[]];
    expect(command).toBe("pg_dump");
    expect(args).toContain("--format=custom");
    expect(args).toContain("--no-owner");
    expect(args).toContain("--file");
    expect(args.at(-1)).toBe("postgres://onir_cms:secret@127.0.0.1:5432/onir_cms_test");
    expect(file).toMatch(
      new RegExp(`^${backupDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/onir-cms-.+\\.dump$`),
    );
    const fileIndex = args.indexOf("--file");
    expect(args[fileIndex + 1]).toBe(file);
  });

  it("propage l'échec de pg_dump (code non nul + stderr)", async () => {
    mockSpawn((child) => {
      child.stderr.emit("data", Buffer.from("connexion refusée"));
      child.emit("close", 1);
    });

    await expect(backupDatabase()).rejects.toThrow(/pg_dump a échoué \(1\).*connexion refusée/);
  });

  it("propage une erreur de lancement du processus", async () => {
    mockSpawn((child) => child.emit("error", new Error("pg_dump introuvable")));

    await expect(backupDatabase()).rejects.toThrow(/pg_dump introuvable/);
  });
});
