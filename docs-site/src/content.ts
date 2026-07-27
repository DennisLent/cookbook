export const homePage = {
  title: "emma-cookbook Documentation",
  intro:
    "emma-cookbook is a self-hosted recipe platform built to make home cooking easier to organise, search, save, and maintain.",
  links: ["Introduction", "Setup", "Admin Guide"],
};

export const introductionPage = {
  title: "Introduction",
  paragraphs: [
    "emma-cookbook is a self-hosted recipe app made for real home use. It is built for people who want their own cooking space on their own network, with a setup that feels practical instead of over-engineered.",
    "EMMA stands for Easy Meals Made Accessible.",
    "The idea is simple. Recipes should be easy to collect, easy to find again, and actually pleasant to use while cooking. That means the app is designed to work well on both desktops and phones, so it feels just as natural on a sofa, at a desk, or in the kitchen.",
    "emma-cookbook helps you keep everything in one place. You can browse by recipe name, tags, ratings, favorites, and collections. Recipe pages include the details you usually need in the moment, such as ingredients, servings, source links, comments, ratings, and suggested pairings.",
    "It is also built for the messy reality of how people save recipes. You can add them manually, import them from the web, or pull them in from Instagram, YouTube, and TikTok. When a supported video includes spoken instructions, emma-cookbook can extract that content and fold it into the recipe flow. You can also save imported videos directly in the app, which makes it much easier to revisit them later.",
    "Beyond storage, the app tries to be genuinely useful. You can tag recipes as mains, sides, or sauces, suggest combinations for individual dishes, match recipes against ingredients already in your fridge, and build meal plans that turn into shopping lists and PDF exports.",
    "If you want to run it yourself, the rest of the docs keep things simple. The setup guide covers both local development and Docker deployments, and the admin guide explains the controls available to superusers.",
  ],
};

export const setupPage = {
  title: "Setup",
  intro:
    "emma-cookbook supports two main setup styles. For local development on your own machine, SQLite is the easiest and recommended default. For a fuller deployment that runs the complete stack in containers, the supported path uses Docker with PostgreSQL.",
  localTitle: "Local Setup On Your Machine Or For Dev",
  localIntro: "If you just want to get the project running quickly, this is the easiest place to start.",
  localCommand: "./scripts/setup_local.sh",
  localNotes: [
    "That creates a local SQLite-backed backend, runs migrations, and creates or updates a superuser for you. The database is stored in `backend/db.sqlite3`.",
    "If you want to choose your own local admin credentials, you can pass them in like this:",
  ],
  localAdminCommand:
    "LOCAL_SUPERUSER_USERNAME=admin LOCAL_SUPERUSER_PASSWORD=change-me ./scripts/setup_local.sh",
  localMoreNotes: [
    "If you want to wipe the local data and start fresh again, use:",
  ],
  destroyCommand: "./scripts/destroy_local.sh",
  runNotes: [
    "If you want both frontend and backend running together during development, use:",
  ],
  runCommand: "./scripts/run.sh",
  runDescription:
    "That launcher reads from `dev_env` by default, starts the Django backend on `http://127.0.0.1:8000`, starts the frontend on `http://127.0.0.1:8080`, and runs migrations before the backend comes up.",
  localSummary:
    "SQLite is the recommended default for day-to-day development because it is quick to reset and avoids Docker or PostgreSQL state drift while you are iterating.",
  dockerTitle: "Docker Setup",
  dockerParagraphs: [
    "If you want a more production-style deployment, use Docker. In that setup, emma-cookbook runs with PostgreSQL, Redis, the Django backend, Celery worker and beat services, and the frontend container.",
    "The easiest path is the interactive setup script:",
  ],
  dockerCommand: "./scripts/setup_docker_production.sh",
  dockerDescription:
    "That script performs preflight checks, generates secrets, explicitly initializes the selected application mode, supports direct, bundled-Caddy, and external-proxy deployments, waits for health checks, and verifies the frontend and API.",
  envIntro:
    "The repo expects an env file such as `.env.production` for Docker-based deployments. The most important values to review are:",
  envKeys: [
    "SECRET_KEY",
    "DEBUG",
    "ALLOWED_HOSTS",
    "CORS_ALLOWED_ORIGINS",
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "EMMA_BACKEND_IMAGE",
    "EMMA_FRONTEND_IMAGE",
    "EMMA_VERSION",
    "APP_UPDATE_REPOSITORY",
    "DJANGO_SUPERUSER_USERNAME",
    "DJANGO_SUPERUSER_PASSWORD",
    "SEED_INTERNAL_DATA",
    "OLLAMA_HOST",
    "OLLAMA_DEFAULT_MODEL",
    "VOSK_MODEL_PATH",
  ],
  seedParagraph:
    "Seed data is owned by the configured administrator in multi-user mode and by the passwordless shared owner in single-user mode.",
  manualParagraph:
    "If you prefer managing things yourself after the first setup, you can use Docker Compose directly:",
  composeCommands: [
    "docker compose pull",
    "docker compose up -d",
  ],
  rebuildParagraph:
    "If your deployment uses locally built images instead of published ones, rebuild with:",
  rebuildCommand: "docker compose up --build -d",
  updateParagraph:
    "To update a deployment that uses published release images, run:",
  updateCommand:
    "./scripts/update_docker_production.sh v1.2.3",
};

export const adminPage = {
  title: "Admin Guide",
  intro:
    "This page explains what a Django superuser can do in emma-cookbook and where those controls live.",
  frontendTitle: "Frontend Admin Capabilities",
  frontendIntro:
    "In the frontend, superuser-only maintenance controls live on the Settings page.",
  frontendList: [
    "check whether a newer tagged release is available",
    "dismiss an update notice after reviewing it",
    "view the currently running app version and the latest detected version",
    "pull additional Ollama models",
    "switch the active Ollama model used by the backend",
    "delete installed Ollama models",
    "replace the Vosk speech model with a ZIP upload",
    "export a full application JSON backup",
    "import a previously exported JSON backup",
  ],
  frontendLimitsIntro: "There are a couple of important limits to keep in mind:",
  frontendLimits: [
    "update notices are visible only to superusers",
    "the frontend does not run Docker commands itself",
    "applying an update still requires Docker access on the host machine",
  ],
  backendTitle: "Backend Admin Capabilities",
  backendIntro:
    "The backend also exposes the Django admin site for direct model and user management.",
  backendUrlTitle: "Default admin URL:",
  backendUrl: "/admin/",
  localTitle: "In a local setup that usually means:",
  localUrl: "http://127.0.0.1:8000/admin/",
  deployedTitle: "In a deployed setup it will usually be:",
  deployedUrl: "https://your-domain/admin/",
  manageTitle: "What You Can Manage in Django Admin",
  manageIntro:
    "The Django admin gives you direct access to the main stored objects in the system.",
  manageIncludes: [
    "users and their roles, profile fields, preferences, and permissions",
    "recipes and their nested ingredients and steps",
    "tags, ingredients, and ingredient aliases",
    "comments and ratings",
    "collections and collection membership",
    "recipe import jobs",
    "application update status metadata",
  ],
  manageBestTitle: "This is the best place for things like:",
  manageBest: [
    "fixing bad or incomplete data directly",
    "adjusting user permissions and superuser access",
    "reviewing failed recipe import jobs",
    "verifying what the update checker has stored",
    "inspecting content when the frontend is not enough",
  ],
  compareTitle: "Frontend vs Backend Admin",
  compareIntro:
    "The quick version is simple. Use the frontend when you want a safer, guided workflow. Use Django admin when you want direct access to the stored data.",
  compareFrontendTitle: "Use the frontend when you want:",
  compareFrontend: [
    "operational tasks with guardrails",
    "backups and restore",
    "model-management actions",
    "release update awareness",
  ],
  compareBackendTitle: "Use Django admin when you want:",
  compareBackend: [
    "direct access to the raw stored records",
    "bulk cleanup or manual correction",
    "permission and user-role management",
    "debugging data-level issues",
  ],
  workflowTitle: "Recommended Admin Workflow",
  workflowIntro: "For day-to-day maintenance, a simple flow works well:",
  workflow: [
    "Sign in as a superuser.",
    "Check the frontend Settings page first.",
    "Use the update notice, backup tools, and extraction-model controls there.",
    "Open Django admin when you need direct record-level access.",
  ],
  updateTitle: "For deployment updates:",
  updates: [
    "Review the available version on the frontend Settings page.",
    "Log into the Docker host.",
    "Run the update command from the host:",
  ],
  updateCommand:
    "./scripts/update_docker_production.sh <tag>",
  updateSummary:
    "Only a superuser can see the update notice in the app, but actual deployment changes always require host-level Docker access.",
};
