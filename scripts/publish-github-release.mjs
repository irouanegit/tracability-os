import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
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
const title = process.env.RELEASE_TITLE ?? localEnv.RELEASE_TITLE ?? `${productName} v${version}`;
const notes = process.env.RELEASE_NOTES ?? localEnv.RELEASE_NOTES ?? `${productName} ${version}`;

const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle", "nsis");
const installerName = `${productName}_${version}_x64-setup.exe`;
const githubInstallerAssetName = githubAssetName(installerName);
const installerPath = path.join(bundleDir, installerName);
const signaturePath = `${installerPath}.sig`;
const latestAssetName = "latest.json";
const publicInstallerUrl = githubReleaseAssetUrl(repo, tag, githubInstallerAssetName);

if (!repo.includes("/")) {
  throw new Error(`Invalid GitHub repo "${repo}". Expected owner/repo, for example irouanegit/tracability-os.`);
}

if (checkConfig) {
  console.log("GitHub release configuration is ready.");
  console.log(`Repository: ${repo}`);
  console.log(`Tag: ${tag}`);
  console.log(`Updater endpoint: https://github.com/${repo}/releases/latest/download/${latestAssetName}`);
  console.log(`Installer URL: ${publicInstallerUrl}`);
  await checkGhCli();
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
  console.log("GitHub release dry run");
  console.log(`Repository: ${repo}`);
  console.log(`Tag: ${tag}`);
  console.log(`Title: ${title}`);
  console.log(`Installer: ${installerPath}`);
  console.log(`Signature: ${signaturePath}`);
  console.log(`Latest JSON asset: ${latestAssetName}`);
  console.log(`Updater endpoint: https://github.com/${repo}/releases/latest/download/${latestAssetName}`);
  console.log(JSON.stringify(latestJson, null, 2));
  process.exit(0);
}

await checkGhCli();
await assertGitHubRepo(repo);

const tempDir = await mkdtemp(path.join(tmpdir(), "tracability-release-"));
const latestJsonPath = path.join(tempDir, latestAssetName);

try {
  await writeFile(latestJsonPath, `${JSON.stringify(latestJson, null, 2)}\n`, "utf8");

  const releaseExists = await ghSucceeds(["release", "view", tag, "--repo", repo]);
  if (releaseExists) {
    await gh(["release", "edit", tag, "--repo", repo, "--title", title, "--notes", notes, "--latest"]);
    await gh([
      "release",
      "upload",
      tag,
      installerPath,
      signaturePath,
      latestJsonPath,
      "--repo",
      repo,
      "--clobber",
    ]);
  } else {
    await gh([
      "release",
      "create",
      tag,
      installerPath,
      signaturePath,
      latestJsonPath,
      "--repo",
      repo,
      "--title",
      title,
      "--notes",
      notes,
      "--latest",
    ]);
  }

  console.log(`Published ${productName} ${version} to GitHub Releases.`);
  console.log(`release: https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`);
  console.log(`latest.json: https://github.com/${repo}/releases/latest/download/${latestAssetName}`);
  console.log(`installer: ${publicInstallerUrl}`);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

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

async function checkGhCli() {
  await gh(["--version"], { quiet: true });
}

async function assertGitHubRepo(repoName) {
  try {
    await gh(["repo", "view", repoName], { quiet: true });
  } catch {
    throw new Error([
      `GitHub repository "${repoName}" was not found or gh is not authenticated.`,
      "Create the public release-hosting repository before publishing:",
      `gh repo create ${repoName} --public --add-readme --description "Tracability OS updater releases"`,
    ].join("\n"));
  }
}

async function ghSucceeds(ghArgs) {
  try {
    await gh(ghArgs, { quiet: true });
    return true;
  } catch {
    return false;
  }
}

async function gh(ghArgs, options = {}) {
  try {
    const result = await execFileAsync("gh", ghArgs, {
      cwd: root,
      maxBuffer: 1024 * 1024 * 16,
      windowsHide: true,
    });
    if (!options.quiet && result.stdout) process.stdout.write(result.stdout);
    if (!options.quiet && result.stderr) process.stderr.write(result.stderr);
    return result;
  } catch (error) {
    const details = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(details || error.message);
  }
}

function githubReleaseAssetUrl(repoName, releaseTag, assetName) {
  return `https://github.com/${repoName}/releases/download/${encodeURIComponent(releaseTag)}/${encodeURIComponent(assetName)}`;
}

function githubAssetName(fileName) {
  return fileName.replace(/\s+/g, ".");
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
