import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultValues,
  createPackageFiles,
  validateWizardValues,
  type WizardValues,
} from "./generator.ts";

const validValues = (overrides: Partial<WizardValues> = {}): WizardValues => ({
  ...createDefaultValues(),
  publicAppUrl: "https://cookbook.example.com/setup/path",
  postgresPassword: "database-password",
  djangoSuperuserPassword: "admin-password",
  ...overrides,
});

test("single-user output disables authentication and omits admin credentials", () => {
  const values = validValues({
    appMode: "single_user",
    djangoSuperuserUsername: "",
    djangoSuperuserPassword: "",
  });

  assert.deepEqual(validateWizardValues(values), []);
  const { envFile, readme } = createPackageFiles(values);
  assert.match(envFile, /^APP_MODE=single_user$/m);
  assert.match(envFile, /^AUTH_PROVIDER=jwt$/m);
  assert.match(envFile, /^DJANGO_SUPERUSER_USERNAME=$/m);
  assert.match(envFile, /^DJANGO_SUPERUSER_PASSWORD=$/m);
  assert.doesNotMatch(envFile, /^KEYCLOAK_/m);
  assert.match(readme, /No local Django administrator is generated/);
});

test("built-in multi-user output includes the bootstrap administrator", () => {
  const values = validValues();

  assert.deepEqual(validateWizardValues(values), []);
  const { envFile } = createPackageFiles(values);
  assert.match(envFile, /^APP_MODE=multi_user$/m);
  assert.match(envFile, /^AUTH_PROVIDER=jwt$/m);
  assert.match(envFile, /^DJANGO_SUPERUSER_USERNAME=admin$/m);
  assert.match(envFile, /^DJANGO_SUPERUSER_PASSWORD=admin-password$/m);
  assert.doesNotMatch(envFile, /^KEYCLOAK_/m);
});

test("generated Compose initializes mode explicitly and exposes only the frontend", () => {
  const { composeFile } = createPackageFiles(validValues());

  assert.match(composeFile, /initialize_instance_mode --fresh-installation/);
  assert.match(composeFile, /service_completed_successfully/);
  assert.match(composeFile, /FRONTEND_HTTP_BIND:-127\.0\.0\.1:8080/);
  assert.doesNotMatch(composeFile, /"5432:5432"/);
  assert.doesNotMatch(composeFile, /"6379:6379"/);
  assert.doesNotMatch(composeFile, /"8000:8000"/);
  assert.doesNotMatch(composeFile, /"11434:11434"/);
});

test("Keycloak output includes OIDC settings and the bootstrap administrator", () => {
  const values = validValues({ authProvider: "keycloak" });

  assert.deepEqual(validateWizardValues(values), []);
  const { envFile } = createPackageFiles(values);
  assert.match(envFile, /^AUTH_PROVIDER=keycloak$/m);
  assert.match(envFile, /^KEYCLOAK_ISSUER=http:\/\/localhost:8080\/realms\/cookbook$/m);
  assert.match(envFile, /^DJANGO_SUPERUSER_USERNAME=admin$/m);
});

test("validation rejects invalid protocols, missing required values, and line injection", () => {
  const values = validValues({
    publicAppUrl: "ftp://cookbook.example.com",
    postgresPassword: "",
    updateRepository: "owner/repository\nINJECTED=true",
  });

  const errors = validateWizardValues(values);
  assert.ok(errors.includes("Enter a valid HTTP or HTTPS public app URL."));
  assert.ok(errors.includes("Enter a PostgreSQL password."));
  assert.ok(errors.includes("Update repository must be on one line."));
});

test("validation rejects an invalid Keycloak URL", () => {
  const values = validValues({
    authProvider: "keycloak",
    keycloakUrl: "file:///etc/passwd",
  });

  assert.ok(
    validateWizardValues(values).includes(
      "Enter a valid HTTP or HTTPS Keycloak URL.",
    ),
  );
});
