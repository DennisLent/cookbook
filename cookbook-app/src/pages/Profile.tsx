// Profile management page for account details, password changes, and UI preferences.

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { ArrowLeft, Upload, Check } from "lucide-react";
import { colorSchemes, getSchemeById } from "@/lib/colorSchemes";
import { ApiError, getApiErrorMessage } from "@/lib/api";

export default function Profile() {
  const navigate = useNavigate();
  const {
    user,
    updateProfile,
    updatePreferences,
    refreshProfile,
    changePassword,
    isAuthenticated,
    authenticationRequired,
    passwordManagementEnabled,
    mode,
  } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isAuthenticated || !user) {
    navigate("/login");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(formData);
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Profile update failed."));
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await updateProfile({}, file);
      toast.success("Avatar updated");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Avatar upload failed."));
    }
  };

  const handlePrefChange = async (
    key: keyof typeof user.prefs,
    value: string | boolean,
  ) => {
    const applyPreference = async (
      prefs: typeof user.prefs,
      expectedVersion?: number,
    ) => updatePreferences(prefs, expectedVersion);

    try {
      await applyPreference({ ...user.prefs, [key]: value });
    } catch (error) {
      if ((error as ApiError)?.code === "preferences_version_conflict") {
        try {
          const latest = await refreshProfile();
          toast.error("Preferences changed on another device.", {
            description: "The latest preferences were loaded. Retry to apply your change.",
            action: {
              label: "Retry",
              onClick: () => {
                applyPreference(
                  { ...latest.prefs, [key]: value },
                  latest.preferencesVersion,
                )
                  .then(() => toast.success("Preference updated"))
                  .catch((retryError) =>
                    toast.error(getApiErrorMessage(retryError, "Preference update failed.")),
                  );
              },
            },
          });
          return;
        } catch (refreshError) {
          toast.error(getApiErrorMessage(refreshError, "Could not load the latest preferences."));
          return;
        }
      }
      toast.error(getApiErrorMessage(error, "Preference update failed."));
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    try {
      await changePassword(passwordData.currentPassword, passwordData.newPassword);
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success("Password updated successfully");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Password update failed."));
    }
  };

  const getInitials = () => {
    return user.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Recipes
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-3xl font-semibold mb-8">
          {mode === "single_user" ? "Preferences" : "Profile Settings"}
        </h1>

        <div className="space-y-6">
          {/* Avatar Section */}
          {authenticationRequired && <Card>
            <CardHeader>
              <CardTitle>Profile Picture</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user.avatarUrl} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Photo
                </Button>
              </div>
            </CardContent>
          </Card>}

          {/* Basic Info */}
          {authenticationRequired && <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" value={user.username} disabled className="bg-muted" />
                  <p className="text-xs text-muted-foreground">Username cannot be changed</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <Button type="submit">Save Changes</Button>
              </form>
            </CardContent>
          </Card>}

          {passwordManagementEnabled && <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Use your current password to set a new one</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    required
                  />
                </div>
                <Button type="submit">Update Password</Button>
              </form>
            </CardContent>
          </Card>}

          {/* Color Scheme */}
          <Card>
            <CardHeader>
              <CardTitle>Color Scheme</CardTitle>
              <CardDescription>Choose your preferred color theme (WCAG AA compliant)</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={user.prefs.colorScheme}
                onValueChange={(value) => handlePrefChange("colorScheme", value)}
                className="grid grid-cols-2 gap-3 sm:grid-cols-3"
              >
                {colorSchemes.map((scheme) => {
                  const colors = user.prefs.theme === "dark" ? scheme.dark : scheme.light;
                  const isSelected = user.prefs.colorScheme === scheme.id;
                  
                  return (
                    <Label
                      key={scheme.id}
                      htmlFor={scheme.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-muted-foreground/50"
                      }`}
                    >
                      <RadioGroupItem value={scheme.id} id={scheme.id} className="sr-only" />
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `hsl(${colors.primary})` }}
                      >
                        {isSelected && (
                          <Check 
                            className="h-4 w-4" 
                            style={{ color: `hsl(${colors.primaryForeground})` }} 
                          />
                        )}
                      </div>
                      <span className="text-sm font-medium">{scheme.name}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Theme & Appearance */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>Customize how you view recipes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Switch between light and dark theme</p>
                </div>
                <Switch
                  checked={user.prefs.theme === "dark"}
                  onCheckedChange={(checked) => handlePrefChange("theme", checked ? "dark" : "light")}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="density">Card Density</Label>
                <select
                  id="density"
                  value={user.prefs.density}
                  onChange={(e) => handlePrefChange("density", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="cozy">Cozy</option>
                  <option value="compact">Compact</option>
                </select>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="cook-font">Cook Mode Font Size</Label>
                <select
                  id="cook-font"
                  value={user.prefs.cookFontSize}
                  onChange={(e) => handlePrefChange("cookFontSize", e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                  <option value="x-large">Extra Large</option>
                </select>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>High Contrast</Label>
                  <p className="text-sm text-muted-foreground">Increase contrast for better readability</p>
                </div>
                <Switch
                  checked={user.prefs.highContrast}
                  onCheckedChange={(checked) => handlePrefChange("highContrast", checked)}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <Label>Reduce Motion</Label>
                  <p className="text-sm text-muted-foreground">Minimize animations and transitions</p>
                </div>
                <Switch
                  checked={user.prefs.reduceMotion}
                  onCheckedChange={(checked) => handlePrefChange("reduceMotion", checked)}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
