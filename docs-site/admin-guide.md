---
title: Admin Guide
nav_order: 4
---

# Admin Guide

This page explains what a Django superuser can do in emma-cookbook and where those controls live.

## Frontend Admin Capabilities

In the frontend, superuser-only maintenance controls live on the Settings page.

From there, a superuser can:

- check whether a newer tagged release is available
- dismiss an update notice after reviewing it
- view the currently running app version and the latest detected version
- pull additional Ollama models
- switch the active Ollama model used by the backend
- delete installed Ollama models
- replace the Vosk speech model with a ZIP upload
- export a full application JSON backup
- import a previously exported JSON backup

There are a couple of important limits to keep in mind:

- update notices are visible only to superusers
- the frontend does not run Docker commands itself
- applying an update still requires Docker access on the host machine

## Backend Admin Capabilities

The backend also exposes the Django admin site for direct model and user management.

Default admin URL:

- `/admin/`

In a local setup that usually means:

- `http://127.0.0.1:8000/admin/`

In a deployed setup it will usually be:

- `https://your-domain/admin/`

## What You Can Manage in Django Admin

The Django admin gives you direct access to the main stored objects in the system.

That includes:

- users and their roles, profile fields, preferences, and permissions
- recipes and their nested ingredients and steps
- tags, ingredients, and ingredient aliases
- comments and ratings
- collections and collection membership
- recipe import jobs
- application update status metadata

This is the best place for things like:

- fixing bad or incomplete data directly
- adjusting user permissions and superuser access
- reviewing failed recipe import jobs
- verifying what the update checker has stored
- inspecting content when the frontend is not enough

## Frontend vs Backend Admin

The quick version is simple. Use the frontend when you want a safer, guided workflow. Use Django admin when you want direct access to the stored data.

Use the frontend when you want:

- operational tasks with guardrails
- backups and restore
- model-management actions
- release update awareness

Use Django admin when you want:

- direct access to the raw stored records
- bulk cleanup or manual correction
- permission and user-role management
- debugging data-level issues

## Recommended Admin Workflow

For day-to-day maintenance, a simple flow works well:

1. Sign in as a superuser.
2. Check the frontend Settings page first.
3. Use the update notice, backup tools, and extraction-model controls there.
4. Open Django admin when you need direct record-level access.

For deployment updates:

1. Review the available version on the frontend Settings page.
2. Log into the Docker host.
3. Run the update command from the host:

```sh
./scripts/update_docker_production.sh <tag>
```

Only a superuser can see the update notice in the app, but actual deployment changes always require host-level Docker access.
