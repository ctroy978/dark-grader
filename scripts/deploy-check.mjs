#!/usr/bin/env node
/**
 * Smoke-check that a classroom pull is ready to start.
 * Run from repo root after `npm run build`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  errors.push(`Node ${process.version} — need 20+`);
}

for (const rel of [
  "packages/shared/dist/index.js",
  "server/dist/index.js",
  "client/dist/index.html",
]) {
  if (!exists(rel)) errors.push(`missing ${rel} — run npm run build`);
}

const audioDir = path.join(root, "server/data/audio");
if (!fs.existsSync(audioDir)) {
  errors.push("missing server/data/audio — combat SFX will 404");
} else {
  const mp3s = fs.readdirSync(audioDir).filter((f) => f.endsWith(".mp3"));
  if (mp3s.length < 10) {
    warnings.push(
      `only ${mp3s.length} mp3 files in server/data/audio — expected the checked-in clip set`,
    );
  }
}

const strict =
  process.env.NODE_ENV === "production" || process.argv.includes("--strict");
const envPath = path.join(root, ".env");
if (!fs.existsSync(envPath)) {
  const msg = "no repo-root .env — copy .env.example and set TEACHER_PIN";
  if (strict) errors.push(msg);
  else warnings.push(msg);
} else {
  const env = fs.readFileSync(envPath, "utf8");
  const pinLine = env.split("\n").find((l) => /^\s*TEACHER_PIN=/.test(l));
  const pin = pinLine?.split("=").slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
  if (!pin) {
    const msg = "TEACHER_PIN is not set in .env (required when NODE_ENV=production)";
    if (strict) errors.push(msg);
    else warnings.push(msg);
  } else if (pin === "teacher") {
    const msg = "TEACHER_PIN is still the default 'teacher' — pick a classroom PIN";
    if (strict) errors.push(msg);
    else warnings.push(msg);
  }
}

if (exists("client/dist/index.html")) {
  const html = fs.readFileSync(path.join(root, "client/dist/index.html"), "utf8");
  if (html.includes("/src/main.tsx")) {
    errors.push("client/dist/index.html still points at /src/main.tsx — production build failed");
  }
  if (!html.includes("/gradeforge/")) {
    errors.push(
      "client/dist was not built for /gradeforge/ — run npm run build (do not set VITE_BASE=/)",
    );
  }
}

for (const w of warnings) console.warn(`warn  ${w}`);
for (const e of errors) console.error(`error ${e}`);

if (errors.length) {
  console.error(`\n${errors.length} check(s) failed.`);
  process.exit(1);
}

console.log("GradeForge deploy check passed.");
console.log("Next: sudo systemctl restart gradeforge");
