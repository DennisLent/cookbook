import { useMemo, useState } from "react";
import JSZip from "jszip";
import { adminPage, homePage, introductionPage, setupPage } from "./content";
import {
  createDefaultValues,
  createPackageFiles,
  generateSecretKey,
  getDefaultAllowedHosts,
  getNormalizedOriginUrl,
  type WizardValues,
} from "./generator";

const App = () => {
  const [values, setValues] = useState<WizardValues>(() => createDefaultValues());
  const [downloadState, setDownloadState] = useState<"idle" | "downloading">(
    "idle",
  );
  const [error, setError] = useState("");

  const packageFiles = useMemo(() => {
    try {
      return createPackageFiles(values);
    } catch {
      return {
        envFile: "Enter a valid public app URL to preview the generated env file.",
        composeFile:
          "Enter a valid public app URL to preview the generated compose file.",
        readme: "Enter a valid public app URL to preview the generated README.",
      };
    }
  }, [values]);

  const normalizedOrigin = useMemo(() => {
    try {
      return getNormalizedOriginUrl(values.publicAppUrl);
    } catch {
      return "https://your-domain.example";
    }
  }, [values.publicAppUrl]);

  const updateValue = <K extends keyof WizardValues>(
    key: K,
    nextValue: WizardValues[K],
  ) => {
    setError("");
    setValues((current) => {
      const nextState = {
        ...current,
        [key]: nextValue,
      };

      if (key === "publicAppUrl" && typeof nextValue === "string") {
        try {
          nextState.allowedHosts = getDefaultAllowedHosts(nextValue);
        } catch {
          return nextState;
        }
      }

      return nextState;
    });
  };

  const downloadPackage = async () => {
    if (!values.postgresPassword || !values.djangoSuperuserPassword) {
      setError("PostgreSQL and Django admin passwords are required.");
      return;
    }

    setError("");
    setDownloadState("downloading");

    try {
      const nextPackageFiles = createPackageFiles(values);
      const zip = new JSZip();
      const root = zip.folder("emma-cookbook-deploy");

      root?.file(".env.production", nextPackageFiles.envFile);
      root?.file("docker-compose.yml", nextPackageFiles.composeFile);
      root?.file("docker-compose.caddy.yml", nextPackageFiles.caddyComposeFile);
      root?.file("caddy/Caddyfile", nextPackageFiles.caddyfile);
      root?.file("README.md", nextPackageFiles.readme);
      root?.file("backend/media/.gitkeep", "");
      root?.file("docker-data/bootstrap/.gitkeep", "");
      root?.file("docker-data/caddy/data/.gitkeep", "");
      root?.file("docker-data/caddy/config/.gitkeep", "");
      root?.file("docker-data/import-cookies/.gitkeep", "");
      root?.file("docker-data/vosk/.gitkeep", "");

      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "emma-cookbook-deploy.zip";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError("Enter a valid public app URL to generate the package.");
    } finally {
      setDownloadState("idle");
    }
  };

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="container">
          <a className="site-title" href="#top">
            {homePage.title}
          </a>
        </div>
      </header>

      <main className="container page-layout">
        <aside className="side-nav" aria-label="On this page">
          <nav className="side-nav-inner">
            <div className="side-nav-title">Documentation</div>
            <a href="#documentation">Documentation</a>
            <a href="#introduction">Introduction</a>
            <a href="#setup">Setup</a>
            <a href="#admin-guide">Admin Guide</a>
          </nav>
        </aside>

        <div className="document">
          <section className="document-section" id="documentation">
            <h1>{homePage.title}</h1>
            <p>{homePage.intro}</p>
            <p>Start here:</p>
            <ul>
              {homePage.links.map((item) => (
                <li key={item}>
                  <a href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}>{item}</a>
                </li>
              ))}
            </ul>
          </section>

          <section className="document-section" id="introduction">
            <h2>{introductionPage.title}</h2>
            {introductionPage.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>

          <section className="document-section" id="setup">
            <h2>{setupPage.title}</h2>
            <p>{setupPage.intro}</p>

            <h3>{setupPage.localTitle}</h3>
            <p>{setupPage.localIntro}</p>
            <pre>
              <code>{setupPage.localCommand}</code>
            </pre>
            {setupPage.localNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <pre>
              <code>{setupPage.localAdminCommand}</code>
            </pre>
            {setupPage.localMoreNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <pre>
              <code>{setupPage.destroyCommand}</code>
            </pre>
            {setupPage.runNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
            <pre>
              <code>{setupPage.runCommand}</code>
            </pre>
            <p>{setupPage.runDescription}</p>
            <p>{setupPage.localSummary}</p>

            <h3>{setupPage.dockerTitle}</h3>
            {setupPage.dockerParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <pre>
              <code>{setupPage.dockerCommand}</code>
            </pre>
            <p>{setupPage.dockerDescription}</p>

            <div className="wizard-block">
              <h4>{setupPage.dockerTitle}</h4>
              <form
                className="wizard-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void downloadPackage();
                }}
              >
                <label>
                  <span>PUBLIC_APP_URL</span>
                  <input
                    value={values.publicAppUrl}
                    onChange={(event) =>
                      updateValue("publicAppUrl", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>ALLOWED_HOSTS</span>
                  <input
                    value={values.allowedHosts}
                    onChange={(event) =>
                      updateValue("allowedHosts", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>EMMA_VERSION</span>
                  <input
                    value={values.emmaVersion}
                    onChange={(event) =>
                      updateValue("emmaVersion", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>DOCKERHUB_NAMESPACE</span>
                  <input
                    value={values.dockerhubNamespace}
                    onChange={(event) =>
                      updateValue("dockerhubNamespace", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>APP_UPDATE_REPOSITORY</span>
                  <input
                    value={values.updateRepository}
                    onChange={(event) =>
                      updateValue("updateRepository", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>SECRET_KEY</span>
                  <div className="inline-control">
                    <input
                      value={values.secretKey}
                      onChange={(event) =>
                        updateValue("secretKey", event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => updateValue("secretKey", generateSecretKey())}
                    >
                      Generate secret key
                    </button>
                  </div>
                </label>

                <label>
                  <span>POSTGRES_DB</span>
                  <input
                    value={values.postgresDb}
                    onChange={(event) =>
                      updateValue("postgresDb", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>POSTGRES_USER</span>
                  <input
                    value={values.postgresUser}
                    onChange={(event) =>
                      updateValue("postgresUser", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>POSTGRES_PASSWORD</span>
                  <input
                    type="password"
                    value={values.postgresPassword}
                    onChange={(event) =>
                      updateValue("postgresPassword", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>APP_MODE</span>
                  <select
                    value={values.appMode}
                    onChange={(event) =>
                      updateValue(
                        "appMode",
                        event.target.value as WizardValues["appMode"],
                      )
                    }
                  >
                    <option value="multi_user">multi_user</option>
                    <option value="single_user">single_user</option>
                  </select>
                </label>

                {values.appMode === "multi_user" && (
                  <>
                    <label>
                      <span>DJANGO_SUPERUSER_USERNAME</span>
                      <input
                        value={values.djangoSuperuserUsername}
                        onChange={(event) =>
                          updateValue("djangoSuperuserUsername", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>DJANGO_SUPERUSER_PASSWORD</span>
                      <input
                        type="password"
                        value={values.djangoSuperuserPassword}
                        onChange={(event) =>
                          updateValue("djangoSuperuserPassword", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>AUTH_PROVIDER</span>
                      <select
                        value={values.authProvider}
                        onChange={(event) =>
                          updateValue(
                            "authProvider",
                            event.target.value as WizardValues["authProvider"],
                          )
                        }
                      >
                        <option value="jwt">jwt</option>
                        <option value="keycloak">keycloak</option>
                      </select>
                    </label>
                  </>
                )}

                {values.appMode === "multi_user" && values.authProvider === "keycloak" ? (
                  <>
                    <label>
                      <span>KEYCLOAK_URL</span>
                      <input
                        value={values.keycloakUrl}
                        onChange={(event) =>
                          updateValue("keycloakUrl", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>KEYCLOAK_REALM</span>
                      <input
                        value={values.keycloakRealm}
                        onChange={(event) =>
                          updateValue("keycloakRealm", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>KEYCLOAK_CLIENT_ID</span>
                      <input
                        value={values.keycloakClientId}
                        onChange={(event) =>
                          updateValue("keycloakClientId", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>KEYCLOAK_AUDIENCE</span>
                      <input
                        value={values.keycloakAudience}
                        onChange={(event) =>
                          updateValue("keycloakAudience", event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>KEYCLOAK_ADMIN_ROLE</span>
                      <input
                        value={values.keycloakAdminRole}
                        onChange={(event) =>
                          updateValue("keycloakAdminRole", event.target.value)
                        }
                      />
                    </label>
                  </>
                ) : null}

                <label>
                  <span>OLLAMA_DEFAULT_MODEL</span>
                  <input
                    value={values.ollamaDefaultModel}
                    onChange={(event) =>
                      updateValue("ollamaDefaultModel", event.target.value)
                    }
                  />
                </label>

                <label>
                  <span>VOSK_MODEL_PATH</span>
                  <input
                    value={values.voskSource}
                    onChange={(event) =>
                      updateValue("voskSource", event.target.value)
                    }
                  />
                </label>

                <div className="checkbox-row">
                  <input
                    id="seed-internal-data"
                    type="checkbox"
                    checked={values.seedInternalData}
                    onChange={(event) =>
                      updateValue("seedInternalData", event.target.checked)
                    }
                  />
                  <label htmlFor="seed-internal-data">SEED_INTERNAL_DATA</label>
                </div>

                <div className="checkbox-row">
                  <input
                    id="ollama-host"
                    type="checkbox"
                    checked={values.runOllamaInDocker}
                    onChange={(event) =>
                      updateValue("runOllamaInDocker", event.target.checked)
                    }
                  />
                  <label htmlFor="ollama-host">OLLAMA_HOST</label>
                </div>

                {error ? <p className="form-error">{error}</p> : null}

                <button className="primary-button" type="submit">
                  {downloadState === "downloading"
                    ? "Preparing download..."
                    : "Download deployment package"}
                </button>
              </form>

              <p>{setupPage.envIntro}</p>
              <ul>
                {setupPage.envKeys.map((key) => (
                  <li key={key}>
                    <code>{key}</code>
                  </li>
                ))}
              </ul>
              <p>{setupPage.seedParagraph}</p>
              <p>{setupPage.manualParagraph}</p>
              <pre>
                <code>{setupPage.composeCommands.join("\n")}</code>
              </pre>
              <p>{setupPage.rebuildParagraph}</p>
              <pre>
                <code>{setupPage.rebuildCommand}</code>
              </pre>
              <p>{setupPage.updateParagraph}</p>
              <pre>
                <code>{setupPage.updateCommand}</code>
              </pre>
              <p>
                <strong>Frontend URL:</strong> {normalizedOrigin}
              </p>
              <details>
                <summary>.env.production</summary>
                <pre>
                  <code>{packageFiles.envFile}</code>
                </pre>
              </details>
            </div>
          </section>

          <section className="document-section" id="admin-guide">
            <h2>{adminPage.title}</h2>
            <p>{adminPage.intro}</p>

            <h3>{adminPage.frontendTitle}</h3>
            <p>{adminPage.frontendIntro}</p>
            <p>From there, a superuser can:</p>
            <ul>
              {adminPage.frontendList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <p>{adminPage.frontendLimitsIntro}</p>
            <ul>
              {adminPage.frontendLimits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3>{adminPage.backendTitle}</h3>
            <p>{adminPage.backendIntro}</p>
            <p>{adminPage.backendUrlTitle}</p>
            <ul>
              <li>{adminPage.backendUrl}</li>
            </ul>
            <p>{adminPage.localTitle}</p>
            <ul>
              <li>{adminPage.localUrl}</li>
            </ul>
            <p>{adminPage.deployedTitle}</p>
            <ul>
              <li>{adminPage.deployedUrl}</li>
            </ul>

            <h3>{adminPage.manageTitle}</h3>
            <p>{adminPage.manageIntro}</p>
            <p>That includes:</p>
            <ul>
              {adminPage.manageIncludes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>{adminPage.manageBestTitle}</p>
            <ul>
              {adminPage.manageBest.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3>{adminPage.compareTitle}</h3>
            <p>{adminPage.compareIntro}</p>
            <p>{adminPage.compareFrontendTitle}</p>
            <ul>
              {adminPage.compareFrontend.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>{adminPage.compareBackendTitle}</p>
            <ul>
              {adminPage.compareBackend.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3>{adminPage.workflowTitle}</h3>
            <p>{adminPage.workflowIntro}</p>
            <ol>
              {adminPage.workflow.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>

            <p>{adminPage.updateTitle}</p>
            <ol>
              {adminPage.updates.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <pre>
              <code>{adminPage.updateCommand}</code>
            </pre>
            <p>{adminPage.updateSummary}</p>
          </section>
        </div>
      </main>
    </div>
  );
};

export default App;
