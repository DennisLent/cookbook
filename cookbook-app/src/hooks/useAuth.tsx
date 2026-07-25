// Authentication context that owns the logged-in user, tokens, and profile mutations.

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { applyColorScheme, defaultScheme } from "@/lib/colorSchemes";
import { apiRequest, clearTokens, setTokens } from "@/lib/api";

type UserPrefs = {
  theme: "light" | "dark";
  colorScheme: string;
  density: "cozy" | "compact";
  cookFontSize: "normal" | "large" | "x-large";
  highContrast: boolean;
  reduceMotion: boolean;
};

type User = {
  id: string;
  name: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  isSuperuser?: boolean;
  prefs: UserPrefs;
  favoriteRecipeIds?: string[];
  preferencesVersion: number;
};

type AuthContextType = {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  signup: (username: string, password: string, name: string, email?: string) => Promise<boolean>;
  logout: () => void;
  updateProfile: (updates: Partial<User>, avatarFile?: File) => Promise<User>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  isAuthenticated: boolean;
  isInitializing: boolean;
  mode: "single_user" | "multi_user";
  authenticationRequired: boolean;
  registrationEnabled: boolean;
  passwordManagementEnabled: boolean;
  administrationEnabled: boolean;
};

type AppConfig = {
  mode: "single_user" | "multi_user";
  authenticationRequired: boolean;
  registrationEnabled: boolean;
  authProvider: "none" | "jwt" | "keycloak";
  profileEnabled: boolean;
  passwordManagementEnabled: boolean;
  administrationEnabled: boolean;
};

type BackendUser = {
  id: string;
  username: string;
  email?: string;
  name?: string;
  display_name?: string;
  avatarUrl?: string | null;
  isSuperuser?: boolean;
  prefs?: Partial<UserPrefs>;
  favorite_recipe_ids?: string[];
  preferencesVersion?: number;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEY = "cookbook-auth-user";

const DEFAULT_PREFS: UserPrefs = {
  theme: "light",
  colorScheme: defaultScheme.id,
  density: "cozy",
  cookFontSize: "normal",
  highContrast: false,
  reduceMotion: false,
};

function normalizeUser(data: BackendUser): User {
  return {
    id: String(data.id),
    username: data.username,
    name: data.name || data.display_name || data.username,
    email: data.email,
    avatarUrl: data.avatarUrl || undefined,
    isSuperuser: Boolean(data.isSuperuser),
    favoriteRecipeIds: (data.favorite_recipe_ids || []).map((id) => String(id)),
    preferencesVersion: data.preferencesVersion || 1,
    prefs: {
      ...DEFAULT_PREFS,
      ...(data.prefs || {}),
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(false);
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as User) : null;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  });

  useEffect(() => {
    if (!user) {
      document.documentElement.setAttribute("data-theme", "light");
      applyColorScheme(defaultScheme.id, "light");
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    document.documentElement.setAttribute("data-theme", user.prefs.theme);
    applyColorScheme(user.prefs.colorScheme, user.prefs.theme);
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const appConfig = await apiRequest<AppConfig>("/app/config/");
        if (cancelled) return;
        setConfig(appConfig);
        if (!appConfig.authenticationRequired) {
          // Credentials from a previous multi-user deployment must never select
          // an identity after the instance enters shared-owner mode.
          clearTokens();
        }
        try {
          const profile = await apiRequest<BackendUser>("/users/me/");
          if (!cancelled) setUser(normalizeUser(profile));
        } catch {
          clearTokens();
          if (!cancelled) {
            setUser(null);
            // Anonymous is a valid multi-user bootstrap, but the shared owner
            // is mandatory in single-user mode.
            setBootstrapError(!appConfig.authenticationRequired);
          }
        }
      } catch {
        if (!cancelled) {
          clearTokens();
          setUser(null);
          setBootstrapError(true);
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const tokenData = await apiRequest<{ access: string; refresh: string }>("/auth/token/", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setTokens(tokenData.access, tokenData.refresh);
      const profile = await apiRequest<BackendUser>("/users/me/");
      setUser(normalizeUser(profile));
      return true;
    } catch {
      return false;
    }
  };

  const signup = async (username: string, password: string, name: string, email?: string): Promise<boolean> => {
    try {
      await apiRequest("/auth/register/", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          password2: password,
          name,
          email,
          preferences: { prefs: DEFAULT_PREFS },
        }),
      });
      return login(username, password);
    } catch {
      return false;
    }
  };

  const logout = () => {
    clearTokens();
    setUser(null);
  };

  const updateProfile = async (updates: Partial<User>, avatarFile?: File): Promise<User> => {
    if (!user) {
      throw new Error("You must be logged in to update your profile.");
    }

    let profile: BackendUser;
    if (avatarFile) {
      const formData = new FormData();
      formData.append("avatar", avatarFile);
      profile = await apiRequest<BackendUser>("/users/me/", {
        method: "PATCH",
        body: formData,
      });
    } else {
      const payload: Record<string, unknown> = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.email !== undefined) payload.email = updates.email;
      if (updates.prefs !== undefined) {
        payload.preferences = { prefs: updates.prefs };
        payload.preferencesVersion = user.preferencesVersion;
      }

      profile = await apiRequest<BackendUser>("/users/me/", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }

    const normalized = normalizeUser(profile);
    setUser(normalized);
    return normalized;
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    if (!user || !config?.passwordManagementEnabled) {
      throw new Error("You must be logged in to change your password.");
    }

    await apiRequest("/users/me/change-password/", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        new_password2: newPassword,
      }),
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        signup,
        logout,
        updateProfile,
        changePassword,
        isAuthenticated: !!user,
        isInitializing,
        mode: config?.mode || "multi_user",
        authenticationRequired: config?.authenticationRequired ?? true,
        registrationEnabled: config?.registrationEnabled ?? false,
        passwordManagementEnabled: config?.passwordManagementEnabled ?? false,
        administrationEnabled: config?.administrationEnabled ?? false,
      }}
    >
      {isInitializing ? (
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Loading cookbook…
        </div>
      ) : bootstrapError || !config ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <p className="text-lg font-medium">The cookbook could not initialize.</p>
          <p className="text-sm text-muted-foreground">
            Check the backend configuration and try again.
          </p>
          <button className="rounded-md border px-4 py-2" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
