import { createClient } from "@supabase/supabase-js";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const checkConfig = args.has("--check-config");
const root = process.cwd();

const packageJsonPath = path.join(root, "package.json");
const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
const localEnv = {
  ...(await readEnvFile(path.join(root, ".env.local"))),
  ...(await readEnvFile(path.join(root, ".env.release"))),
};

const version = getArgValue("--version") ?? packageJson.version;
const productName = tauriConfig.productName ?? "Tracability OS";
const repo = getArgValue("--repo") ?? process.env.GITHUB_RELEASE_REPO ?? localEnv.GITHUB_RELEASE_REPO ?? "irouanegit/tracability-os";
const tag = getArgValue("--tag") ?? process.env.GITHUB_RELEASE_TAG ?? `app-v${version}`;
const notes = process.env.RELEASE_NOTES ?? localEnv.RELEASE_NOTES ?? `${productName} ${version}`;
const bucket = process.env.SUPABASE_RELEASE_BUCKET ?? localEnv.SUPABASE_RELEASE_BUCKET ?? "app-releases";
const releasePrefix = trimSlashes(process.env.SUPABASE_RELEASE_PREFIX ?? localEnv.SUPABASE_RELEASE_PREFIX ?? "");
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? localEnv.SUPABASE_URL ?? localEnv.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY;

const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
const installerName = `${productName}_${version}_x64-setup.exe`;
const githubInstallerAssetName = githubAssetName(installerName);
const installerPath = path.join(bundleDir, installerName);
const signaturePath = `${installerPath}.sig`;
const latestObjectPath = joinObjectPath(releasePrefix, "latest.json");
const publicInstallerUrl = githubReleaseAssetUrl(repo, tag, githubInstallerAssetName);

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL or VITE_SUPABASE_URL. The script also checks .env.local and .env.release.");
}

if (checkConfig) {
  console.log("Supabase-to-GitHub bridge configuration is ready.");
  console.log(`Supabase latest.json: ${publicStorageUrl(supabaseUrl, bucket, latestObjectPath)}`);
  console.log(`GitHub installer URL: ${publicInstallerUrl}`);
  console.log(`Service role key: ${serviceRoleKey ? "present" : "not set; required only for upload"}`);
  process.exit(0);
}

await assertFile(installerPath, "Missing installer. Build it first with: npm.cmd run release:build:signed");
await assertFile(signaturePath, [
  "Missing updater signature. Build a signed release first:",
  "npm.cmd run release:build:signed",
].join("\n"));

const signature = (await readFile(signaturePath, "utf8")).trim();
if (!signature) {
  throw new Error(`Signature file is empty: ${signaturePath}`);
}

const latestJson = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: publicInstallerUrl,
    },
  },
};

if (dryRun) {
  console.log("Supabase-to-GitHub bridge dry run");
  console.log(`Supabase latest.json object: ${latestObjectPath}`);
  console.log(`Supabase latest.json URL: ${publicStorageUrl(supabaseUrl, bucket, latestObjectPath)}`);
  console.log(`GitHub installer URL: ${publicInstallerUrl}`);
  console.log(JSON.stringify(latestJson, null, 2));
  process.exit(0);
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY. This bridge uploads only latest.json, never the installer.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

await uploadObject(supabase, bucket, latestObjectPath, Buffer.from(`${JSON.stringify(latestJson, null, 2)}\n`), "application/json; charset=utf-8");

console.log(`Published Supabase bridge latest.json for ${productName} ${version}.`);
console.log(`latest.json: ${publicStorageUrl(supabaseUrl, bucket, latestObjectPath)}`);
console.log(`installer: ${publicInstallerUrl}`);

function getArgValue(name) {
  const prefix = `${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : undefined;
}

async function assertFile(filePath, hint) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      throw new Error(`${filePath} is not a file.`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${hint}\nExpected file: ${filePath}`);
    }
    throw error;
  }
}

async function uploadObject(client, bucketName, objectPath, body, contentType) {
  const { error } = await client.storage.from(bucketName).upload(objectPath, body, {
    cacheControl: "60",
    contentType,
    upsert: true,
  });

  if (error) {
    throw new Error(`Upload failed for ${objectPath}: ${error.message}`);
  }
}

function githubReleaseAssetUrl(repoName, releaseTag, assetName) {
  return `https://github.com/${repoName}/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(assetName)}`;
}

function githubAssetName(fileName) {
  return fileName.replace(/\s+/g, ".");
}

function publicStorageUrl(baseUrl, bucketName, objectPath) {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucketName)}/${encodedPath}`;
}

function joinObjectPath(...parts) {
  return parts.filter(Boolean).map(trimSlashes).filter(Boolean).join("/");
}

function trimSlashes(value) {
  return String(value).replace(/^\/+|\/+$/g, "");
}

async function readEnvFile(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const separatorIndex = line.indexOf("=");
          const key = line.slice(0, separatorIndex).trim();
          const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
          return [key, value];
        }),
    );
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}
