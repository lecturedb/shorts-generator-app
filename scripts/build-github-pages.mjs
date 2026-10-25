import { copyFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stagingRoot = await mkdtemp(path.join(projectRoot, ".github-pages-build-"));
const outputRoot = path.join(projectRoot, "out");
const copiedEntries = [
  "app",
  "fixtures",
  "lib",
  "public",
  "next.config.ts",
  "package.json",
  "postcss.config.mjs",
  "tsconfig.json",
];

function runNextBuild() {
  const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextCli, "build", "--webpack"], {
      cwd: stagingRoot,
      env: { ...process.env, GITHUB_PAGES: "true" },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`Next.js build stopped by ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

try {
  for (const entry of copiedEntries) {
    const source = path.join(projectRoot, entry);
    const destination = path.join(stagingRoot, entry);
    await cp(source, destination, {
      recursive: true,
      filter: (sourcePath) => {
        const relativePath = path.relative(projectRoot, sourcePath);
        return relativePath !== path.join("app", "api") &&
          !relativePath.startsWith(`${path.join("app", "api")}${path.sep}`);
      },
    });
  }
  await copyFile(
    path.join(projectRoot, "app", "github-pages-page.tsx"),
    path.join(stagingRoot, "app", "page.tsx"),
  );
  await cp(
    path.join(stagingRoot, "fixtures", "projects", "sample-project", "images"),
    path.join(stagingRoot, "public", "demo", "images"),
    { recursive: true },
  );

  const exitCode = await runNextBuild();
  if (exitCode !== 0) process.exitCode = exitCode;
  else {
    await rm(outputRoot, { recursive: true, force: true });
    await cp(path.join(stagingRoot, "out"), outputRoot, { recursive: true });
    await writeFile(path.join(outputRoot, ".nojekyll"), "");
  }
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
