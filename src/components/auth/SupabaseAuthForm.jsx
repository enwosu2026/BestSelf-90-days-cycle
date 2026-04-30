import { useState, useEffect, useCallback, useRef } from "react";
import { Mail, Lock, Eye, EyeOff, User } from "lucide-react";
import { C } from "../../theme/colors.js";
import { getSupabase, isSupabaseConfigured } from "../../lib/supabaseClient.js";
import { Logo } from "../ui/Primitives.jsx";

const GOLD = "#D1AF33";
const CREAM = "#FDFBF7";
const DARK_INDIGO = "#0B0E1C";
const BLOCKED_OAUTH_HOST_SNIPPETS = ["ai.google.dev", "aistudio.google.com", "run.app", "cloud-run"];

function isValidHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isBlockedOAuthHost(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return BLOCKED_OAUTH_HOST_SNIPPETS.some((part) => hostname.includes(part));
  } catch {
    return true;
  }
}

function hasRecoveryParams() {
  const search = new URLSearchParams(window.location.search);
  const hashRaw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const hash = new URLSearchParams(hashRaw);

  return (
    search.get("type") === "recovery" ||
    hash.get("type") === "recovery" ||
    !!search.get("recovery_token") ||
    !!hash.get("recovery_token") ||
    (!!hash.get("access_token") && hash.get("type") === "recovery")
  );
}

/**
 * Social Login component.
 */
function SocialLogins({ mode = "signin", onGoogle, loading }) {
  const btnStyle = {
    width: "100%",
    background: "white",
    border: "1px solid #E5E7EB",
    borderRadius: 12,
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    cursor: loading ? "wait" : "pointer",
    color: "#374151",
    fontSize: 14,
    fontWeight: 600,
    transition: "all 0.2s"
  };

  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
        Or
      </p>
      <button 
        className="tap" 
        style={btnStyle} 
        onClick={onGoogle}
        disabled={!!loading}
      >
        <svg width={20} height={20} viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-3.59-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {mode === "signin" ? "Log in with Google" : "Sign up with Google"}
      </button>
    </div>
  );
}

/**
 * Email/password sign-up & sign-in plus Google OAuth.
 */
export function SupabaseAuthForm({ onAuthSuccess, onDevBypass }) {
  const [tab, setTab] = useState("login"); // signup | login | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(null);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [isRecoveryMode, setIsRecoveryMode] = useState(hasRecoveryParams);
  const googleTimerRef = useRef(null);

  const supabase = getSupabase();
  const configured = isSupabaseConfigured() && supabase;

  const getOAuthRedirectUrl = useCallback(() => {
    const configuredRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
    const fallbackRedirect = `${window.location.origin}/`;
    const candidate = configuredRedirect || fallbackRedirect;

    if (isValidHttpUrl(candidate) && !isBlockedOAuthHost(candidate)) {
      return candidate;
    }

    if (isValidHttpUrl(fallbackRedirect) && !isBlockedOAuthHost(fallbackRedirect)) {
      return fallbackRedirect;
    }

    return null;
  }, []);

  const emitSuccess = useCallback(
    (session, isSignUp = false) => {
      const u = session.user;
      onAuthSuccess({
        userId: u.id,
        email: u.email || "",
        name: u.user_metadata?.full_name || u.user_metadata?.name || fullName || "",
        method: u.app_metadata?.provider === "google" ? "google" : u.email ? "email" : "oauth",
        isSignUp,
      });
    },
    [onAuthSuccess, fullName]
  );

  useEffect(() => {
    return () => {
      if (googleTimerRef.current) clearInterval(googleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!configured || !supabase) return;
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error("Auth Form - Session Error:", error.message);
        if (error.message.includes("Refresh Token Not Found") || error.status === 400 || error.message.includes("invalid_grant")) {
          supabase.auth.signOut();
        }
        return;
      }
      if (session?.user) {
        if (isRecoveryMode) {
          setTab("reset");
          return;
        }
        emitSuccess(session);
      }
    });
  }, [configured, supabase, emitSuccess, isRecoveryMode]);

  useEffect(() => {
    if (!configured || !supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecoveryMode(true);
        setTab("reset");
        setErr("");
        setInfo("Set your new password below.");
      }
    });
    return () => subscription.unsubscribe();
  }, [configured, supabase]);

  async function handleEmailSubmit() {
    setErr("");
    setInfo("");
    if (!email.trim() || !password) {
      setErr("Please enter email and password.");
      return;
    }
    if (tab === "signup" && password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }

    setLoading("email");
    try {
      if (tab === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { 
              full_name: fullName || email.split("@")[0],
              name: fullName || email.split("@")[0] 
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          emitSuccess(data.session, true);
        } else {
          setInfo("Check your email to confirm your account, then sign in.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        if (data.session) emitSuccess(data.session, false);
      }
    } catch (e) {
      setErr(e.message || "Authentication failed.");
    } finally {
      setLoading(null);
    }
  }

  async function handleGoogle() {
    setErr("");
    setLoading("google");
    try {
      const redirectTo = getOAuthRedirectUrl();
      if (!redirectTo) {
        throw new Error("No safe OAuth redirect URL found. Set VITE_AUTH_REDIRECT_URL to your Netlify app URL.");
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { access_type: "offline", prompt: "consent" },
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;

      if (data?.url) {
        if (isBlockedOAuthHost(data.url)) {
          throw new Error("Blocked invalid OAuth destination. Please check your Supabase redirect URLs.");
        }
        const authWindow = window.open(data.url, "google_auth", "width=600,height=700");
        
        if (!authWindow) {
          setErr("Popup blocked. Please allow popups for this site.");
          setLoading(null);
          return;
        }

        googleTimerRef.current = setInterval(async () => {
          if (authWindow.closed) {
            clearInterval(googleTimerRef.current);
            setLoading(null);
          }
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            clearInterval(googleTimerRef.current);
            authWindow.close();
            emitSuccess(session);
          }
        }, 1000);
      }
    } catch (e) {
      setErr(e.message || "Google sign-in failed.");
      setLoading(null);
    }
  }

  async function handleForgotPassword() {
    setErr("");
    setInfo("");
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErr("Enter your email first, then tap Forget password.");
      return;
    }

    setLoading("forgot");
    try {
      const redirectTo = getOAuthRedirectUrl();
      if (!redirectTo) {
        throw new Error("No safe reset redirect URL found. Set VITE_AUTH_REDIRECT_URL to your Netlify app URL.");
      }
      const resetRedirect = new URL(redirectTo);
      resetRedirect.searchParams.set("type", "recovery");

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: resetRedirect.toString(),
      });
      if (error) throw error;
      setInfo("Password reset email sent. Open the email link to set a new password.");
    } catch (e) {
      setErr(e.message || "Could not send reset email.");
    } finally {
      setLoading(null);
    }
  }

  async function handlePasswordReset() {
    setErr("");
    setInfo("");
    if (!password) {
      setErr("Enter your new password.");
      return;
    }
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading("reset");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setInfo("Password updated. You can now log in with your new password.");
      setPassword("");
      setConfirm("");
      setIsRecoveryMode(false);
      setTab("login");

      const next = new URL(window.location.href);
      next.searchParams.delete("type");
      next.searchParams.delete("code");
      window.history.replaceState({}, "", `${next.pathname}${next.search}`);
    } catch (e) {
      setErr(e.message || "Could not update password.");
    } finally {
      setLoading(null);
    }
  }

  const inputGroupStyle = { marginBottom: 20 };
  const labelStyle = { display: "block", fontSize: 13, fontWeight: 700, color: "black", marginBottom: 6, textAlign: "left" };
  const inputStyle = {
    width: "100%",
    background: "#FFFFFF",
    border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 12,
    color: "#000",
    fontSize: 15,
    padding: "20px 24px",
    outline: "none",
    fontWeight: 500
  };

  const primaryBtnStyle = {
    width: "100%",
    background: C.forest,
    color: "white",
    border: "none",
    borderRadius: 4, // Sharp corners as requested "sharp corners"
    padding: "20px",
    fontSize: 16,
    fontWeight: 800,
    cursor: loading ? "wait" : "pointer",
    marginBottom: 32,
    transition: "all 0.2s"
  };

  if (!configured) {
    const isNetlify = window.location.hostname.includes("netlify.app");
    const isAIStudio = window.location.hostname.includes("europe-west2.run.app") || window.location.hostname.includes("cloud-run");
    const missing = [];
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url) missing.push("VITE_SUPABASE_URL");
    if (!anon) missing.push("VITE_SUPABASE_ANON_KEY");

    return (
      <div className="fadein" style={{ minHeight: "100vh", background: "#F9F9F7", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: "100%", maxWidth: 440, textAlign: "center", background: "white", padding: 40, borderRadius: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.05)" }}>
          <div style={{ marginBottom: 24, display: "flex", justifyContent: "center" }}>
            <Logo size={24} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "black", marginBottom: 12 }}>
            Supabase Not Connected
          </h2>
          <div style={{ color: "#6B7280", fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            {isAIStudio ? (
               <p>
                 <b>AI Studio Action Required:</b> Go to the <b>Settings</b> gear icon in the top right. 
                 Select <b>Environment Variables</b> and add the keys below. 
                 Then click <b>Restart Server</b>.
               </p>
            ) : isNetlify ? (
              <p>Your Netlify site needs environment variables in Site Settings {"->"} Environment variables. Re-deploy after adding them.</p>
            ) : (
              <p>To enable authentication and data sync, you need to provide your Supabase project credentials in your .env file.</p>
            )}
          </div>

          <div style={{ textAlign: "left", background: "#F3F4F6", borderRadius: 12, padding: 16, marginBottom: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#4B5563", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Missing Variables:</p>
            {missing.map(m => (
              <div key={m} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#EF4444" }} />
                <code style={{ fontSize: 12, color: "#1F2937", background: "#E5E7EB", padding: "2px 6px", borderRadius: 4 }}>{m}</code>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {onDevBypass && (
              <button className="tap" onClick={onDevBypass} style={{ ...primaryBtnStyle, borderRadius: 12, marginBottom: 0 }}>
                Continue Offline (Local Only)
              </button>
            )}
            <a 
              href="https://supabase.com/dashboard" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ fontSize: 13, color: GOLD, fontWeight: 700, textDecoration: "none", marginTop: 8 }}
            >
              Go to Supabase Dashboard {"->"}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: "100vh", 
      width: "100%", 
      position: "relative", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center",
      fontFamily: "Inter, sans-serif",
      overflow: "hidden"
    }}>
      {/* Background Image - Yoga meditative pose */}
      <img 
        src="https://www.image2url.com/r2/default/images/1776473654196-30271d68-7489-4b2c-ba7a-1a36835fa8c6.png"
        alt="Background"
        referrerPolicy="no-referrer"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          zIndex: -1,
          filter: "brightness(0.95)"
        }}
      />

      <div className="rise" style={{ width: "100%", maxWidth: 480, padding: 32, textAlign: "center" }}>
        
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
          <Logo size={24} />
        </div>

        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 24, fontWeight: 500, color: "black", letterSpacing: "-0.01em" }}>
            {tab === "login" ? "Welcome back" : tab === "signup" ? "Create account" : "Reset password"}
          </h2>
        </div>

        {tab === "signup" && (
          <div style={inputGroupStyle}>
            <label style={labelStyle}>Full Name</label>
            <input 
              value={fullName} 
              onChange={(e) => setFullName(e.target.value)} 
              placeholder="Joe Doe" 
              style={inputStyle} 
            />
          </div>
        )}

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Email</label>
          <input 
            value={email} 
            onChange={(e) => setEmail(e.target.value)} 
            placeholder="jamesjoe@mail.com" 
            type="email" 
            style={inputStyle} 
            autoComplete="email" 
          />
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>{tab === "reset" ? "New Password" : "Password"}</label>
          <div style={{ position: "relative" }}>
            <input 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••" 
              type={showPassword ? "text" : "password"} 
              style={inputStyle} 
              autoComplete={tab === "signup" || tab === "reset" ? "new-password" : "current-password"} 
              onKeyDown={(e) => e.key === "Enter" && (tab === "reset" ? handlePasswordReset() : handleEmailSubmit())} 
            />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {showPassword ? <EyeOff size={18} color="#888" /> : <Eye size={18} color="#888" />}
            </button>
          </div>
        </div>

        {(tab === "signup" || tab === "reset") && (
          <div style={inputGroupStyle}>
            <label style={labelStyle}>{tab === "reset" ? "Confirm New Password" : "Confirm Password"}</label>
            <input 
              value={confirm} 
              onChange={(e) => setConfirm(e.target.value)} 
              placeholder="••••••••" 
              type={showPassword ? "text" : "password"} 
              style={inputStyle} 
              autoComplete="new-password" 
            />
          </div>
        )}

        {tab === "login" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "black", fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={rememberMe} onChange={() => setRememberMe(!rememberMe)} style={{ accentColor: DARK_INDIGO, width: 16, height: 16 }} />
              Remember me
            </label>
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={!!loading}
              style={{ background: "none", border: "none", color: GOLD, fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.8 : 1 }}
            >
              {loading === "forgot" ? "Sending..." : "Forget password?"}
            </button>
          </div>
        )}

        {err && <p style={{ color: "#EF4444", fontSize: 13, marginBottom: 16, fontWeight: 600 }}>{err}</p>}
        {info && <p style={{ color: "#10B981", fontSize: 13, marginBottom: 16, fontWeight: 600 }}>{info}</p>}

        <button 
          type="button" 
          onClick={tab === "reset" ? handlePasswordReset : handleEmailSubmit}
          disabled={!!loading}
          className="tap"
          style={primaryBtnStyle}
        >
          {loading === "email" || loading === "reset"
            ? "Loading..."
            : tab === "login"
              ? "Log In"
              : tab === "signup"
                ? "Create Account"
                : "Update Password"}
        </button>

        {tab !== "reset" && (
          <SocialLogins 
            mode={tab === "login" ? "signin" : "signup"} 
            onGoogle={handleGoogle}
            loading={loading === "google"}
          />
        )}

        <div style={{ marginTop: 40, textAlign: "center" }}>
          <p style={{ color: "black", fontSize: 14, fontWeight: 500 }}>
            {tab === "login"
              ? "Don't have an account? "
              : tab === "signup"
                ? "Already have an account? "
                : "Back to login? "}
            <button 
              type="button" 
              onClick={() => {
                if (tab === "reset") {
                  setTab("login");
                  setIsRecoveryMode(false);
                } else {
                  setTab(tab === "login" ? "signup" : "login");
                }
                setErr("");
                setInfo("");
                setPassword("");
                setConfirm("");
              }}
              style={{ background: "none", border: "none", color: GOLD, fontWeight: 900, cursor: "pointer", padding: 0, fontSize: 14 }}
            >
              {tab === "login" ? "Sign Up" : "Log In"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
