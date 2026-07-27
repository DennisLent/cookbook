// Superuser-only toast trigger that surfaces newly available application releases.

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/api";

type AppUpdateStatus = {
  currentVersion: string;
  latestVersion: string;
  repository: string;
  releaseUrl: string;
  updateAvailable: boolean;
  lastCheckedAt?: string | null;
  lastError?: string;
  dismissedVersion?: string;
  updateChecksEnabled: boolean;
};

const SESSION_KEY = "emma-cookbook-update-toast-version";

export function UpdateNotifier() {
  const navigate = useNavigate();
  const { user, administrationEnabled } = useAuth();
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (!(user?.isSuperuser || administrationEnabled) || hasRequestedRef.current) {
      return;
    }

    hasRequestedRef.current = true;

    apiRequest<AppUpdateStatus>("/app/update-status/")
      .then((status) => {
        if (!status.updateChecksEnabled || !status.updateAvailable || !status.latestVersion) {
          return;
        }

        const shownVersion = sessionStorage.getItem(SESSION_KEY);
        if (shownVersion === status.latestVersion) {
          return;
        }

        sessionStorage.setItem(SESSION_KEY, status.latestVersion);
        toast({
          title: `Update available: ${status.latestVersion}`,
          description: `emma-cookbook ${status.latestVersion} is available. Only a superuser with Docker access on the host can apply the update.`,
          action: (
            <ToastAction altText="Open update settings" onClick={() => navigate("/settings")}>
              Review
            </ToastAction>
          ),
        });
      })
      .catch(() => undefined);
  }, [administrationEnabled, navigate, user?.isSuperuser]);

  return null;
}
