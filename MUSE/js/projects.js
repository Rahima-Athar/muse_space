/**
 * MUSE — Projects Module
 * =======================
 * Manages project creation, reading, updating, deletion,
 * image uploads to Supabase Storage, and project rendering.
 *
 * @module projects
 */

import { supabase, uploadFile, getPublicUrl, getSupabaseConfig } from './supabase.js';
import { getCurrentUser, ensureCurrentProfile } from './auth.js';
import { isLikedByUser, isBookmarkedByUser } from './interactions.js';

/**
 * Fetch published projects with creator profile details.
 * Supports category filtering, search keyword, and ordering.
 *
 * @param {object} [options]
 * @param {string} [options.category]
 * @param {string} [options.search]
 * @param {string} [options.sortBy='newest'] - 'newest' | 'popular'
 * @param {number} [options.limit=12]
 * @param {number} [options.page=0]
 * @returns {Promise<{data: Array, count: number, error: any}>}
 */
export async function getPublishedProjects(options = {}) {
  const { category, search, sortBy = 'newest', limit = 12, page = 0 } = options;

  try {
    let query = supabase
      .from('projects')
      .select(`
        *,
        profiles:user_id (id, username, full_name, avatar_url),
        likes (id),
        comments (id)
      `, { count: 'exact' })
      .eq('status', 'published');

    if (category && category !== 'All') {
      query = query.eq('category', category);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`title.ilike.${term},description.ilike.${term},tools.ilike.${term}`);
    }

    if (sortBy === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else {
      // popular
      query = query.order('created_at', { ascending: false });
    }

    const from = page * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    return { data: data || [], count: count || 0, error };
  } catch (err) {
    console.error('getPublishedProjects error:', err);
    return { data: [], count: 0, error: err };
  }
}

/**
 * Fetch a single project by ID with full details, gallery images, creator profile.
 *
 * @param {string} projectId
 * @returns {Promise<{data: object|null, error: any}>}
 */
export async function getProjectById(projectId) {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        profiles:user_id (id, username, full_name, avatar_url, bio, website),
        project_images (id, image_url, display_order),
        likes (user_id),
        comments (
          id,
          content,
          created_at,
          user_id,
          profiles:user_id (id, username, full_name, avatar_url)
        )
      `)
      .eq('id', projectId)
      .single();

    return { data, error };
  } catch (err) {
    console.error('getProjectById error:', err);
    return { data: null, error: err };
  }
}

/**
 * Fetch user's own projects (both drafts and published).
 *
 * @param {string} userId
 * @param {'all'|'published'|'draft'} [statusFilter='all']
 * @returns {Promise<{data: Array, error: any}>}
 */
export async function getUserProjects(userId, statusFilter = 'all') {
  try {
    let query = supabase
      .from('projects')
      .select(`
        *,
        likes (id),
        comments (id)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    return { data: data || [], error };
  } catch (err) {
    console.error('getUserProjects error:', err);
    return { data: [], error: err };
  }
}

/**
 * Create a new project.
 *
 * @param {object} projectData
 * @param {string} projectData.title
 * @param {string} projectData.description
 * @param {string} projectData.category
 * @param {string} [projectData.tools]
 * @param {string} [projectData.external_url]
 * @param {string} [projectData.cover_image]
 * @param {'draft'|'published'} [projectData.status='published']
 * @param {Array<string>} [projectData.gallery_images]
 * @returns {Promise<{data: object|null, error: any}>}
 */
export async function createProject(projectData) {
  try {
    if (!getSupabaseConfig().isConnected) {
      throw new Error('Supabase is not connected. Add your Project URL and anon key in js/supabase.js, then run supabase_schema.sql.');
    }

    const { data: userRes } = await getCurrentUser();
    if (!userRes?.user) throw new Error('You must be signed in to create a project.');

    const userId = userRes.user.id;

    // projects.user_id references profiles.id, so the profile row must exist
    // before we can insert a project. Create it if it is missing.
    const ensured = await ensureCurrentProfile();
    if (!ensured.data && ensured.error) {
      throw ensured.error;
    }

    const newRecord = {
      user_id: userId,
      title: projectData.title.trim(),
      description: projectData.description?.trim() || '',
      category: projectData.category || 'General',
      tools: projectData.tools?.trim() || '',
      external_url: projectData.external_url?.trim() || null,
      cover_image: projectData.cover_image || null,
      status: projectData.status || 'published',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: project, error: projErr } = await supabase
      .from('projects')
      .insert([newRecord])
      .select()
      .single();

    if (projErr) throw projErr;

    // Insert extra gallery images if provided
    if (projectData.gallery_images && projectData.gallery_images.length > 0) {
      const imageRecords = projectData.gallery_images.map((url, idx) => ({
        project_id: project.id,
        image_url: url,
        display_order: idx + 1
      }));

      await supabase.from('project_images').insert(imageRecords);
    }

    return { data: project, error: null };
  } catch (err) {
    console.error('createProject error:', err);
    return { data: null, error: _friendlyProjectError(err) };
  }
}

function _friendlyProjectError(err) {
  const msg = String(err?.message || err || '');
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
    return new Error('Could not reach Supabase. Check that your Project URL is correct, the project is active (not paused), and you are online.');
  }
  if (msg.includes('violates foreign key constraint')) {
    return new Error('Your creator profile is missing in the database. Please open Edit Profile, save it once, then publish again.');
  }
  if (msg.includes('row-level security policy')) {
    return new Error('Database permission denied. Run supabase_schema.sql in Supabase to install the RLS policies.');
  }
  if (msg.includes('does not exist')) {
    return new Error('Database tables are missing. Run supabase_schema.sql in your Supabase SQL Editor.');
  }
  return err;
}

/**
 * Update an existing project (ownership validated via Supabase RLS and client-side check).
 *
 * @param {string} projectId
 * @param {object} updates
 * @returns {Promise<{data: object|null, error: any}>}
 */
export async function updateProject(projectId, updates) {
  try {
    const { data: userRes } = await getCurrentUser();
    if (!userRes?.user) throw new Error('Not authenticated.');

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .eq('user_id', userRes.user.id)
      .select()
      .single();

    return { data, error };
  } catch (err) {
    console.error('updateProject error:', err);
    return { data: null, error: err };
  }
}

/**
 * Delete a project.
 *
 * @param {string} projectId
 * @returns {Promise<{error: any}>}
 */
export async function deleteProject(projectId) {
  try {
    const { data: userRes } = await getCurrentUser();
    if (!userRes?.user) throw new Error('Not authenticated.');

    // Delete gallery images first
    await supabase.from('project_images').delete().eq('project_id', projectId);

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userRes.user.id);

    return { error };
  } catch (err) {
    console.error('deleteProject error:', err);
    return { error: err };
  }
}

/**
 * Upload an image to Supabase Storage bucket 'muse-projects'.
 *
 * @param {File} file
 * @param {string} userId
 * @returns {Promise<{url: string|null, error: any}>}
 */
export async function uploadProjectMedia(file, userId) {
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    const { error } = await uploadFile('muse-projects', fileName, file);
    if (error) throw error;

    const url = getPublicUrl('muse-projects', fileName);
    return { url, error: null };
  } catch (err) {
    console.error('uploadProjectMedia error:', err);
    return { url: null, error: err };
  }
}

/**
 * Render a project card HTML string for grids/feeds.
 *
 * @param {object} project
 * @param {object} [currentUser]
 * @returns {string} HTML string
 */
export function renderProjectCard(project, currentUser = null) {
  const coverUrl = project.cover_image || 'assets/images/placeholder-project.jpg';
  const creator = project.profiles || { full_name: 'Creator', username: 'creator', avatar_url: 'assets/images/default-avatar.svg' };
  const likesCount = project.likes ? (Array.isArray(project.likes) ? project.likes.length : (project.likes.count || 0)) : 0;
  const commentsCount = project.comments ? (Array.isArray(project.comments) ? project.comments.length : (project.comments.count || 0)) : 0;
  const isDraft = project.status === 'draft';

  return `
    <article class="project-card ${isDraft ? 'project-card-draft' : ''}" data-id="${project.id}">
      <div class="project-card-media">
        <a href="project-details.html?id=${project.id}" class="project-card-link" aria-label="View ${escapeHtml(project.title)}">
          <img src="${coverUrl}" alt="${escapeHtml(project.title)}" class="project-card-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'" />
        </a>
        ${isDraft ? `<span class="badge badge-terracotta project-draft-badge">Draft</span>` : ''}
        ${project.category ? `<span class="badge badge-category">${escapeHtml(project.category)}</span>` : ''}
      </div>

      <div class="project-card-body">
        <div class="project-card-header">
          <h3 class="project-card-title">
            <a href="project-details.html?id=${project.id}">${escapeHtml(project.title)}</a>
          </h3>
        </div>

        <div class="project-card-footer">
          <a href="profile.html?id=${creator.id || project.user_id}" class="project-creator-link">
            <img src="${creator.avatar_url || 'assets/images/default-avatar.svg'}" alt="${escapeHtml(creator.full_name || 'Creator')}" class="project-creator-avatar" />
            <span class="project-creator-name">${escapeHtml(creator.full_name || creator.username || 'Creator')}</span>
          </a>

          <div class="project-card-stats">
            <span class="stat-item" title="${likesCount} Likes">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              ${likesCount}
            </span>
            <span class="stat-item" title="${commentsCount} Comments">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
              ${commentsCount}
            </span>
          </div>
        </div>
      </div>
    </article>
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
