# Supabase updater bridge

Supabase Storage is no longer the main host for updater installers. GitHub Releases is the main host now; see `docs/github-releases-updater.md`.

This file only documents the migration bridge for already-installed app versions that still read:

```text
https://suaqmxypsohyflrioypd.supabase.co/storage/v1/object/public/app-releases/latest.json
```

## Why the bridge exists

Installed apps cannot magically change their updater endpoint. They must receive one more update from the endpoint they already know.

To avoid Supabase bandwidth usage, the bridge uploads only `latest.json` to Supabase. The JSON points the heavy installer download to GitHub Releases.

## Bridge publish flow

1. Publish the real release to GitHub first:

```powershell
npm.cmd run release:github
```

2. Publish only the Supabase `latest.json` bridge:

```powershell
$env:SUPABASE_SERVICE_ROLE_KEY="paste-service-role-key-here"
npm.cmd run release:supabase:bridge
```

Check before uploading:

```powershell
npm.cmd run release:supabase:bridge:dry-run
```

## Important

Do not use the old full Supabase release upload for normal updates. Uploading `.exe` installers to Supabase Storage is what consumes egress quickly.
