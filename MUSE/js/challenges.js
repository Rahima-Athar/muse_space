/**
 * MUSE — Challenges Module
 * =========================
 * Manages creative challenges, deadlines, and project submissions.
 *
 * @module challenges
 */

import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { formatDate } from './common.js';

/**
 * Fetch challenges with optional status filter.
 *
 * @param {'all'|'active'|'upcoming'|'completed'} [status='active']
 * @returns {Promise<{data: Array, error: any}>}
 */
export async function getChallenges(status = 'all') {
  try {
    let query = supabase
      .from('challenges')
      .select(`
        *,
        challenge_submissions (id)
      `)
      .order('start_date', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    return { data: data || [], error };
  } catch (err) {
    console.error('getChallenges error:', err);
    return { data: [], error: err };
  }
}

/**
 * Fetch a single challenge by ID with rules, submissions, and dates.
 *
 * @param {string} challengeId
 * @returns {Promise<{data: object|null, error: any}>}
 */
export async function getChallengeById(challengeId) {
  try {
    const { data, error } = await supabase
      .from('challenges')
      .select(`
        *,
        challenge_submissions (
          id,
          description,
          created_at,
          user_id,
          project_id,
          profiles:user_id (id, username, full_name, avatar_url),
          projects:project_id (id, title, cover_image, category)
        )
      `)
      .eq('id', challengeId)
      .single();

    return { data, error };
  } catch (err) {
    console.error('getChallengeById error:', err);
    return { data: null, error: err };
  }
}

/**
 * Submit an existing project to a challenge.
 *
 * @param {string} challengeId
 * @param {string} projectId
 * @param {string} [description]
 * @returns {Promise<{data: object|null, error: any}>}
 */
export async function submitToChallenge(challengeId, projectId, description = '') {
  try {
    const { data: userRes } = await getCurrentUser();
    if (!userRes?.user) throw new Error('You must be logged in to submit an entry.');

    const userId = userRes.user.id;

    // Check if user owns the project
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (!project || project.user_id !== userId) {
      throw new Error('You can only submit projects you created.');
    }

    const { data, error } = await supabase
      .from('challenge_submissions')
      .insert([{
        challenge_id: challengeId,
        project_id: projectId,
        user_id: userId,
        description: description.trim()
      }])
      .select()
      .single();

    return { data, error };
  } catch (err) {
    console.error('submitToChallenge error:', err);
    return { data: null, error: err };
  }
}

/**
 * Render challenge card HTML.
 *
 * @param {object} challenge
 * @returns {string}
 */
export function renderChallengeCard(challenge) {
  const coverUrl = challenge.cover_image || 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=800&auto=format&fit=crop&q=80';
  const submissionsCount = challenge.challenge_submissions ? challenge.challenge_submissions.length : 0;
  const deadlineStr = challenge.deadline ? formatDate(challenge.deadline) : 'Ongoing';
  const statusBadge = challenge.status === 'active' 
    ? '<span class="badge badge-sage">Active Challenge</span>'
    : (challenge.status === 'upcoming' ? '<span class="badge badge-sand">Upcoming</span>' : '<span class="badge badge-olive">Completed</span>');

  return `
    <article class="challenge-card" data-id="${challenge.id}">
      <div class="challenge-media">
        <a href="challenge-details.html?id=${challenge.id}">
          <img src="${coverUrl}" alt="${escapeHtml(challenge.title)}" class="challenge-img" loading="lazy" />
        </a>
        <div class="challenge-badges">
          ${statusBadge}
          ${challenge.category ? `<span class="badge badge-category">${escapeHtml(challenge.category)}</span>` : ''}
        </div>
      </div>
      <div class="challenge-body">
        <h3 class="challenge-title">
          <a href="challenge-details.html?id=${challenge.id}">${escapeHtml(challenge.title)}</a>
        </h3>
        <p class="challenge-desc">${escapeHtml(challenge.description || '')}</p>
        
        <div class="challenge-meta">
          <span class="meta-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            Deadline: <strong>${deadlineStr}</strong>
          </span>
          <span class="meta-item">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            ${submissionsCount} Submissions
          </span>
        </div>

        <div class="challenge-action">
          <a href="challenge-details.html?id=${challenge.id}" class="btn btn-primary btn-block">View Challenge Brief</a>
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
