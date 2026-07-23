type AuthProvider = "jwt" | "keycloak";

export type WizardValues = {
  secretKey: string;
  publicAppUrl: string;
  allowedHosts: string;
  emmaVersion: string;
  dockerhubNamespace: string;
  updateRepository: string;
  postgresDb: string;
  postgresUser: string;
  postgresPassword: string;
  djangoSuperuserUsername: string;
  djangoSuperuserPassword: string;
  authProvider: AuthProvider;
  keycloakUrl: string;
  keycloakRealm: string;
  keycloakClientId: string;
  keycloakAudience: string;
  keycloakAdminRole: string;
  seedInternalData: boolean;
  ollamaDefaultModel: string;
  runOllamaInDocker: boolean;
  voskSource: string;
};

const DEFAULT_VOSK_URL =
  "https://alphacephei.com/vosk/models/vosk-model-en-us-0.22-lgraph.zip";

const normalizeOriginUrl = (rawValue: string): string => {
  const trimmed = rawValue.trim();
  const candidate =
    trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);
  return `${url.protocol}//${url.host}`;
};

const extractHost = (rawValue: string): string => {
  const origin = normalizeOriginUrl(rawValue);
  return new URL(origin).hostname || "localhost";
};

const buildEnvFile = (values: WizardValues) => {
  const publicAppUrl = normalizeOriginUrl(values.publicAppUrl);
  const publicHost = extractHost(values.publicAppUrl);
  const appUpdateEnabled = values.updateRepository.trim() ? "True" : "False";
  const backendImage = `${values.dockerhubNamespace}/emma-cookbook-backend`;
  const frontendImage = `${values.dockerhubNamespace}/emma-cookbook-frontend`;
  const keycloakIssuer = `${values.keycloakUrl}/realms/${values.keycloakRealm}`;
  const keycloakJwksUrl = `${keycloakIssuer}/protocol/openid-connect/certs`;
  const ollamaHost = values.runOllamaInDocker
    ? "http://ollama:11434"
    : "http://host.docker.internal:11434";

  return `APP_NAME=emma-cookbook
APP_VERSION=${values.emmaVersion}
APP_GIT_SHA=
SECRET_KEY=${values.secretKey}
DEBUG=False
ALLOWED_HOSTS=${values.allowedHosts.trim() || `${publicHost},localhost,127.0.0.1`}
CORS_ALLOWED_ORIGINS=${publicAppUrl}

EMMA_VERSION=${values.emmaVersion}
EMMA_GIT_SHA=
EMMA_BACKEND_IMAGE=${backendImage}
EMMA_FRONTEND_IMAGE=${frontendImage}
APP_UPDATE_CHECK_ENABLED=${appUpdateEnabled}
APP_UPDATE_REPOSITORY=${values.updateRepository.trim()}
APP_UPDATE_CHECK_TIMEOUT_SECONDS=10
APP_UPDATE_CHECK_TAG_LIMIT=25
APP_UPDATE_CHECK_SCHEDULE_HOUR=3
APP_UPDATE_CHECK_SCHEDULE_MINUTE=0

DATABASE_ENGINE=postgres
POSTGRES_DB=${values.postgresDb}
POSTGRES_USER=${values.postgresUser}
POSTGRES_PASSWORD=${values.postgresPassword}
POSTGRES_HOST=db
POSTGRES_PORT=5432

AUTH_PROVIDER=${values.authProvider}
KEYCLOAK_REALM=${values.keycloakRealm}
KEYCLOAK_URL=${values.keycloakUrl}
KEYCLOAK_ISSUER=${keycloakIssuer}
KEYCLOAK_CLIENT_ID=${values.keycloakClientId}
KEYCLOAK_AUDIENCE=${values.keycloakAudience}
KEYCLOAK_JWKS_URL=${keycloakJwksUrl}
KEYCLOAK_ADMIN_ROLE=${values.keycloakAdminRole}

DJANGO_SUPERUSER_USERNAME=${values.djangoSuperuserUsername}
DJANGO_SUPERUSER_PASSWORD=${values.djangoSuperuserPassword}

SEED_INTERNAL_DATA=${values.seedInternalData ? "1" : "0"}

CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/0
CELERY_TASK_TIME_LIMIT=900
CELERY_TASK_SOFT_TIME_LIMIT=840

RECIPE_IMPORT_JOBS_RATE_LIMIT=1200/hour
RECIPE_IMPORT_MAX_FILESIZE_BYTES=104857600
RECIPE_IMPORT_DOWNLOAD_TIMEOUT_SECONDS=180
RECIPE_IMPORT_ALLOWED_HOSTS=instagram.com,www.instagram.com,m.instagram.com,tiktok.com,www.tiktok.com,m.tiktok.com,vm.tiktok.com,youtube.com,www.youtube.com,m.youtube.com,youtu.be
RECIPE_IMPORT_COOKIE_FILE=/app/import-cookies/cookies.txt

USE_S3_MEDIA_STORAGE=False
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_STORAGE_BUCKET_NAME=
AWS_S3_REGION_NAME=
AWS_S3_ENDPOINT_URL=
AWS_S3_CUSTOM_DOMAIN=

VOSK_MODEL_PATH=/app/vosk-model
OLLAMA_DEFAULT_MODEL=${values.ollamaDefaultModel}
OLLAMA_HOST=${ollamaHost}
PUBLIC_HOST=${publicHost}
FRONTEND_HTTP_BIND=80
`;
};

const buildComposeFile = (values: WizardValues) => {
  const ollamaService = values.runOllamaInDocker
    ? `
  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
    ports:
      - "11434:11434"
`
    : "";

  const ollamaVolume = values.runOllamaInDocker ? "\n  ollama_data:" : "";

  return `services:
  db:
    image: postgres:15
    env_file:
      - .env.production
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  backend:
    image: \${EMMA_BACKEND_IMAGE}:\${EMMA_VERSION}
    env_file:
      - .env.production
    environment:
      RUN_MIGRATIONS: "1"
    depends_on:
      - db
      - redis
    volumes:
      - ./backend/media:/app/media
      - ./docker-data/vosk:/app/vosk-model
      - ./docker-data/import-cookies:/app/import-cookies:ro
      - ./docker-data/bootstrap:/bootstrap
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "8000:8000"

  worker:
    image: \${EMMA_BACKEND_IMAGE}:\${EMMA_VERSION}
    command: celery -A cookbook worker -l info
    env_file:
      - .env.production
    environment:
      RUN_MIGRATIONS: "0"
    depends_on:
      - db
      - redis
    volumes:
      - ./backend/media:/app/media
      - ./docker-data/vosk:/app/vosk-model
      - ./docker-data/import-cookies:/app/import-cookies:ro
      - ./docker-data/bootstrap:/bootstrap
    extra_hosts:
      - "host.docker.internal:host-gateway"

  beat:
    image: \${EMMA_BACKEND_IMAGE}:\${EMMA_VERSION}
    command: celery -A cookbook beat -l info
    env_file:
      - .env.production
    environment:
      RUN_MIGRATIONS: "0"
    depends_on:
      - db
      - redis
    volumes:
      - ./backend/media:/app/media
      - ./docker-data/vosk:/app/vosk-model
      - ./docker-data/import-cookies:/app/import-cookies:ro
      - ./docker-data/bootstrap:/bootstrap
    extra_hosts:
      - "host.docker.internal:host-gateway"${ollamaService}

  frontend:
    container_name: emma-cookbook
    image: \${EMMA_FRONTEND_IMAGE}:\${EMMA_VERSION}
    depends_on:
      - backend
    ports:
      - "\${FRONTEND_HTTP_BIND:-80}:80"

volumes:
  postgres_data:${ollamaVolume}
`;
};

const buildCaddyComposeFile = () => `services:
  caddy:
    image: caddy:2-alpine
    env_file:
      - .env.production
    depends_on:
      - frontend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./docker-data/caddy/data:/data
      - ./docker-data/caddy/config:/config
`;

const buildCaddyfile = () => `{
  local_certs
  admin off
}

{$PUBLIC_HOST} {
  encode zstd gzip
  reverse_proxy frontend:80
}
`;

const buildReadme = (values: WizardValues) => {
  const publicAppUrl = normalizeOriginUrl(values.publicAppUrl);
  const notes = [
    "# emma-cookbook Docker package",
    "",
    "This package was generated from the interactive docs setup wizard.",
    "",
    "## Run it",
    "",
    "```sh",
    "docker compose pull",
    "docker compose up -d",
    "```",
    "",
    `After the containers start, open ${publicAppUrl}.`,
    "",
    "## Included files",
    "",
    "- `docker-compose.yml`",
    "- `docker-compose.caddy.yml`",
    "- `.env.production`",
    "- `backend/media/`",
    "- `docker-data/bootstrap/`",
    "- `docker-data/import-cookies/`",
    "- `docker-data/vosk/`",
    "- `caddy/Caddyfile`",
    "",
    "## Notes",
    "",
    `- Default admin username: ${values.djangoSuperuserUsername}`,
    `- Starter recipe data: ${values.seedInternalData ? "enabled" : "disabled"}`,
    `- Ollama inside Docker: ${values.runOllamaInDocker ? "enabled" : "disabled"}`,
    `- Vosk model source from the wizard: ${values.voskSource || DEFAULT_VOSK_URL}`,
    "- The package creates the app admin automatically on first run.",
    "- If you want speech-powered imports, place an extracted Vosk model inside `docker-data/vosk/` before starting the stack.",
    "- If Instagram or YouTube imports need login state, place a Netscape-format cookie export at `docker-data/import-cookies/cookies.txt` before starting the stack.",
    "- If you want local TLS for a hostname like `cookbook.home.arpa`, set `FRONTEND_HTTP_BIND=127.0.0.1:8080` and start Compose with both `docker-compose.yml` and `docker-compose.caddy.yml`, then trust Caddy's local root CA on your client devices.",
    "- Backup import and Keycloak realm/client creation are still manual after download.",
  ];

  return `${notes.join("\n")}\n`;
};

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

export const generateSecretKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(38));
  return base64UrlEncode(bytes);
};

export const createDefaultValues = (): WizardValues => {
  const publicAppUrl = "http://localhost";
  const host = extractHost(publicAppUrl);

  return {
    secretKey: generateSecretKey(),
    publicAppUrl,
    allowedHosts: `${host},localhost,127.0.0.1`,
    emmaVersion: "latest",
    dockerhubNamespace: "dennislent",
    updateRepository: "DennisLent/emma-cookbook",
    postgresDb: "cookbook",
    postgresUser: "cookbook",
    postgresPassword: "",
    djangoSuperuserUsername: "admin",
    djangoSuperuserPassword: "",
    authProvider: "jwt",
    keycloakUrl: "http://localhost:8080",
    keycloakRealm: "cookbook",
    keycloakClientId: "cookbook-web",
    keycloakAudience: "cookbook-web",
    keycloakAdminRole: "cookbook-admin",
    seedInternalData: false,
    ollamaDefaultModel: "llama3.2",
    runOllamaInDocker: true,
    voskSource: DEFAULT_VOSK_URL,
  };
};

export const createPackageFiles = (values: WizardValues) => ({
  envFile: buildEnvFile(values),
  composeFile: buildComposeFile(values),
  caddyComposeFile: buildCaddyComposeFile(),
  caddyfile: buildCaddyfile(),
  readme: buildReadme(values),
});

export const getNormalizedOriginUrl = normalizeOriginUrl;
export const getDefaultAllowedHosts = (publicAppUrl: string) => {
  const host = extractHost(publicAppUrl);
  return `${host},localhost,127.0.0.1`;
};
