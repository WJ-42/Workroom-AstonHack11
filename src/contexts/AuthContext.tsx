import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { login as apiLogin, register as apiRegister, logout as apiLogout, AuthResponse } from '../api/auth';
import { getToken, isAuthError, setToken } from '../api/client';
import { clearSession, loadSession, saveSession } from '../auth/savedSession';
import { setLoggedIn, logout as sessionLogout } from '../store/session';
import { finishSessionOnLogout, reconcileOnLogin, startCloudSync } from '../sync/cloudSync';

interface AuthUser {
  email: string;
  displayName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
  updateDisplayName: (name: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Reads the login saved for this tab (if any) so the very first render is
// already signed in and a refresh does not flash the logged-out state.
function restoreUser(): AuthUser | null {
  const saved = loadSession();
  if (!saved) return null;
  setToken(saved.token);
  return { email: saved.email, displayName: saved.displayName };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(restoreUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoreChecked = useRef(false);

  // After a refresh, make sure the saved token is still accepted and bring
  // the browser's decks back in line with the account.
  useEffect(() => {
    if (restoreChecked.current) return;
    restoreChecked.current = true;
    const saved = loadSession();
    if (!saved) return;
    void (async () => {
      try {
        await reconcileOnLogin(saved.email);
        startCloudSync();
      } catch (err) {
        if (isAuthError(err)) {
          // Token expired or was rejected: back to a logged-out state.
          setToken(null);
          clearSession();
          sessionLogout();
          setUser(null);
        } else {
          console.warn('Could not restore session:', err);
          startCloudSync();
        }
      }
    })();
  }, []);

  const handleAuthSuccess = useCallback(async (response: AuthResponse) => {
    setUser({ email: response.email, displayName: response.displayName });
    setLoggedIn(true);
    saveSession({ token: response.token, email: response.email, displayName: response.displayName });
    // Merge this account's cloud decks with what is in the browser (clearing
    // it first if it belongs to a different account), then keep them synced.
    await reconcileOnLogin(response.email);
    startCloudSync();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiLogin(email, password);
      await handleAuthSuccess(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthSuccess]);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRegister(email, password, displayName);
      await handleAuthSuccess(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [handleAuthSuccess]);

  const logout = useCallback(() => {
    // Log out in the UI straight away, but keep the token until unsaved
    // flashcards have been pushed, then clear this browser's copy.
    const token = getToken();
    clearSession();
    sessionLogout();
    setUser(null);
    setError(null);
    void finishSessionOnLogout().finally(() => {
      // Skip if someone logged in again in the meantime.
      if (getToken() === token) apiLogout();
    });
  }, []);

  const updateDisplayName = useCallback((name: string) => {
    setUser(prev => prev ? { ...prev, displayName: name } : null);
    const saved = loadSession();
    if (saved) saveSession({ ...saved, displayName: name });
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isLoggedIn: user !== null,
      isLoading,
      error,
      login,
      register,
      logout,
      updateDisplayName,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
