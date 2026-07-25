"""Central Django settings for local, Docker, and production deployments."""

from pathlib import Path
from decouple import Config, RepositoryEnv, Csv
from corsheaders.defaults import default_headers
from celery.schedules import crontab
import os
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
env_path = BASE_DIR.parent / '.env'
production_env_path = BASE_DIR.parent / '.env.production'
dev_env_path = BASE_DIR.parent / 'dev_env'

if env_path.exists():
    config = Config(repository=RepositoryEnv(str(env_path)))
elif production_env_path.exists():
    config = Config(repository=RepositoryEnv(str(production_env_path)))
elif dev_env_path.exists():
    config = Config(repository=RepositoryEnv(str(dev_env_path)))
else:
    config = Config(repository={})


def config_bool(name, default=False):
    value = config(name, default=default)
    if isinstance(value, bool):
        return value

    normalized = str(value).strip().lower()
    if normalized in {'1', 'true', 't', 'yes', 'y', 'on', 'debug', 'development', 'dev'}:
        return True
    if normalized in {'0', 'false', 'f', 'no', 'n', 'off', 'release', 'prod', 'production', ''}:
        return False

    return default


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='dev-secret-key')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config_bool('DEBUG', default=False)
USE_S3_MEDIA_STORAGE = config_bool('USE_S3_MEDIA_STORAGE', default=False)
APP_NAME = config('APP_NAME', default='EMMA')
APP_VERSION = config('APP_VERSION', default='dev')
APP_GIT_SHA = config('APP_GIT_SHA', default='')
APP_UPDATE_CHECK_ENABLED = config_bool('APP_UPDATE_CHECK_ENABLED', default=True)
APP_UPDATE_REPOSITORY = config('APP_UPDATE_REPOSITORY', default='')
APP_UPDATE_CHECK_TIMEOUT_SECONDS = config('APP_UPDATE_CHECK_TIMEOUT_SECONDS', cast=int, default=10)
APP_UPDATE_CHECK_TAG_LIMIT = config('APP_UPDATE_CHECK_TAG_LIMIT', cast=int, default=25)
APP_UPDATE_CHECK_SCHEDULE_HOUR = config('APP_UPDATE_CHECK_SCHEDULE_HOUR', cast=int, default=3)
APP_UPDATE_CHECK_SCHEDULE_MINUTE = config('APP_UPDATE_CHECK_SCHEDULE_MINUTE', cast=int, default=0)

ALLOWED_HOSTS = config(
    'ALLOWED_HOSTS',
    cast=Csv(),
    default='127.0.0.1,localhost,testserver,backend,frontend',
)
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

AUTH_USER_MODEL = 'users.User'

# APP_MODE controls whether callers authenticate as individual accounts or as
# one shared instance owner. It is intentionally separate from AUTH_PROVIDER,
# which only selects the credential mechanism used in multi-user mode.
APP_MODE = str(config('APP_MODE', default='multi_user')).strip().lower()
if APP_MODE not in {'multi_user', 'single_user'}:
    raise ValueError("APP_MODE must be either 'multi_user' or 'single_user'.")

# Media for images and avatars
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    "rest_framework",
    "rest_framework_simplejwt",
    "users",
    "recipes",
    "corsheaders"
]

if USE_S3_MEDIA_STORAGE:
    INSTALLED_APPS.append("storages")

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    cast=Csv(),
    default='http://localhost:8080,http://127.0.0.1:8080,http://localhost:4200,http://127.0.0.1:4200',
)
CORS_ALLOW_HEADERS = list(default_headers) + [
    'content-type',
    'authorization'
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'cookbook.authentication.SingleUserAuthentication',
        'cookbook.authentication.OIDCAuthentication',
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ),
    'EXCEPTION_HANDLER': 'cookbook.api_errors.custom_exception_handler',
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'recipe_import_jobs': config('RECIPE_IMPORT_JOBS_RATE_LIMIT', default='1200/hour'),
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 30,
}

ROOT_URLCONF = 'cookbook.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'cookbook.wsgi.application'

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': False,
    'BLACKLIST_AFTER_ROTATION': False,
    'AUTH_HEADER_TYPES': ('Bearer',),
}


# Database
# https://docs.djangoproject.com/en/5.2/ref/settings/#databases

database_engine = str(config('DATABASE_ENGINE', default='')).strip().lower()
has_postgres_config = any(
    str(config(key, default='')).strip()
    for key in ('POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'POSTGRES_PORT')
)

if database_engine == 'sqlite':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
elif database_engine in {'postgres', 'postgresql'} or has_postgres_config:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': config('POSTGRES_DB', default='cookbook'),
            'USER': config('POSTGRES_USER', default='cookbook'),
            'PASSWORD': config('POSTGRES_PASSWORD', default='cookbook'),
            'HOST': config('POSTGRES_HOST', default='localhost'),
            'PORT': config('POSTGRES_PORT', default='5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }



# Password validation
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = 'static/'

if USE_S3_MEDIA_STORAGE:
    AWS_ACCESS_KEY_ID = config('AWS_ACCESS_KEY_ID', default='')
    AWS_SECRET_ACCESS_KEY = config('AWS_SECRET_ACCESS_KEY', default='')
    AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME', default='')
    AWS_S3_REGION_NAME = config('AWS_S3_REGION_NAME', default='')
    AWS_S3_ENDPOINT_URL = config('AWS_S3_ENDPOINT_URL', default='')
    AWS_S3_CUSTOM_DOMAIN = config('AWS_S3_CUSTOM_DOMAIN', default='')
    AWS_DEFAULT_ACL = None
    AWS_QUERYSTRING_AUTH = False

    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.s3.S3Storage',
            'OPTIONS': {
                'bucket_name': AWS_STORAGE_BUCKET_NAME,
                'region_name': AWS_S3_REGION_NAME or None,
                'endpoint_url': AWS_S3_ENDPOINT_URL or None,
                'custom_domain': AWS_S3_CUSTOM_DOMAIN or None,
            },
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }
else:
    STORAGES = {
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
            'OPTIONS': {
                'location': MEDIA_ROOT,
                'base_url': MEDIA_URL,
            },
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    }

# Default primary key field type
# https://docs.djangoproject.com/en/5.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Keycloak / OIDC settings
AUTH_PROVIDER = config('AUTH_PROVIDER', default='jwt')
KEYCLOAK_REALM = config('KEYCLOAK_REALM', default='cookbook')
KEYCLOAK_URL = config('KEYCLOAK_URL', default='http://localhost:8080')
KEYCLOAK_ISSUER = config('KEYCLOAK_ISSUER', default=f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}")
KEYCLOAK_CLIENT_ID = config('KEYCLOAK_CLIENT_ID', default='cookbook-web')
KEYCLOAK_AUDIENCE = config('KEYCLOAK_AUDIENCE', default=KEYCLOAK_CLIENT_ID)
KEYCLOAK_JWKS_URL = config(
    'KEYCLOAK_JWKS_URL',
    default=f"{KEYCLOAK_ISSUER}/protocol/openid-connect/certs"
)
KEYCLOAK_ADMIN_ROLE = config('KEYCLOAK_ADMIN_ROLE', default='cookbook-admin')
OLLAMA_DEFAULT_MODEL = config('OLLAMA_DEFAULT_MODEL', default='llama3.2')
OLLAMA_HOST = config('OLLAMA_HOST', default='http://localhost:11434')
VOSK_MODEL_PATH = config('VOSK_MODEL_PATH', default='')

CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://redis:6379/0')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default=CELERY_BROKER_URL)
CELERY_TASK_TIME_LIMIT = config('CELERY_TASK_TIME_LIMIT', cast=int, default=900)
CELERY_TASK_SOFT_TIME_LIMIT = config('CELERY_TASK_SOFT_TIME_LIMIT', cast=int, default=840)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ALWAYS_EAGER = config_bool('CELERY_TASK_ALWAYS_EAGER', default=False)
CELERY_TASK_EAGER_PROPAGATES = config_bool('CELERY_TASK_EAGER_PROPAGATES', default=False)
CELERY_BEAT_SCHEDULE = {
    'check_app_updates_daily': {
        'task': 'users.tasks.check_for_app_updates',
        'schedule': crontab(
            hour=APP_UPDATE_CHECK_SCHEDULE_HOUR,
            minute=APP_UPDATE_CHECK_SCHEDULE_MINUTE,
        ),
    },
}

RECIPE_IMPORT_MAX_FILESIZE_BYTES = config('RECIPE_IMPORT_MAX_FILESIZE_BYTES', cast=int, default=104857600)
RECIPE_IMPORT_DOWNLOAD_TIMEOUT_SECONDS = config('RECIPE_IMPORT_DOWNLOAD_TIMEOUT_SECONDS', cast=int, default=180)
RECIPE_IMPORT_ALLOWED_HOSTS = config(
    'RECIPE_IMPORT_ALLOWED_HOSTS',
    cast=Csv(),
    default='instagram.com,www.instagram.com,m.instagram.com,tiktok.com,www.tiktok.com,m.tiktok.com,vm.tiktok.com,youtube.com,www.youtube.com,m.youtube.com,youtu.be',
)
RECIPE_IMPORT_COOKIE_FILE = config('RECIPE_IMPORT_COOKIE_FILE', default='')
VOSK_MODEL_UPLOAD_MAX_ARCHIVE_BYTES = config('VOSK_MODEL_UPLOAD_MAX_ARCHIVE_BYTES', cast=int, default=1073741824)
VOSK_MODEL_UPLOAD_MAX_EXTRACTED_BYTES = config('VOSK_MODEL_UPLOAD_MAX_EXTRACTED_BYTES', cast=int, default=2147483648)
VOSK_MODEL_UPLOAD_MAX_FILE_COUNT = config('VOSK_MODEL_UPLOAD_MAX_FILE_COUNT', cast=int, default=5000)
