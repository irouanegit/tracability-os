# GitHub Releases updater

This project uses Tauri's updater plugin with GitHub Releases as the main update host.

## Current endpoint

New builds read update metadata from:

```text
https://github.com/irouanegit/tracability-os/releases/latest/download/latest.json
```

The `latest.json` asset points to the signed Windows installer attached to the same GitHub release.

## Repository

Target release-hosting repository:

```text
https://github.com/irouanegit/tracability-os
```

The repository must be public because Tauri updater downloads release assets without GitHub authentication.

This repository does not need to contain the app source code. It can be a small public release host with only a README and release assets.

## Required local secret

Tauri updater signatures use the local private key:

```text
C:\Users\user\.tauri\tracability-os.key
```

Do not commit this key. If it is lost, installed apps will not trust future updates signed with a different key.

## One-time GitHub setup

After authenticating the GitHub CLI as `irouanegit`, create the public release-hosting repository:

```powershell
gh auth status
gh repo create irouanegit/tracability-os --public --add-readme --description "Tracability OS updater releases"
```

Do not push the local source code unless you intentionally want the whole project source to be public.

## Publish flow

Build signed updater artifacts:

```powershell
npm.cmd run release:build:signed
```

Check what will be published:

```powershell
npm.cmd run release:github:dry-run
```

Publish the installer, signature, and `latest.json` to GitHub Releases:

```powershell
npm.cmd run release:github
```

The script creates or updates:

```text
Release tag: app-v<version>
Assets:
  Tracability OS_<version>_x64-setup.exe
  Tracability OS_<version>_x64-setup.exe.sig
  latest.json
```

## Bridge for old installed apps

Old installed builds still check the previous Supabase endpoint. To migrate them without serving the heavy installer from Supabase, publish the GitHub release first, then update only Supabase `latest.json`:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="paste-service-role-key-here"
npm.cmd run release:supabase:bridge
```

That bridge uploads only a small JSON file to Supabase. The installer URL inside it points to GitHub Releases.

After users install one bridged update, future versions check GitHub directly.

## Version rule

The updater only appears when the published `latest.json` version is greater than the installed app version. For a real update test, bump both:

```text
package.json
src-tauri/tauri.conf.json
```
