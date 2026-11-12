/**
 * MUSE — Community Interactions Module
 * =====================================
 * Likes, comments, follows, and bookmarks — all wired to Supabase
 * with duplicate-prevention and ownership checks.
 *
 * @module interactions
 */

import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

/* ================================================================== */
/*  Internal: get authenticated user ID or bail                       */
/* ================================================================== */

/**
 * Return the current user's ID, or throw if not signed in.
 * @private
 * @returns {Promise<string>}
 */
async function _requireUserId() {
  const { data } = await getCurrentUser();
  if (!data?.user?.id) throw new Error('You must be signed in.');
  return data.user.id;
}

/* ================================================================== */
/*  LIKES                                                             */
/* ================================================================== */

/**
 * Toggle a like on a project.
 * If the user already liked it, the like is removed; otherwise it is added.
 *
 * @param {string} projectId — UUID of the project.
 * @returns {Promise<{data: {liked: boolean}, error: object|null}>}
 */
export async function toggleLike(projectId) {
  try {
    const userId = await _requireUserId();

    // Check for an existing like
    const { data: existing, error: lookupErr } = await supabase
      .from('likes')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupErr) throw lookupErr;

    if (existing) {
      // Unlike
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('id', existing.id);

      if (error) throw error;
      const countRes = await getLikeCount(projectId);
      const count = countRes.data ?? 0;
      return { data: { liked: false, count }, liked: false, count, error: null };
    }

    // Like
    const { error } = await supabase
      .from('likes')
      .insert({ project_id: projectId, user_id: userId });

    if (error) throw error;
    const countRes = await getLikeCount(projectId);
    const count = countRes.data ?? 0;
    return { data: { liked: true, count }, liked: true, count, error: null };
  } catch (error) {
    console.error('[interactions] toggleLike:', error.message);
    return { data: null, liked: false, count: 0, error };
  }
}

/**
 * Get the total like count for a project.
 *
 * @param {string} projectId
 * @returns {Promise<{data: number, error: object|null}>}
 */
export async function getLikeCount(projectId) {
  try {
    const { count, error } = await supabase
      .from('likes')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);

    if (error) throw error;
    return { data: count ?? 0, error: null };
  } catch (error) {
    console.error('[interactions] getLikeCount:', error.message);
    return { data: 0, error };
  }
}

/**
 * Check whether the current user has liked a project.
 *
 * @param {string} projectId
 * @returns {Promise<{data: boolean, error: object|null}>}
 */
export async function isLikedByUser(projectId) {
  try {
    const { data: userRes } = await getCurrentUser();
    const userId = userRes?.user?.id;
    if (!userId) return { data: false, error: null };

    const { data, error } = await supabase
      .from('likes')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return { data: !!data, error: null };
  } catch (error) {
    console.error('[interactions] isLikedByUser:', error.message);
    return { data: false, error };
  }
}

/* ================================================================== */
/*  COMMENTS                                                          */
/* ================================================================== */

/**
 * Add a comment to a project.
 *
 * @param {string} projectId — UUID of the project.
 * @param {string} content   — Comment body text.
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function addComment(projectId, content) {
  try {
    const userId = await _requireUserId();

    if (!content || !content.trim()) {
      return { data: null, error: { message: 'Comment cannot be empty.' } };
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({
        project_id: projectId,
        user_id: userId,
        content: content.trim(),
      })
      .select('*, profiles:user_id(full_name, username, avatar_url)')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[interactions] addComment:', error.message);
    return { data: null, error };
  }
}

/**
 * Edit a comment (only the author may edit).
 *
 * @param {string} commentId — UUID of the comment.
 * @param {string} content   — New comment body.
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function editComment(commentId, content) {
  try {
    const userId = await _requireUserId();

    if (!content || !content.trim()) {
      return { data: null, error: { message: 'Comment cannot be empty.' } };
    }

    // Verify ownership
    const { data: existing, error: lookupErr } = await supabase
      .from('comments')
      .select('user_id')
      .eq('id', commentId)
      .single();

    if (lookupErr) throw lookupErr;
    if (existing.user_id !== userId) {
      return { data: null, error: { message: 'You can only edit your own comments.' } };
    }

    const { data, error } = await supabase
      .from('comments')
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq('id', commentId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[interactions] editComment:', error.message);
    return { data: null, error };
  }
}

/**
 * Delete a comment (only the author may delete).
 *
 * @param {string} commentId — UUID of the comment.
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function deleteComment(commentId) {
  try {
    const userId = await _requireUserId();

    // Verify ownership
    const { data: existing, error: lookupErr } = await supabase
      .from('comments')
      .select('user_id')
      .eq('id', commentId)
      .single();

    if (lookupErr) throw lookupErr;
    if (existing.user_id !== userId) {
      return { data: null, error: { message: 'You can only delete your own comments.' } };
    }

    const { data, error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[interactions] deleteComment:', error.message);
    return { data: null, error };
  }
}

/**
 * Get the total comment count for a project.
 *
 * @param {string} projectId
 * @returns {Promise<{data: number, error: object|null}>}
 */
export async function getCommentCount(projectId) {
  try {
    const { count, error } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);

    if (error) throw error;
    return { data: count ?? 0, error: null };
  } catch (error) {
    console.error('[interactions] getCommentCount:', error.message);
    return { data: 0, error };
  }
}

/**
 * Fetch all comments for a project, with author profile info.
 *
 * @param {string} projectId
 * @param {object} [options]
 * @param {string} [options.orderBy='created_at']
 * @param {boolean} [options.ascending=true]
 * @returns {Promise<{data: Array|null, error: object|null}>}
 */
export async function getComments(projectId, options = {}) {
  try {
    const { orderBy = 'created_at', ascending = true } = options;

    const { data, error } = await supabase
      .from('comments')
      .select('*, profiles:user_id(id, full_name, username, avatar_url)')
      .eq('project_id', projectId)
      .order(orderBy, { ascending });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[interactions] getComments:', error.message);
    return { data: null, error };
  }
}

/* ================================================================== */
/*  FOLLOWS                                                           */
/* ================================================================== */

/**
 * Toggle follow / unfollow for a profile.
 * Prevents self-following.
 *
 * @param {string} profileId — UUID of the profile to follow/unfollow.
 * @returns {Promise<{data: {following: boolean}, error: object|null}>}
 */
export async function toggleFollow(profileId) {
  try {
    const userId = await _requireUserId();

    // Prevent self-follow
    if (userId === profileId) {
      return { data: null, error: { message: 'You cannot follow yourself.' } };
    }

    // Check existing follow
    const { data: existing, error: lookupErr } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', profileId)
      .maybeSingle();

    if (lookupErr) throw lookupErr;

    if (existing) {
      // Unfollow
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('id', existing.id);

      if (error) throw error;
      return { data: { following: false }, following: false, error: null };
    }

    // Follow
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: userId, following_id: profileId });

    if (error) throw error;
    return { data: { following: true }, following: true, error: null };
  } catch (error) {
    console.error('[interactions] toggleFollow:', error.message);
    return { data: null, following: false, error };
  }
}

/**
 * Check whether the current user follows a given profile.
 * Accepts either isFollowedByUser(targetProfileId) or isFollowedByUser(followerId, targetProfileId).
 *
 * @param {string} profileIdOrFollower
 * @param {string} [maybeTargetId]
 * @returns {Promise<{data: boolean, error: object|null}>}
 */
export async function isFollowedByUser(profileIdOrFollower, maybeTargetId) {
  try {
    const targetId = maybeTargetId || profileIdOrFollower;
    const { data: userRes } = await getCurrentUser();
    const userId = (maybeTargetId ? profileIdOrFollower : null) || userRes?.user?.id;
    if (!userId || !targetId) return { data: false, error: null };

    const { data, error } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', targetId)
      .maybeSingle();

    if (error) throw error;
    return { data: !!data, error: null };
  } catch (error) {
    console.error('[interactions] isFollowedByUser:', error.message);
    return { data: false, error };
  }
}

/**
 * Get follower and following counts for a profile.
 *
 * @param {string} profileId
 * @returns {Promise<{data: {followers: number, following: number}, error: object|null}>}
 */
export async function getFollowCounts(profileId) {
  try {
    const [followersRes, followingRes] = await Promise.all([
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profileId),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profileId),
    ]);

    if (followersRes.error) throw followersRes.error;
    if (followingRes.error) throw followingRes.error;

    return {
      data: {
        followers: followersRes.count ?? 0,
        following: followingRes.count ?? 0,
      },
      followers: followersRes.count ?? 0,
      following: followingRes.count ?? 0,
      error: null,
    };
  } catch (error) {
    console.error('[interactions] getFollowCounts:', error.message);
    return { data: { followers: 0, following: 0 }, followers: 0, following: 0, error };
  }
}

/* ================================================================== */
/*  BOOKMARKS                                                         */
/* ================================================================== */

/**
 * Toggle a bookmark on a project.
 *
 * @param {string} projectId
 * @returns {Promise<{data: {bookmarked: boolean}, error: object|null}>}
 */
export async function toggleBookmark(projectId) {
  try {
    const userId = await _requireUserId();

    // Check for existing bookmark
    const { data: existing, error: lookupErr } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupErr) throw lookupErr;

    if (existing) {
      // Remove bookmark
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('id', existing.id);

      if (error) throw error;
      return { data: { bookmarked: false }, bookmarked: false, error: null };
    }

    // Add bookmark
    const { error } = await supabase
      .from('bookmarks')
      .insert({ project_id: projectId, user_id: userId });

    if (error) throw error;
    return { data: { bookmarked: true }, bookmarked: true, error: null };
  } catch (error) {
    console.error('[interactions] toggleBookmark:', error.message);
    return { data: null, bookmarked: false, error };
  }
}

/**
 * Check whether the current user has bookmarked a project.
 *
 * @param {string} projectId
 * @returns {Promise<{data: boolean, error: object|null}>}
 */
export async function isBookmarkedByUser(projectId) {
  try {
    const { data: userRes } = await getCurrentUser();
    const userId = userRes?.user?.id;
    if (!userId) return { data: false, error: null };

    const { data, error } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return { data: !!data, error: null };
  } catch (error) {
    console.error('[interactions] isBookmarkedByUser:', error.message);
    return { data: false, error };
  }
}

/**
 * Fetch all bookmarked projects for the current user.
 *
 * @param {object} [options]
 * @param {number} [options.limit=20]
 * @param {number} [options.offset=0]
 * @returns {Promise<{data: Array|null, error: object|null}>}
 */
export async function getBookmarkedProjects(options = {}) {
  try {
    const userId = await _requireUserId();
    const { limit = 20, offset = 0 } = options;

    const { data, error } = await supabase
      .from('bookmarks')
      .select('*, projects:project_id(*, profiles:user_id(full_name, username, avatar_url))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[interactions] getBookmarkedProjects:', error.message);
    return { data: null, error };
  }
}
