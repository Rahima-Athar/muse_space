/**
 * MUSE — Notifications Module
 * =============================
 * Fetch, render, and manage user notifications.
 * Optionally subscribes to Supabase Realtime for live updates.
 *
 * @module notifications
 */

import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';
import { timeAgo } from './common.js';

/* ================================================================== */
/*  Constants                                                         */
/* ================================================================== */

/** Default avatar for notification actors without a profile picture. */
const DEFAULT_AVATAR = '../assets/images/default-avatar.svg';

/** Map notification types to human-readable descriptions. */
const NOTIFICATION_LABELS = {
  like:          'liked your project',
  comment:       'commented on your project',
  follow:        'started following you',
  mention:       'mentioned you in a comment',
  project_feature: 'Your project was featured!',
};

/** Map notification types to icons (emoji / Unicode for simplicity). */
const NOTIFICATION_ICONS = {
  like:          '❤️',
  comment:       '💬',
  follow:        '👤',
  mention:       '📢',
  project_feature: '⭐',
};

/* ================================================================== */
/*  Fetch Notifications                                               */
/* ================================================================== */

/**
 * Fetch notifications for a user, newest first.
 *
 * @param {string} userId               — UUID of the user.
 * @param {object} [options]
 * @param {number} [options.limit=30]   — Max items to return.
 * @param {number} [options.offset=0]   — Pagination offset.
 * @param {boolean} [options.unreadOnly=false] — Return only unread?
 * @returns {Promise<{data: Array|null, error: object|null}>}
 */
export async function getNotifications(userId, options = {}) {
  try {
    const { limit = 30, offset = 0, unreadOnly = false } = options;

    let query = supabase
      .from('notifications')
      .select('*, actor:actor_id(id, full_name, username, avatar_url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq('read', false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[notifications] getNotifications:', error.message);
    return { data: null, error };
  }
}

/* ================================================================== */
/*  Mark as Read                                                      */
/* ================================================================== */

/**
 * Mark a single notification as read.
 *
 * @param {string} notificationId — UUID of the notification.
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function markAsRead(notificationId) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[notifications] markAsRead:', error.message);
    return { data: null, error };
  }
}

/**
 * Mark ALL notifications as read for a user.
 *
 * @param {string} userId — UUID of the user.
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function markAllAsRead(userId) {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('[notifications] markAllAsRead:', error.message);
    return { data: null, error };
  }
}

/* ================================================================== */
/*  Unread Count                                                      */
/* ================================================================== */

/**
 * Get the count of unread notifications for a user.
 *
 * @param {string} userId
 * @returns {Promise<{data: number, error: object|null}>}
 */
export async function getUnreadCount(userId) {
  try {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;
    return { data: count ?? 0, error: null };
  } catch (error) {
    console.error('[notifications] getUnreadCount:', error.message);
    return { data: 0, error };
  }
}

/* ================================================================== */
/*  Render a Notification Item                                        */
/* ================================================================== */

/**
 * Create a DOM element for a single notification.
 *
 * @param {object} notification — Notification row from Supabase (with joined `actor`).
 * @returns {HTMLElement} — A ready-to-append `<div>` element.
 */
export function renderNotificationItem(notification) {
  const {
    id,
    type        = 'like',
    read        = false,
    created_at,
    actor,
    reference_id,
  } = notification;

  const actorName   = actor?.full_name || actor?.username || 'Someone';
  const actorAvatar = actor?.avatar_url || DEFAULT_AVATAR;
  const icon        = NOTIFICATION_ICONS[type] || '🔔';
  const label       = NOTIFICATION_LABELS[type] || 'interacted with your content';
  const ago         = timeAgo(created_at);

  // Container
  const item = document.createElement('div');
  item.className = `notification-item${read ? '' : ' unread'}`;
  item.dataset.id = id;
  item.setAttribute('role', 'listitem');
  item.setAttribute('tabindex', '0');

  item.innerHTML = `
    <div class="notif-icon" aria-hidden="true">${icon}</div>
    <img class="notif-avatar" src="${_escapeAttr(actorAvatar)}" alt="${_escapeAttr(actorName)}" loading="lazy" />
    <div class="notif-body">
      <p class="notif-text">
        <strong class="notif-actor">${_escapeHtml(actorName)}</strong>
        ${_escapeHtml(label)}
      </p>
      <time class="notif-time" datetime="${created_at || ''}">${ago}</time>
    </div>
    ${!read ? '<span class="notif-dot" aria-label="Unread"></span>' : ''}
  `;

  // Click → navigate to the referenced content & mark as read
  item.addEventListener('click', async () => {
    if (!read) {
      await markAsRead(id);
      item.classList.remove('unread');
      const dot = item.querySelector('.notif-dot');
      if (dot) dot.remove();
    }

    // Navigate based on type
    if (type === 'follow' && actor?.id) {
      window.location.href = `../pages/profile.html?id=${actor.id}`;
    } else if (reference_id) {
      window.location.href = `../pages/project.html?id=${reference_id}`;
    }
  });

  // Keyboard accessibility (Enter / Space)
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      item.click();
    }
  });

  return item;
}

/* ================================================================== */
/*  Realtime Subscription (optional)                                  */
/* ================================================================== */

/**
 * Subscribe to live notification inserts for the current user.
 * Calls `onNew(payload.new)` whenever a new notification row is created.
 *
 * @param {string}   userId — UUID of the user to subscribe for.
 * @param {Function} onNew  — Callback receiving the new notification row.
 * @returns {{ unsubscribe: Function }} — Call `.unsubscribe()` to stop listening.
 */
export function subscribeToNotifications(userId, onNew) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        console.log('[notifications] realtime insert:', payload.new);
        if (typeof onNew === 'function') {
          onNew(payload.new);
        }
      }
    )
    .subscribe((status) => {
      console.log('[notifications] realtime status:', status);
    });

  return {
    /** Stop listening for live notifications. */
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}

/* ================================================================== */
/*  Update Navbar Badge                                               */
/* ================================================================== */

/**
 * Refresh the unread-count badge on the navbar bell icon.
 * Call after marking notifications as read or when a new one arrives.
 *
 * @param {string} userId
 */
export async function refreshNavBadge(userId) {
  const { data: count } = await getUnreadCount(userId);
  const badge = document.getElementById('navNotifBadge');
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

/* ================================================================== */
/*  Internal Helpers                                                  */
/* ================================================================== */

/**
 * HTML-escape for text content.
 * @private
 */
function _escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

/**
 * Escape a string for safe use inside an HTML attribute.
 * @private
 */
function _escapeAttr(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
