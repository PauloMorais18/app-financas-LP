import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "client", "dist");
const destination = resolve(root, "dist");

if (!existsSync(source)) {
  throw new Error(`Saída do frontend não encontrada em ${source}`);
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });
console.log("Saída do Vercel preparada em dist.");
