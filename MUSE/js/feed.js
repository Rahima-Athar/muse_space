/**
 * MUSE — Feed & Discovery Module
 * ===============================
 * Handles personalized and chronological project feeds,
 * pagination, and interactive card events.
 *
 * @module feed
 */

import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { renderProjectCard } from './projects.js';
import { toggleLike, toggleBookmark, isLikedByUser, isBookmarkedByUser } from './interactions.js';
import { showToast } from './common.js';

/**
 * Fetch home feed projects.
 * If the user follows creators, prioritizes projects from those creators.
 * Otherwise, falls back to the most recent published work.
 *
 * @param {object} [options]
 * @param {number} [options.page=0]
 * @param {number} [options.limit=10]
 * @returns {Promise<{data: Array, isPersonalized: boolean, error: any}>}
 */
export async function getHomeFeed(options = {}) {
  const { page = 0, limit = 10 } = options;

  try {
    const { data: userRes } = await getCurrentUser();
    const currentUser = userRes?.user || null;

    let followingIds = [];
    if (currentUser) {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', currentUser.id);

      if (follows && follows.length > 0) {
        followingIds = follows.map(f => f.following_id);
      }
    }

    let query = supabase
      .from('projects')
      .select(`
        *,
        profiles:user_id (id, username, full_name, avatar_url),
        likes (id, user_id),
        comments (id)
      `)
      .eq('status', 'published');

    let isPersonalized = false;
    if (followingIds.length > 0) {
      query = query.in('user_id', followingIds);
      isPersonalized = true;
    }

    query = query
      .order('created_at', { ascending: false })
      .range(page * limit, (page + 1) * limit - 1);

    const { data, error } = await query;

    // If personalized feed is empty, fall back to global recent projects
    if ((!data || data.length === 0) && isPersonalized) {
      const fallbackQuery = await supabase
        .from('projects')
        .select(`
          *,
          profiles:user_id (id, username, full_name, avatar_url),
          likes (id, user_id),
          comments (id)
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      return { data: fallbackQuery.data || [], isPersonalized: false, error: fallbackQuery.error };
    }

    return { data: data || [], isPersonalized, error };
  } catch (err) {
    console.error('getHomeFeed error:', err);
    return { data: [], isPersonalized: false, error: err };
  }
}

/**
 * Fetch featured/curated creators for discover view.
 *
 * @param {number} [limit=6]
 * @returns {Promise<{data: Array, error: any}>}
 */
export async function getFeaturedCreators(limit = 6) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, skills')
      .limit(limit);

    return { data: data || [], error };
  } catch (err) {
    console.error('getFeaturedCreators error:', err);
    return { data: [], error: err };
  }
}

/**
 * Render creator card HTML string.
 *
 * @param {object} profile
 * @returns {string} HTML string
 */
export function renderCreatorCard(profile) {
  const avatar = profile.avatar_url || 'assets/images/default-avatar.svg';
  const skillsList = profile.skills ? (Array.isArray(profile.skills) ? profile.skills : profile.skills.split(',').map(s => s.trim())) : [];

  return `
    <div class="creator-card" data-creator-id="${profile.id}">
      <div class="creator-card-header">
        <img src="${avatar}" alt="${escapeHtml(profile.full_name || 'Creator')}" class="creator-avatar" />
      </div>
      <div class="creator-card-body">
        <h4 class="creator-name">
          <a href="profile.html?id=${profile.id}">${escapeHtml(profile.full_name || profile.username || 'Creator')}</a>
        </h4>
        <p class="creator-handle">@${escapeHtml(profile.username || 'creator')}</p>
        <p class="creator-bio">${escapeHtml(profile.bio || 'Creative mind sharing inspiration on MUSE.')}</p>

        ${skillsList.length > 0 ? `
          <div class="creator-skills">
            ${skillsList.slice(0, 3).map(skill => `<span class="badge badge-skill">${escapeHtml(skill)}</span>`).join('')}
          </div>
        ` : ''}

        <a href="profile.html?id=${profile.id}" class="btn btn-outline btn-sm creator-view-btn">View Profile</a>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
