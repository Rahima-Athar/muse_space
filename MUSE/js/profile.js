/**
 * MUSE — Profile Module
 * =====================
 * Handles creator profile viewing, updating, avatar upload,
 * following stats, and profile tab views.
 *
 * @module profile
 */

import { supabase, uploadFile, getPublicUrl, getSupabaseConfig } from './supabase.js';
import { getCurrentUser, readDemoProfile, saveDemoProfile, ensureCurrentProfile } from './auth.js';
import { getFollowCounts, isFollowedByUser, toggleFollow } from './interactions.js';

function _isDemo() {
  return !getSupabaseConfig().isConnected;
}

/**
 * Fetch full profile details by user ID.
 *
 * @param {string} userId
 * @returns {Promise<{data: object|null, error: any}>}
 */
export async function getProfile(userId) {
  try {
    if (_isDemo()) {
      const demo = readDemoProfile();
      return { data: demo && demo.id === userId ? demo : null, error: null };
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    return { data, error };
  } catch (err) {
    console.error('getProfile error:', err);
    return { data: null, error: err };
  }
}

/**
 * Fetch full profile details by username.
 *
 * @param {string} username
 * @returns {Promise<{data: object|null, error: any}>}
 */
export async function getProfileByUsername(username) {
  try {
    if (_isDemo()) {
      const demo = readDemoProfile();
      return { data: demo && demo.username === username ? demo : null, error: null };
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    return { data, error };
  } catch (err) {
    console.error('getProfileByUsername error:', err);
    return { data: null, error: err };
  }
}

/**
 * Get profile stats: project count, follower count, following count.
 *
 * @param {string} userId
 * @returns {Promise<{projectsCount: number, followersCount: number, followingCount: number}>}
 */
export async function getProfileStats(userId) {
  try {
    if (_isDemo()) {
      const demo = readDemoProfile();
      const isOwner = demo && demo.id === userId;
      return {
        projectsCount: isOwner ? 4 : 0,
        followersCount: isOwner ? 248 : 0,
        followingCount: isOwner ? 86 : 0,
      };
    }

    const [projectsRes, followCounts] = await Promise.all([
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'published'),
      getFollowCounts(userId)
    ]);

    return {
      projectsCount: projectsRes.count || 0,
      followersCount: followCounts.followers,
      followingCount: followCounts.following
    };
  } catch (err) {
    console.error('getProfileStats error:', err);
    return { projectsCount: 0, followersCount: 0, followingCount: 0 };
  }
}

/**
 * Update the signed-in user's profile.
 *
 * @param {object} profileData
 * @param {string} [profileData.full_name]
 * @param {string} [profileData.bio]
 * @param {string} [profileData.skills]
 * @param {string} [profileData.website]
 * @param {string} [profileData.avatar_url]
 * @returns {Promise<{data: object|null, error: any}>}
 */
export async function updateProfile(profileData) {
  try {
    const { data: userRes } = await getCurrentUser();
    if (!userRes?.user) throw new Error('Not authenticated.');

    if (_isDemo()) {
      return { data: saveDemoProfile(profileData), error: null };
    }

    const userId = userRes.user.id;

    // Make sure a profile row exists before updating (heals older accounts
    // that were created before the DB trigger existed).
    const ensured = await ensureCurrentProfile();
    if (!ensured.data && ensured.error) {
      return { data: null, error: ensured.error };
    }

    const updates = {
      ...profileData,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    return { data, error };
  } catch (err) {
    console.error('updateProfile error:', err);
    return { data: null, error: err };
  }
}

/**
 * Upload an avatar image to Supabase Storage bucket 'muse-avatars'.
 *
 * @param {File} file
 * @param {string} userId
 * @returns {Promise<{url: string|null, error: any}>}
 */
export async function uploadAvatar(file, userId) {
  try {
    if (_isDemo()) {
      if (file.size > 800 * 1024) {
        return { url: null, error: { message: 'Demo mode: please choose an image under 800 KB.' } };
      }
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      return { url, error: null };
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/avatar_${Date.now()}.${fileExt}`;

    const { error } = await uploadFile('muse-avatars', fileName, file);
    if (error) throw error;

    const url = getPublicUrl('muse-avatars', fileName);
    return { url, error: null };
  } catch (err) {
    console.error('uploadAvatar error:', err);
    return { url: null, error: err };
  }
}
