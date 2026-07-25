// Combined login and signup page for guest-to-account conversion.

import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ChefHat } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const { login, signup, authenticationRequired, registrationEnabled } = useAuth();
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [signupData, setSignupData] = useState({ username: "", password: "", name: "", email: "" });

  if (!authenticationRequired) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await login(loginData.username, loginData.password)) {
      toast.success("Welcome back!");
      navigate("/");
    } else {
      toast.error("Invalid username or password");
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await signup(signupData.username, signupData.password, signupData.name, signupData.email)) {
      toast.success("Account created! You're now logged in.");
      navigate("/");
    } else {
      toast.error("Username already exists");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <ChefHat className="h-12 w-12 mx-auto mb-4 text-primary" />
          <h1 className="text-3xl font-semibold mb-2">Welcome to EMMA</h1>
          <p className="text-muted-foreground">
            Easy Meals Made Accessible. Browse recipes as a guest, or sign in to personalize your experience.
          </p>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            {registrationEnabled && <TabsTrigger value="signup">Sign Up</TabsTrigger>}
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>Login</CardTitle>
                <CardDescription>Enter your credentials to access your personalized settings</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username">Username</Label>
                    <Input
                      id="login-username"
                      value={loginData.username}
                      onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Login
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {registrationEnabled && <TabsContent value="signup">
            <Card>
              <CardHeader>
                <CardTitle>Create Account</CardTitle>
                <CardDescription>Sign up to save your preferences and customize your experience</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Name</Label>
                    <Input
                      id="signup-name"
                      value={signupData.name}
                      onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-username">Username</Label>
                    <Input
                      id="signup-username"
                      value={signupData.username}
                      onChange={(e) => setSignupData({ ...signupData, username: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email (optional)</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={signupData.email}
                      onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      value={signupData.password}
                      onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Sign Up
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>}
        </Tabs>

        <div className="text-center mt-6">
          <Button variant="link" onClick={() => navigate("/")}>
            Continue as guest
          </Button>
        </div>
      </div>
    </div>
  );
}
