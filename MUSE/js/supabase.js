/**
 * MUSE — Supabase Client Initialization & Integration Helpers
 * ============================================================
 * Configures and exports the Supabase client instance.
 * Supports credentials defined in code or dynamically via localStorage
 * so users can connect their Supabase project directly in the UI!
 *
 * @module supabase
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* ------------------------------------------------------------------ */
/*  🔑 Project Credentials                                            */
/*  Paste your Supabase Project URL and anon/public key below.        */
/*  These run in the browser, so only use the PUBLIC anon key here.   */
/* ------------------------------------------------------------------ */

const DEFAULT_URL = 'https://secyvvgglpnunnzvruss.supabase.co';
const DEFAULT_ANON_KEY = 'sb_publishable_NuduYJTJS2lGL0Rbk_KHqg_hd16BTIw';

/**
 * Get active Supabase configuration.
 * Reads saved credentials from localStorage first, or falls back to DEFAULT_URL / DEFAULT_ANON_KEY.
 * @returns {{url: string, key: string, isConnected: boolean}}
 */
export function getSupabaseConfig() {
  const localUrl = localStorage.getItem('MUSE_SUPABASE_URL');
  const localKey = localStorage.getItem('MUSE_SUPABASE_ANON_KEY');

  // If valid credentials are hard-coded, prefer them over any stale
  // localStorage values so the app always uses the configured project.
  const hasValidDefaults = !!(
    DEFAULT_URL &&
    DEFAULT_URL.startsWith('https://') &&
    !DEFAULT_URL.includes('YOUR_PROJECT_ID') &&
    DEFAULT_ANON_KEY &&
    DEFAULT_ANON_KEY.length > 20 &&
    !DEFAULT_ANON_KEY.includes('YOUR_SUPABASE_ANON_KEY')
  );

  const activeUrl = hasValidDefaults
    ? DEFAULT_URL
    : ((localUrl && localUrl.trim()) ? localUrl.trim() : DEFAULT_URL);

  const activeKey = hasValidDefaults
    ? DEFAULT_ANON_KEY
    : ((localKey && localKey.trim()) ? localKey.trim() : DEFAULT_ANON_KEY);

  const isConnected = !!(
    activeUrl &&
    activeUrl.startsWith('https://') &&
    !activeUrl.includes('YOUR_PROJECT_ID') &&
    activeKey &&
    activeKey.length > 20 &&
    !activeKey.includes('YOUR_SUPABASE_ANON_KEY')
  );

  return { url: activeUrl, key: activeKey, isConnected };
}

/**
 * Save Supabase configuration to localStorage.
 * @param {string} url
 * @param {string} key
 */
export function saveSupabaseConfig(url, key) {
  if (url && url.trim()) {
    localStorage.setItem('MUSE_SUPABASE_URL', url.trim());
  }
  if (key && key.trim()) {
    localStorage.setItem('MUSE_SUPABASE_ANON_KEY', key.trim());
  }
}

/**
 * Clear stored Supabase configuration.
 */
export function clearSupabaseConfig() {
  localStorage.removeItem('MUSE_SUPABASE_URL');
  localStorage.removeItem('MUSE_SUPABASE_ANON_KEY');
}

// Determine safe credentials
const config = getSupabaseConfig();

const safeUrl = (config.url && config.url.startsWith('http'))
  ? config.url
  : 'https://placeholder.supabase.co';

const safeKey = (config.key && config.key.length > 5)
  ? config.key
  : 'placeholder-key';

/**
 * Shared Supabase client instance used across the app.
 * @type {import('@supabase/supabase-js').SupabaseClient}
 */
export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/* ================================================================== */
/*  Database & Storage Helper Utilities                               */
/* ================================================================== */

/**
 * Fetch a single row by its primary key from any table.
 * @param {string} table
 * @param {string|number} id
 * @param {string} [select='*']
 * @returns {Promise<{data: any, error: any}>}
 */
export async function fetchById(table, id, select = '*') {
  try {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .eq('id', id)
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Fetch rows from a table with filters.
 * @param {string} table
 * @param {object} [options]
 * @returns {Promise<{data: any[], error: any}>}
 */
export async function fetchRows(table, options = {}) {
  const { select = '*', eq = {}, order, limit, range } = options;
  try {
    let query = supabase.from(table).select(select);
    for (const [col, val] of Object.entries(eq)) {
      query = query.eq(col, val);
    }
    if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
    if (limit) query = query.limit(limit);
    if (range) query = query.range(range.from, range.to);

    const { data, error } = await query;
    return { data: data || [], error };
  } catch (err) {
    return { data: [], error: err };
  }
}

/**
 * Insert a single row.
 * @param {string} table
 * @param {object} values
 * @returns {Promise<{data: any, error: any}>}
 */
export async function insertRow(table, values) {
  try {
    const { data, error } = await supabase.from(table).insert([values]).select().single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Update rows.
 * @param {string} table
 * @param {string|number} id
 * @param {object} values
 * @returns {Promise<{data: any, error: any}>}
 */
export async function updateRow(table, id, values) {
  try {
    const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Delete a row.
 * @param {string} table
 * @param {string|number} id
 * @returns {Promise<{data: any, error: any}>}
 */
export async function deleteRow(table, id) {
  try {
    const { data, error } = await supabase.from(table).delete().eq('id', id);
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Upload a file to a Supabase Storage bucket.
 * @param {string} bucket
 * @param {string} path
 * @param {File|Blob} file
 * @param {object} [options]
 * @returns {Promise<{data: any, error: any}>}
 */
export async function uploadFile(bucket, path, file, options = {}) {
  try {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      ...options,
    });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Get the public URL for an asset in Supabase Storage.
 * @param {string} bucket
 * @param {string} path
 * @returns {string}
 */
export function getPublicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || '';
}
