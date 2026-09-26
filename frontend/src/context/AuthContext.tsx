"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AuthResponse, Role, UserProfile } from "@/lib/types";

interface AuthContextType {
  authenticated: boolean;
  role: Role | null;
  user: UserProfile | null;
  loading: boolean;
  login: (data: AuthResponse) => void;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  updateUser: (updatedUser: Partial<UserProfile>) => void;
}

interface AuthSnapshot {
  authenticated?: boolean;
  role?: Role;
  user?: UserProfile | null;
}

async function getAuthSnapshot(): Promise<AuthSnapshot> {
  const res = await fetch("/api/auth/me", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Auth check failed with status ${res.status}`);
  }
  return (await res.json()) as AuthSnapshot;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Applies a fetched auth snapshot. Only ever called from event handlers or
  // promise callbacks, never synchronously from an effect body.
  const applyAuthSnapshot = useCallback((snapshot: AuthSnapshot) => {
    const isAuthenticated = snapshot.authenticated === true;
    setAuthenticated(isAuthenticated);
    setRole(isAuthenticated ? (snapshot.role ?? null) : null);
    setUser(isAuthenticated ? (snapshot.user ?? null) : null);
    setLoading(false);
  }, []);

  const fetchAuth = useCallback(async () => {
    try {
      applyAuthSnapshot(await getAuthSnapshot());
    } catch {
      applyAuthSnapshot({ authenticated: false });
    }
  }, [applyAuthSnapshot]);

  useEffect(() => {
    let ignore = false;

    getAuthSnapshot()
      .then((snapshot) => {
        if (!ignore) applyAuthSnapshot(snapshot);
      })
      .catch(() => {
        if (!ignore) applyAuthSnapshot({ authenticated: false });
      });

    const handleAuthChange = () => {
      void fetchAuth();
    };

    window.addEventListener("dtp-auth-change", handleAuthChange);
    return () => {
      ignore = true;
      window.removeEventListener("dtp-auth-change", handleAuthChange);
    };
  }, [applyAuthSnapshot, fetchAuth]);

  const login = useCallback((data: AuthResponse) => {
    setAuthenticated(true);
    setRole(data.user.role);
    setUser(data.user);
    setLoading(false);
    // Broadcast event for other listeners
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("dtp-auth-change"));
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthenticated(false);
    setRole(null);
    setUser(null);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("dtp-auth-change"));
      }
    }
  }, []);

  const updateUser = useCallback((updated: Partial<UserProfile>) => {
    setUser((prev) => (prev ? { ...prev, ...updated } : null));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authenticated,
        role,
        user,
        loading,
        login,
        logout,
        refreshAuth: fetchAuth,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
