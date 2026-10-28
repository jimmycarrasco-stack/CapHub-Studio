#!/usr/bin/env node
// Creates .env.local with a generated APP_SECRET and ADMIN_PASSWORD.
// Safe to re-run: it never overwrites an existing .env.local.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

const target = ".env.local";
mkdirSync("data", { recursive: true });

if (existsSync(target)) {
  console.log(`${target} already exists — leaving it unchanged.`);
  process.exit(0);
}

const template = readFileSync(".env.example", "utf8");
const password = randomBytes(9).toString("base64url");
const secret = randomBytes(32).toString("base64url");

const out = template
  .replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${password}`)
  .replace(/^APP_SECRET=.*$/m, `APP_SECRET=${secret}`);

writeFileSync(target, out, { mode: 0o600 });
console.log(`Created ${target} (permissions 600).`);
console.log(`Admin password: ${password}`);
console.log("Change it any time by editing ADMIN_PASSWORD in .env.local and restarting.");
