/**
 * MUSE — Authentication Module
 * ==============================
 * Handles signup, signin, signout, password reset, session management,
 * profile creation, and page-level access guards.
 *
 * @module auth
 */

import { supabase, getSupabaseConfig } from './supabase.js';

const DEMO_SESSION_KEY = 'MUSE_DEMO_SESSION';
const DEMO_PROFILE_KEY = 'MUSE_DEMO_PROFILE';

function _isLive() {
  return getSupabaseConfig().isConnected;
}

function _slug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'creator';
}

function _titleCase(value) {
  return String(value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Demo Creator';
}

/**
 * Normalize a username to the format enforced by the database:
 * lowercase letters, numbers and underscores, 3–30 characters.
 * @param {string} value
 * @returns {string}
 */
function _normalizeUsername(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function _isValidUsername(value) {
  return /^[a-z0-9_]{3,30}$/.test(String(value || ''));
}

/**
 * Build a collision-resistant fallback username from the auth user.
 * @param {object} user
 * @param {object} [meta]
 * @returns {string}
 */
function _generatedUsername(user, meta = {}) {
  const raw = _normalizeUsername(
    meta.username || (user.email ? user.email.split('@')[0] : 'creator')
  );
  const base = raw.length >= 3 ? raw : 'creator';
  return `${base}_${user.id.slice(0, 6)}`.slice(0, 30);
}

/**
 * Check whether a username is already used by another profile.
 * @param {string} username
 * @param {string|null} [exceptUserId]
 * @returns {Promise<boolean>}
 */
async function _isUsernameTaken(username, exceptUserId = null) {
  let query = supabase
    .from('profiles')
    .select('id')
    .eq('username', username);

  if (exceptUserId) query = query.neq('id', exceptUserId);

  const { data, error } = await query.limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

function _readDemoSession() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function readDemoProfile() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_PROFILE_KEY) || 'null');
  } catch {
    return null;
  }
}

function _saveDemoProfile(profile) {
  try {
    localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* storage quota — ignore */
  }
  return profile;
}

export function saveDemoProfile(updates) {
  const base = readDemoProfile() || {};
  return _saveDemoProfile({ ...base, ...updates });
}

function _createDemoUser(email, fullName, username) {
  const handle = _slug(username || (email ? email.split('@')[0] : fullName));
  const user = {
    id: 'demo-' + handle,
    email: (email || `${handle}@muse.demo`).trim(),
    created_at: new Date().toISOString(),
    user_metadata: {
      full_name: (fullName || _titleCase(handle)).trim(),
      username: handle,
    },
  };
  localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(user));

  const existing = readDemoProfile();
  const sameUser = existing && existing.id === user.id;
  _saveDemoProfile({
    id: user.id,
    email: user.email,
    full_name: user.user_metadata.full_name,
    username: user.user_metadata.username,
    bio: sameUser ? existing.bio : 'Independent designer & developer exploring MUSE in demo mode.',
    skills: sameUser ? existing.skills : 'Design Systems, Typography, Figma, Editorial',
    avatar_url: sameUser ? existing.avatar_url : null,
    website: sameUser ? existing.website : '',
    created_at: user.created_at,
  });
  return user;
}

/* ================================================================== */
/*  Sign Up                                                           */
/* ================================================================== */

/**
 * Register a new user and create their profile row.
 *
 * @param {string} email     — User's email address
 * @param {string} password  — Chosen password (≥ 6 chars)
 * @param {string} fullName  — Display name
 * @param {string} username  — Unique handle (lowercase, no spaces)
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function signUp(email, password, fullName, username) {
  try {
    if (!_isLive()) {
      const user = _createDemoUser(email, fullName, username);
      return { data: { user, session: { user } }, error: null };
    }

    const desiredUsername = _normalizeUsername(username);

    // 1) Check username availability first
    const { data: existing, error: lookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', desiredUsername)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing) {
      return { data: null, error: { message: 'Username is already taken.' } };
    }

    // 2) Create the auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: new URL('profile.html', window.location.href).href,
        data: {
          full_name: fullName.trim(),
          username: desiredUsername,
        },
      },
    });

    if (authError) throw authError;

    // 3) Insert or update the profile row.
    // When email confirmation is enabled there is no session yet, so a
    // client-side insert is blocked by RLS — the DB trigger handles it instead.
    // The chosen username is also kept in auth metadata so it can be synced
    // to the profile the first time the user signs in.
    if (authData.user && authData.session) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: authData.user.id,
        email: authData.user.email || email.trim(),
        full_name: fullName.trim(),
        username: desiredUsername,
        avatar_url: null,
        bio: '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });

      if (profileError) {
        console.error(
          '[auth] Profile row was not created. Make sure supabase_schema.sql was run in your Supabase SQL Editor (tables + trigger + RLS policies). Details:',
          profileError.message
        );
      }
    } else if (authData.user) {
      console.info(
        '[auth] Email confirmation is required, so the profile row is created by the "on_auth_user_created" DB trigger. The chosen username is synced from auth metadata on first sign-in.'
      );
    }

    return { data: authData, error: null };
  } catch (error) {
    console.error('[auth] signUp:', error.message);
    return { data: null, error };
  }
}

/* ================================================================== */
/*  Sign In                                                           */
/* ================================================================== */

/**
 * Authenticate an existing user with email + password.
 *
 * @param {string} email    — User's email
 * @param {string} password — User's password
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function signIn(email, password) {
  try {
    if (!_isLive()) {
      const typedEmail = (email || '').trim().toLowerCase();
      const existing = _readDemoSession();
      const saved = readDemoProfile();

      let handle = (email || '').split('@')[0];
      let fullName = null;

      if (existing && String(existing.email || '').toLowerCase() === typedEmail) {
        handle = existing.user_metadata?.username || handle;
        fullName = existing.user_metadata?.full_name || null;
      } else if (saved && String(saved.email || '').toLowerCase() === typedEmail) {
        handle = saved.username || handle;
        fullName = saved.full_name || null;
      }

      const user = _createDemoUser(email, fullName, handle);
      return { data: { user, session: { user } }, error: null };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) throw error;

    // Heal accounts that have an auth user but no profile row yet
    // (e.g. registered before the DB trigger was installed).
    try {
      const ensured = await ensureCurrentProfile();
      if (ensured.error) {
        console.warn('[auth] Could not ensure profile after sign-in:', ensured.error.message);
      }
    } catch (ensureErr) {
      console.warn('[auth] Could not ensure profile after sign-in:', ensureErr.message);
    }

    return { data, error: null };
  } catch (error) {
    console.error('[auth] signIn:', error.message);
    return { data: null, error };
  }
}

/* ================================================================== */
/*  Sign Out                                                          */
/* ================================================================== */

/**
 * Sign the current user out and clear the session.
 *
 * @returns {Promise<{error: object|null}>}
 */
export async function signOut() {
  try {
    if (!_isLive()) {
      localStorage.removeItem(DEMO_SESSION_KEY);
      return { error: null };
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('[auth] signOut:', error.message);
    return { error };
  }
}

/* ================================================================== */
/*  Password Reset                                                    */
/* ================================================================== */

/**
 * Send a password-reset email to the given address.
 *
 * @param {string} email — Email tied to the account
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function resetPassword(email) {
  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        // Redirect URL after the user clicks the reset link.
        // Update this to your production domain.
        redirectTo: `${window.location.origin}/pages/reset-password.html`,
      }
    );

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[auth] resetPassword:', error.message);
    return { data: null, error };
  }
}

/* ================================================================== */
/*  Current User / Session                                            */
/* ================================================================== */

/**
 * Retrieve the currently signed-in user (from cached session).
 *
 * @returns {Promise<{data: {user: object|null}, error: object|null}>}
 */
export async function getCurrentUser() {
  try {
    if (!_isLive()) {
      return { data: { user: _readDemoSession() }, error: null };
    }

    // Prefer the locally persisted session so the UI stays signed in even if
    // a transient network/auth refresh hiccup occurs.
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData?.session?.user) {
      // Best-effort server validation; never drop a valid local session on
      // transient failures (the auth client will refresh tokens as needed).
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user) return { data, error: null };
      } catch (validationError) {
        console.debug('[auth] getUser validation skipped:', validationError.message);
      }
      return { data: { user: sessionData.session.user }, error: null };
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[auth] getCurrentUser:', error.message);
    return { data: { user: null }, error };
  }
}

/**
 * Get the current session object (includes tokens).
 *
 * @returns {Promise<{data: {session: object|null}, error: object|null}>}
 */
export async function getSession() {
  try {
    if (!_isLive()) {
      const user = _readDemoSession();
      return { data: { session: user ? { user } : null }, error: null };
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[auth] getSession:', error.message);
    return { data: { session: null }, error };
  }
}

/* ================================================================== */
/*  Auth State Change Listener                                        */
/* ================================================================== */

/**
 * Subscribe to authentication state changes (sign-in, sign-out, token refresh).
 *
 * @param {Function} callback — Receives (event, session).
 *   Events: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY'
 * @returns {{ data: { subscription: object } }}
 */
export function onAuthStateChange(callback) {
  if (!_isLive()) {
    return { data: { subscription: { unsubscribe() {} } } };
  }

  return supabase.auth.onAuthStateChange((event, session) => {
    console.log('[auth] state change:', event);
    callback(event, session);
  });
}

/* ================================================================== */
/*  Session Restoration                                               */
/* ================================================================== */

/**
 * Attempt to restore the session on page load.
 * Supabase SDK handles this internally via `persistSession: true`,
 * but this wrapper lets us hook extra logic (e.g. update navbar).
 *
 * @param {Function} [onRestored] — Called with the restored session (or null).
 * @returns {Promise<void>}
 */
export async function restoreSession(onRestored) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (typeof onRestored === 'function') {
      onRestored(session);
    }
  } catch (error) {
    console.error('[auth] restoreSession:', error.message);
    if (typeof onRestored === 'function') {
      onRestored(null);
    }
  }
}

/* ================================================================== */
/*  Redirect Helpers                                                  */
/* ================================================================== */

/**
 * Guard: redirect to the login page if the user is NOT authenticated.
 * Call at the top of any page that requires login.
 *
 * @param {string} [loginPath='../pages/login.html'] — Relative path to the login page
 * @returns {Promise<object|null>} — `{ user }` if authenticated, or null (and redirect).
 */
export async function requireAuth(loginPath = '../pages/login.html') {
  const { data } = await getCurrentUser();

  if (!data.user) {
    window.location.href = loginPath;
    return null;
  }

  // Heal a missing profile row so protected pages always have data.
  try {
    const ensured = await ensureCurrentProfile();
    if (ensured.error) {
      console.warn('[auth] Could not ensure profile:', ensured.error.message);
    }
  } catch (ensureErr) {
    console.warn('[auth] Could not ensure profile:', ensureErr.message);
  }

  return data;
}

/**
 * Guard: redirect to the feed/home if the user IS already authenticated.
 * Useful on the login / signup pages.
 *
 * @param {string} [feedPath='../pages/feed.html'] — Relative path to the feed/home page
 * @returns {Promise<void>}
 */
export async function redirectIfAuthenticated(feedPath = '../pages/feed.html') {
  const { data } = await getCurrentUser();

  if (data.user) {
    window.location.href = feedPath;
  }
}

/* ================================================================== */
/*  Profile Helpers                                                   */
/* ================================================================== */

/**
 * Fetch the full profile row for the currently authenticated user.
 *
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function getCurrentProfile() {
  try {
    if (!_isLive()) {
      const user = _readDemoSession();
      if (!user) return { data: null, error: { message: 'Not authenticated.' } };
      return { data: readDemoProfile(), error: null };
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return { data: null, error: { message: 'Not authenticated.' } };

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[auth] getCurrentProfile:', error.message);
    return { data: null, error };
  }
}

/**
 * Return the current user's profile, creating a basic row if it is missing.
 * This heals accounts that were registered before the DB trigger existed.
 *
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function ensureCurrentProfile() {
  const { data: userData } = await getCurrentUser();
  const user = userData?.user || null;
  if (!user) return { data: null, error: { message: 'Not authenticated.' } };

  const existing = await getCurrentProfile();
  if (!_isLive()) return existing;

  const meta = user.user_metadata || {};

  // Existing row: heal missing email/name and replace a trigger-generated
  // username with the username the person actually chose at signup.
  if (existing.data) {
    const updates = {};

    if (!existing.data.email && user.email) {
      updates.email = user.email;
    }

    if (!existing.data.full_name && meta.full_name) {
      updates.full_name = meta.full_name;
    }

    const desiredUsername = _normalizeUsername(meta.username);
    const currentUsername = String(existing.data.username || '');
    const autoGenerated =
      !currentUsername ||
      currentUsername.endsWith(`_${user.id.slice(0, 6)}`);

    if (
      autoGenerated &&
      _isValidUsername(desiredUsername) &&
      desiredUsername !== currentUsername
    ) {
      try {
        const taken = await _isUsernameTaken(desiredUsername, user.id);
        if (!taken) updates.username = desiredUsername;
      } catch (lookupError) {
        console.warn('[auth] Username sync lookup failed:', lookupError.message);
      }
    }

    if (Object.keys(updates).length > 0) {
      try {
        const { data: updated, error: updateError } = await supabase
          .from('profiles')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', user.id)
          .select()
          .single();

        if (!updateError && updated) {
          return { data: updated, error: null };
        }
        if (updateError) {
          console.warn('[auth] Profile sync failed:', updateError.message);
        }
      } catch (updateError) {
        console.warn('[auth] Profile sync failed:', updateError.message);
      }
    }

    return existing;
  }

  // No row yet: create one with the chosen username when it is available.
  const desiredUsername = _normalizeUsername(meta.username);
  const preferredUsername = _isValidUsername(desiredUsername)
    ? desiredUsername
    : _generatedUsername(user, meta);

  const baseRow = {
    id: user.id,
    email: user.email || null,
    full_name: meta.full_name || 'Creative Creator',
    avatar_url: meta.avatar_url || null,
  };

  try {
    const { data, error } = await supabase
      .from('profiles')
      .upsert(
        { ...baseRow, username: preferredUsername },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (!error) return { data, error: null };

    // Username may have been claimed between signup and first sign-in.
    // Retry with a guaranteed-unique fallback instead of failing the page.
    if (error.code === '23505' || /duplicate key/i.test(error.message || '')) {
      const fallbackUsername = _generatedUsername(user, meta);
      const retry = await supabase
        .from('profiles')
        .upsert(
          { ...baseRow, username: fallbackUsername },
          { onConflict: 'id' }
        )
        .select()
        .single();

      return { data: retry.data, error: retry.error };
    }

    return { data: null, error };
  } catch (error) {
    console.error('[auth] ensureCurrentProfile:', error.message);
    return { data: null, error };
  }
}

/**
 * Update the profile for the currently authenticated user.
 *
 * @param {object} updates — Fields to update (full_name, username, bio, avatar_url, etc.)
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function updateCurrentProfile(updates) {
  try {
    if (!_isLive()) {
      if (!_readDemoSession()) return { data: null, error: { message: 'Not authenticated.' } };
      return { data: saveDemoProfile(updates), error: null };
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return { data: null, error: { message: 'Not authenticated.' } };

    const { data, error } = await supabase
      .from('profiles')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[auth] updateCurrentProfile:', error.message);
    return { data: null, error };
  }
}
