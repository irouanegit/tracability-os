# GitHub Releases updater

This project is prepared for Tauri's updater plugin with GitHub Releases as the update host.

## Current GitHub setup

- Repository: `https://github.com/Irouane4/tracability-os`
- Local `origin`: `https://github.com/Irouane4/tracability-os.git`
- Updater endpoint configured in `src-tauri/tauri.conf.json`:

```json
"https://github.com/Irouane4/tracability-os/releases/latest/download/latest.json"
```

This GitHub Actions secret is already configured:

```text
TAURI_SIGNING_PRIVATE_KEY
```

Its value must be the full content of:

```text
C:\Users\user\.tauri\tracability-os.key
```

`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` can stay empty because the generated local key has no password.

Important: do not commit `C:\Users\user\.tauri\tracability-os.key`. Keep a backup in a safe place. If this private key is lost, installed apps will not trust future updates signed by a different key.

## Publishing a new update

1. Bump the app version in the project version files.
2. Commit and push the changes.
3. Create and push a tag matching the workflow trigger:

```powershell
git tag app-v0.1.21
git push origin app-v0.1.21
```

The workflow at `.github/workflows/release.yml` builds the Windows NSIS installer, signs the updater artifact, uploads release assets, and publishes `latest.json`.

## Local signed build

For a local release build with updater artifacts:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH="C:\Users\user\.tauri\tracability-os.key"
npm.cmd run tauri build
```

The Windows updater signature is generated next to the installer under:

```text
src-tauri\target\release\bundle\nsis
```
