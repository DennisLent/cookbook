import { useMemo, useState } from "react";
import JSZip from "jszip";
import { adminPage, homePage, introductionPage, setupPage } from "./content";
import {
  createDefaultValues,
  createPackageFiles,
  generateSecretKey,
  getDefaultAllowedHosts,
  getNormalizedOriginUrl,
  validateWizardValues,
  type WizardValues,
} from "./generator";

const App = () => {
  const [values, setValues] = useState<WizardValues>(() => createDefaultValues());
  const [downloadState, setDownloadState] = useState<"idle" | "downloading">(
    "idle",
  );
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

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
    const validationErrors = validateWizardValues(values);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
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

  const downloadEnvFile = () => {
    const validationErrors = validateWizardValues(values);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      return;
    }
    const blob = new Blob([packageFiles.envFile], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = ".env.production";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const copyEnvFile = async () => {
    const validationErrors = validateWizardValues(values);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
      return;
    }
    try {
      await navigator.clipboard.writeText(packageFiles.envFile);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setError("The browser could not access the clipboard. Download the env file instead.");
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

            <div className="wizard-block" id="environment-generator">
              <div className="wizard-heading">
                <div>
                  <span className="eyebrow">Interactive setup</span>
                  <h3>Build your production environment file</h3>
                  <p>
                    Answer the questions below. Your configuration is generated locally
                    in this browser and is never uploaded.
                  </p>
                </div>
                <div className="privacy-badge">Private by design</div>
              </div>
              <form
                className="wizard-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void downloadPackage();
                }}
              >
                <fieldset className="question-group">
                  <legend><span>1</span> How will you use the cookbook?</legend>
                  <p className="question-help">
                    Choose one shared household identity or separate accounts.
                  </p>
                  <div className="choice-grid">
                    <label className={`choice-card ${values.appMode === "single_user" ? "selected" : ""}`}>
                      <input
                        type="radio"
                        name="app-mode"
                        value="single_user"
                        checked={values.appMode === "single_user"}
                        onChange={() => updateValue("appMode", "single_user")}
                      />
                      <strong>Shared household</strong>
                      <span>No login. Everyone with network access shares recipes, notes, and settings.</span>
                    </label>
                    <label className={`choice-card ${values.appMode === "multi_user" ? "selected" : ""}`}>
                      <input
                        type="radio"
                        name="app-mode"
                        value="multi_user"
                        checked={values.appMode === "multi_user"}
                        onChange={() => updateValue("appMode", "multi_user")}
                      />
                      <strong>Separate accounts</strong>
                      <span>Login required for personal favorites, ratings, and administration.</span>
                    </label>
                  </div>
                </fieldset>

                <fieldset className="question-group">
                  <legend><span>2</span> Where will people open EMMA?</legend>
                  <p className="question-help">
                    Use the complete address, including <code>http://</code> or <code>https://</code>.
                  </p>
                  <label>
                    <span>Public app URL</span>
                    <input
                      type="url"
                      value={values.publicAppUrl}
                      placeholder="https://cookbook.example.com"
                      onChange={(event) => updateValue("publicAppUrl", event.target.value)}
                    />
                    <small>Used to generate the CORS origin and allowed-host defaults.</small>
                  </label>
                </fieldset>

                <fieldset className="question-group">
                  <legend><span>3</span> Protect the database</legend>
                  <p className="question-help">
                    Choose a strong password. It will be written only to your downloaded env file.
                  </p>
                  <label>
                    <span>PostgreSQL password</span>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={values.postgresPassword}
                      onChange={(event) => updateValue("postgresPassword", event.target.value)}
                    />
                  </label>
                </fieldset>

                {values.appMode === "multi_user" && (
                  <fieldset className="question-group">
                    <legend><span>4</span> Configure accounts</legend>
                    <label>
                      <span>How should users sign in?</span>
                      <select
                        value={values.authProvider}
                        onChange={(event) =>
                          updateValue("authProvider", event.target.value as WizardValues["authProvider"])
                        }
                      >
                        <option value="jwt">Built-in username and password</option>
                        <option value="keycloak">Keycloak / OpenID Connect</option>
                      </select>
                    </label>
                    <label>
                      <span>Administrator username</span>
                      <input
                        value={values.djangoSuperuserUsername}
                        onChange={(event) =>
                          updateValue("djangoSuperuserUsername", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Administrator password</span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={values.djangoSuperuserPassword}
                        onChange={(event) =>
                          updateValue("djangoSuperuserPassword", event.target.value)
                        }
                      />
                    </label>
                  </fieldset>
                )}

                {values.appMode === "multi_user" && values.authProvider === "keycloak" ? (
                  <fieldset className="question-group nested-group">
                    <legend>Keycloak connection</legend>
                    <label>
                      <span>Keycloak URL</span>
                      <input
                        value={values.keycloakUrl}
                        onChange={(event) =>
                          updateValue("keycloakUrl", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Realm</span>
                      <input
                        value={values.keycloakRealm}
                        onChange={(event) =>
                          updateValue("keycloakRealm", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Client ID</span>
                      <input
                        value={values.keycloakClientId}
                        onChange={(event) =>
                          updateValue("keycloakClientId", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Audience</span>
                      <input
                        value={values.keycloakAudience}
                        onChange={(event) =>
                          updateValue("keycloakAudience", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Administrator role</span>
                      <input
                        value={values.keycloakAdminRole}
                        onChange={(event) =>
                          updateValue("keycloakAdminRole", event.target.value)
                        }
                      />
                    </label>
                  </fieldset>
                ) : null}

                <fieldset className="question-group">
                  <legend><span>{values.appMode === "multi_user" ? "5" : "4"}</span> Recipe import tools</legend>
                  <div className="checkbox-row">
                    <input
                      id="ollama-host"
                      type="checkbox"
                      checked={values.runOllamaInDocker}
                      onChange={(event) => updateValue("runOllamaInDocker", event.target.checked)}
                    />
                    <label htmlFor="ollama-host">
                      <strong>Run Ollama in Docker</strong>
                      <span>Recommended if you do not already run Ollama on the host.</span>
                    </label>
                  </div>
                  <label>
                    <span>Default Ollama model</span>
                    <input
                      value={values.ollamaDefaultModel}
                      onChange={(event) => updateValue("ollamaDefaultModel", event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Vosk model download URL</span>
                    <input
                      value={values.voskSource}
                      onChange={(event) => updateValue("voskSource", event.target.value)}
                    />
                  </label>
                  <div className="checkbox-row">
                    <input
                      id="seed-internal-data"
                      type="checkbox"
                      checked={values.seedInternalData}
                      onChange={(event) => updateValue("seedInternalData", event.target.checked)}
                    />
                    <label htmlFor="seed-internal-data">
                      <strong>Add starter recipes</strong>
                      <span>Populate a small example cookbook on first run.</span>
                    </label>
                  </div>
                </fieldset>

                <details className="advanced-settings">
                  <summary>Advanced deployment settings</summary>
                  <div className="advanced-grid">
                    <label>
                      <span>Allowed hosts</span>
                      <input value={values.allowedHosts} onChange={(event) => updateValue("allowedHosts", event.target.value)} />
                    </label>
                    <label>
                      <span>Application version</span>
                      <input value={values.emmaVersion} onChange={(event) => updateValue("emmaVersion", event.target.value)} />
                    </label>
                    <label>
                      <span>Docker Hub namespace</span>
                      <input value={values.dockerhubNamespace} onChange={(event) => updateValue("dockerhubNamespace", event.target.value)} />
                    </label>
                    <label>
                      <span>Update repository</span>
                      <input value={values.updateRepository} onChange={(event) => updateValue("updateRepository", event.target.value)} />
                    </label>
                    <label>
                      <span>PostgreSQL database</span>
                      <input value={values.postgresDb} onChange={(event) => updateValue("postgresDb", event.target.value)} />
                    </label>
                    <label>
                      <span>PostgreSQL user</span>
                      <input value={values.postgresUser} onChange={(event) => updateValue("postgresUser", event.target.value)} />
                    </label>
                    <label className="full-width">
                      <span>Django secret key</span>
                      <div className="inline-control">
                        <input value={values.secretKey} onChange={(event) => updateValue("secretKey", event.target.value)} />
                        <button type="button" className="secondary-button" onClick={() => updateValue("secretKey", generateSecretKey())}>
                          Generate new key
                        </button>
                      </div>
                    </label>
                  </div>
                </details>

                {error ? <p className="form-error">{error}</p> : null}

                <div className="wizard-actions">
                  <button className="primary-button" type="button" onClick={downloadEnvFile}>
                    Download .env.production
                  </button>
                  <button className="secondary-button" type="button" onClick={() => void copyEnvFile()}>
                    {copyState === "copied" ? "Copied!" : "Copy env file"}
                  </button>
                  <button className="secondary-button" type="submit">
                    {downloadState === "downloading" ? "Preparing package..." : "Download full Docker package"}
                  </button>
                </div>
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
              <details className="env-preview">
                <summary>
                  <span>Preview generated .env.production</span>
                  <span className="summary-hint">Updates as you answer</span>
                </summary>
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
