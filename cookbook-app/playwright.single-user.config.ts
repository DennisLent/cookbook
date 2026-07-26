import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-single-user",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        "APP_MODE=single_user DATABASE_ENGINE=sqlite SQLITE_DATABASE_PATH=/tmp/emma-cookbook-single-user-e2e.sqlite3 sh -c 'python3 manage.py migrate --noinput && python3 manage.py initialize_instance_mode && python3 manage.py runserver 127.0.0.1:8000'",
      cwd: "../backend",
      port: 8000,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4174",
      cwd: ".",
      port: 4174,
      reuseExistingServer: false,
    },
  ],
});
