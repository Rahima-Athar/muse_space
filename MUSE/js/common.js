/**
 * MUSE — Common Utilities & Studio Shell
 * =======================================
 * Shared UI helpers, toast notifications, loading spinner, form validation,
 * advanced responsive navbar, editorial footer, Supabase quick-connect modal,
 * and DOM initialisation routines.
 *
 * @module common
 */

import { supabase, getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from './supabase.js';
import { signOut, getCurrentUser, getCurrentProfile, ensureCurrentProfile, onAuthStateChange } from './auth.js';

/* ================================================================== */
/*  Constants                                                         */
/* ================================================================== */

const DEFAULT_AVATAR = 'assets/images/default-avatar.svg';
const TOAST_DURATION = 4000;

/* ================================================================== */
/*  Navbar                                                            */
/* ================================================================== */

/**
 * Render the top navigation bar.
 * Shows different controls depending on whether the user is logged in.
 *
 * @param {HTMLElement} [container] — The element to render the navbar into.
 */
export async function renderNavbar(container) {
  const nav = container || document.getElementById('navbar');
  if (!nav) return;

  // Determine auth state. Wait for Supabase to restore a persisted session
  // so the navbar reflects login even after navigation/token refresh.
  let user = null;
  let profileData = null;

  const resolveAuth = async () => {
    const { data } = await getCurrentUser();
    return data?.user || null;
  };

  try {
    user = await resolveAuth();

    if (!user) {
      user = await Promise.race([
        new Promise((resolve) => {
          try {
            const { data } = supabase.auth.onAuthStateChange((_event, session) => {
              if (session?.user) {
                try { data.subscription.unsubscribe(); } catch { /* ignore */ }
                resolve(session.user);
              }
            });
            setTimeout(() => {
              try { data.subscription.unsubscribe(); } catch { /* ignore */ }
              resolve(null);
            }, 1500);
          } catch {
            resolve(null);
          }
        }),
        (async () => {
          await new Promise((r) => setTimeout(r, 1200));
          return resolveAuth();
        })(),
      ]);
    }

    if (user) {
      const profileResult = await ensureCurrentProfile();
      profileData = profileResult?.data || null;
    }
  } catch (e) {
    console.debug('Auth check bypassed:', e);
  }

  // Build markup
  nav.innerHTML = `
    <div class="navbar-inner">
      <!-- Left: Brand Logo -->
      <a href="index.html" class="navbar-logo" aria-label="MUSE Home">
        <span class="logo-mark">M</span>
        <div class="logo-text-group">
          <span class="logo-text">MUSE</span>
          <span class="logo-subtitle">CREATIVE STUDIO</span>
        </div>
      </a>

      <!-- Center: Desktop Nav Links -->
      <ul class="nav-links" id="navLinks">
        <li><a href="feed.html" class="nav-link" data-page="feed">Feed</a></li>
        <li><a href="discover.html" class="nav-link" data-page="discover">Discover</a></li>
        <li><a href="explore.html" class="nav-link" data-page="explore">Explore</a></li>
        <li><a href="challenges.html" class="nav-link" data-page="challenges">Challenges</a></li>
        <li><a href="about.html" class="nav-link" data-page="about">About</a></li>
      </ul>

      <!-- Right: Actions & User Controls -->
      <div class="nav-actions">
        <!-- Search icon trigger -->
        <a href="explore.html" class="nav-icon-btn" aria-label="Search MUSE" title="Search Creations & Creators">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </a>

        <!-- Profile (always visible) -->
        <a href="profile.html" class="nav-profile-btn" data-page="profile" aria-label="Profile" title="Open Profile" style="display:inline-flex !important;align-items:center;gap:6px;padding:8px 12px;border:1.5px solid var(--sand-beige,#DCCBB8);border-radius:999px;color:var(--deep-olive,#343B35);text-decoration:none;font-weight:600;font-size:14px;line-height:1;background:rgba(255,255,255,0.35);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <span>Profile</span>
        </a>

        ${user ? `
          <!-- New Project CTA -->
          <a href="create-project.html" class="btn btn-primary btn-sm nav-create-btn">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;">
              <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Create
          </a>



          <!-- Notifications Bell -->
          <a href="notifications.html" class="nav-icon-btn" id="navNotifBtn" aria-label="Notifications" title="Notifications">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span class="notif-badge" id="navNotifBadge" style="display:none;"></span>
          </a>

          <!-- Avatar Dropdown -->
          <div class="nav-avatar-wrap" id="navAvatarWrap">
            <button class="nav-avatar-btn" id="navAvatarBtn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu">
              <img src="${profileData?.avatar_url || DEFAULT_AVATAR}" alt="User Avatar" class="nav-avatar-img" />
            </button>
            <div class="nav-dropdown" id="navDropdown" role="menu" aria-hidden="true">
              <div class="nav-dropdown-header">
                <span class="dropdown-user-name">${_escapeHtml(profileData?.full_name || 'Creator')}</span>
                <span class="dropdown-user-handle">@${_escapeHtml(profileData?.username || 'user')}</span>
              </div>
              <hr class="dropdown-divider" />
              <a href="portfolio.html" class="dropdown-item" role="menuitem">
                <span>📁 My Portfolio</span>
              </a>
              <a href="profile.html" class="dropdown-item" role="menuitem">
                <span>👤 My Profile</span>
              </a>
              <a href="saved.html" class="dropdown-item" role="menuitem">
                <span>🔖 Saved Work</span>
              </a>
              <a href="edit-profile.html" class="dropdown-item" role="menuitem">
                <span>✏️ Edit Profile</span>
              </a>
              <a href="settings.html" class="dropdown-item" role="menuitem">
                <span>⚙️ Settings</span>
              </a>
              <hr class="dropdown-divider" />
              <button class="dropdown-item dropdown-signout" id="navSignOut" role="menuitem">
                <span>🚪 Sign Out</span>
              </button>
            </div>
          </div>
        ` : `
          <!-- Logged Out Actions -->
          <a href="login.html" class="btn btn-outline btn-sm nav-login-btn">Log In</a>
          <a href="signup.html" class="btn btn-accent btn-sm nav-join-btn">Join Studio</a>
        `}

        <!-- Mobile Hamburger Toggle -->
        <button class="nav-hamburger" id="navHamburger" aria-label="Toggle navigation menu" aria-expanded="false">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
      </div>
    </div>

    <!-- Mobile Navigation Drawer -->
    <div class="mobile-menu" id="mobileMenu" aria-hidden="true">
      <ul class="mobile-nav-links">
        <li><a href="feed.html" class="nav-link" data-page="feed">Feed</a></li>
        <li><a href="discover.html" class="nav-link" data-page="discover">Discover</a></li>
        <li><a href="explore.html" class="nav-link" data-page="explore">Explore</a></li>
        <li><a href="challenges.html" class="nav-link" data-page="challenges">Challenges</a></li>
        <li><a href="about.html" class="nav-link" data-page="about">About</a></li>
        ${user ? `
          <hr class="dropdown-divider" />
          <li><a href="create-project.html" class="nav-link" data-page="create-project">✨ Create Project</a></li>
          <li><a href="portfolio.html" class="nav-link" data-page="portfolio">📁 My Portfolio</a></li>
          <li><a href="profile.html" class="nav-link" data-page="profile">👤 My Profile</a></li>
          <li><a href="saved.html" class="nav-link" data-page="saved">🔖 Saved Projects</a></li>
          <li><a href="notifications.html" class="nav-link" data-page="notifications">🔔 Notifications</a></li>
          <li><a href="settings.html" class="nav-link" data-page="settings">⚙️ Settings</a></li>
          <li><button class="nav-link mobile-signout" id="mobileSignOut">🚪 Sign Out</button></li>
        ` : `
          <hr class="dropdown-divider" />
          <li><a href="login.html" class="nav-link mobile-login-link">Sign In</a></li>
          <li><a href="signup.html" class="nav-link font-bold text-terracotta mobile-join-link">Join Studio Free</a></li>
        `}
      </ul>
    </div>
  `;

  // Wire events
  _initHamburger();
  _initAvatarDropdown();
  _initSignOutButtons();
  highlightActiveNavLink();
}

/* ================================================================== */
/*  Footer                                                            */
/* ================================================================== */

/**
 * Render the rich shared page footer.
 *
 * @param {HTMLElement} [container] — Target element (defaults to `#footer`).
 */
export function renderFooter(container) {
  const footer = container || document.getElementById('footer');
  if (!footer) return;

  const year = new Date().getFullYear();

  footer.innerHTML = `
    <div class="footer-inner">
      <div class="footer-top-grid">
        <!-- Brand Column -->
        <div class="footer-brand-col">
          <a href="index.html" class="footer-logo">
            <span class="logo-mark">M</span>
            <span class="logo-text">MUSE</span>
          </a>
          <p class="footer-tagline">Find your inspiration. Share your creation.</p>
          <p class="footer-mission">
            A thoughtfully curated creative studio where visual designers, developers, photographers, and artists present their craft and inspire one another.
          </p>

          <!-- Social Icons -->
          <div class="footer-social-row">
            <a href="https://dribbble.com" target="_blank" rel="noopener noreferrer" class="social-icon-btn" aria-label="Dribbble">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle><path d="M19.13 5.09C15.22 9.14 10 10.44 2.25 10.94"></path><path d="M21.75 12.84c-6.62-1.41-12.14 1-16.38 6.32"></path><path d="M8.56 2.75c4.37 6 6 9.42 8 17.72"></path>
              </svg>
            </a>
            <a href="https://figma.com" target="_blank" rel="noopener noreferrer" class="social-icon-btn" aria-label="Figma">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"></path><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"></path><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"></path><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"></path><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"></path>
              </svg>
            </a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" class="social-icon-btn" aria-label="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
              </svg>
            </a>
            <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" class="social-icon-btn" aria-label="Instagram">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
            </a>
          </div>
        </div>

        <!-- Links Column 1: Studio -->
        <div class="footer-links-col">
          <h4 class="footer-col-title">Studio & Discover</h4>
          <ul class="footer-list">
            <li><a href="feed.html">Community Feed</a></li>
            <li><a href="discover.html">Curated Exhibition</a></li>
            <li><a href="explore.html">Explore Projects</a></li>
            <li><a href="explore.html?tab=creators">Discover Creators</a></li>
            <li><a href="challenges.html">Weekly Prompts</a></li>
          </ul>
        </div>

        <!-- Links Column 2: Create -->
        <div class="footer-links-col">
          <h4 class="footer-col-title">Create & Portfolio</h4>
          <ul class="footer-list">
            <li><a href="create-project.html">Publish Project</a></li>
            <li><a href="portfolio.html">My Portfolio</a></li>
            <li><a href="saved.html">Saved Inspirations</a></li>
            <li><a href="notifications.html">Activity Stream</a></li>
            <li><a href="edit-profile.html">Creator Identity</a></li>
          </ul>
        </div>

        <!-- Links Column 3: Legal & Support -->
        <div class="footer-links-col">
          <h4 class="footer-col-title">Legal &amp; Support</h4>
          <ul class="footer-list">
            <li><a href="privacy.html">Privacy Policy</a></li>
            <li><a href="terms.html">Terms &amp; Conditions</a></li>
            <li><a href="help.html">Help Center</a></li>
          </ul>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div class="footer-bottom-bar">
        <p class="footer-copy-text">&copy; ${year} MUSE Creative Community. All creations belong to their respective creators.</p>
        <div class="footer-bottom-actions">
          <button id="backToTopBtn" class="back-to-top-btn" title="Back to top">
            <span>Back to top</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Wire footer events
  document.getElementById('backToTopBtn')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/* ================================================================== */
/*  Supabase Quick Connect Modal                                      */
/* ================================================================== */

function _initSupabaseModal() {
  document.getElementById('supabaseStatusBtn')?.addEventListener('click', () => {
    _openSupabaseModal();
  });
}

function _openSupabaseModal() {
  const existing = document.getElementById('supabaseConnectModal');
  if (existing) existing.remove();

  const config = getSupabaseConfig();

  const modal = document.createElement('div');
  modal.id = 'supabaseConnectModal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-content supabase-connect-dialog" role="dialog" aria-modal="true" aria-labelledby="supaModalTitle">
      <div class="modal-header">
        <div class="modal-header-icon">⚡</div>
        <div>
          <h3 id="supaModalTitle" class="modal-title">Connect Your Supabase Project</h3>
          <p class="modal-desc">Attach your live Supabase backend to enable instant real auth, storage, and project data.</p>
        </div>
        <button type="button" class="modal-close-btn" id="closeSupaModal" aria-label="Close">&times;</button>
      </div>

      <div class="supabase-steps-callout">
        <strong>Quick 3-Step Setup:</strong>
        <ol>
          <li>Open your <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" class="link-inline">Supabase Dashboard</a> and go to <strong>Project Settings > API</strong>.</li>
          <li>Copy your <strong>Project URL</strong> and <strong>anon public key</strong> and paste them below.</li>
          <li>In Supabase <strong>SQL Editor</strong>, run <code>supabase_schema.sql</code> from the MUSE folder to create all tables and storage buckets!</li>
        </ol>
      </div>

      <form id="supabaseConnectForm">
        <div class="form-group">
          <label for="modalSupaUrl" class="form-label">Supabase Project URL</label>
          <input type="url" id="modalSupaUrl" class="form-input" placeholder="https://your-project-id.supabase.co" value="${config.url.includes('YOUR_PROJECT_ID') ? '' : config.url}" required />
          <small class="form-help">Found in Project Settings > API > Project URL</small>
        </div>

        <div class="form-group">
          <label for="modalSupaKey" class="form-label">Supabase Anon Key (Public)</label>
          <input type="text" id="modalSupaKey" class="form-input" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value="${config.key.includes('YOUR_SUPABASE_ANON_KEY') ? '' : config.key}" required />
          <small class="form-help">Found in Project Settings > API > Project API keys > anon (public)</small>
        </div>

        <div class="modal-actions mt-4">
          ${config.isConnected ? `
            <button type="button" id="disconnectSupaBtn" class="btn btn-outline btn-danger-text">Disconnect</button>
          ` : ''}
          <button type="button" class="btn btn-outline" id="cancelSupaModal">Cancel</button>
          <button type="submit" class="btn btn-primary">Save & Connect</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const cleanup = () => modal.remove();
  modal.querySelector('#closeSupaModal').addEventListener('click', cleanup);
  modal.querySelector('#cancelSupaModal').addEventListener('click', cleanup);
  modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); });

  modal.querySelector('#disconnectSupaBtn')?.addEventListener('click', () => {
    clearSupabaseConfig();
    showToast('Supabase disconnected. Using default settings.', 'info');
    cleanup();
    setTimeout(() => window.location.reload(), 800);
  });

  modal.querySelector('#supabaseConnectForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('modalSupaUrl').value.trim();
    const key = document.getElementById('modalSupaKey').value.trim();

    if (!url.startsWith('https://')) {
      showToast('Project URL must start with https://', 'error');
      return;
    }
    if (key.length < 20) {
      showToast('Please enter a valid Supabase anon key.', 'error');
      return;
    }

    saveSupabaseConfig(url, key);
    showToast('Supabase connected successfully! Reloading...', 'success');
    cleanup();
    setTimeout(() => window.location.reload(), 1000);
  });
}

/* ================================================================== */
/*  Mobile Menu & Avatar Dropdown Handlers                            */
/* ================================================================== */

function _initHamburger() {
  const btn = document.getElementById('navHamburger');
  const menu = document.getElementById('mobileMenu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    menu.setAttribute('aria-hidden', String(expanded));
    menu.classList.toggle('open');
    btn.classList.toggle('active');
  });
}

function _initAvatarDropdown() {
  const btn = document.getElementById('navAvatarBtn');
  const dropdown = document.getElementById('navDropdown');
  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = dropdown.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    dropdown.setAttribute('aria-hidden', String(!open));
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.classList.contains('open')) return;
    const wrap = document.getElementById('navAvatarWrap');
    if (wrap && !wrap.contains(e.target)) {
      dropdown.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      dropdown.setAttribute('aria-hidden', 'true');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdown.classList.contains('open')) {
      dropdown.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      dropdown.setAttribute('aria-hidden', 'true');
      btn.focus();
    }
  });
}

function _initSignOutButtons() {
  const desktopBtn = document.getElementById('navSignOut');
  const mobileBtn = document.getElementById('mobileSignOut');

  const handler = async () => {
    await signOut();
    window.location.href = 'login.html';
  };

  desktopBtn?.addEventListener('click', handler);
  mobileBtn?.addEventListener('click', handler);
}

/* ================================================================== */
/*  Active Nav-Link Highlighting                                      */
/* ================================================================== */

export function highlightActiveNavLink() {
  const currentPath = window.location.pathname.toLowerCase();

  document.querySelectorAll('.nav-link[data-page]').forEach((link) => {
    const page = link.dataset.page;
    if (currentPath.includes(page)) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

/* ================================================================== */
/*  Toast Notifications                                               */
/* ================================================================== */

export function showToast(message, type = 'info', duration = TOAST_DURATION) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-msg">${_escapeHtml(message)}</span>
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => _removeToast(toast));
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => _removeToast(toast), duration);
}

function _removeToast(toast) {
  toast.classList.remove('show');
  toast.classList.add('hide');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
}

/* ================================================================== */
/*  Loading Spinner                                                   */
/* ================================================================== */

export function showLoading(message = 'Loading…') {
  if (document.getElementById('loadingOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'loadingOverlay';
  overlay.className = 'loading-overlay';
  overlay.setAttribute('aria-busy', 'true');
  overlay.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner-ring"></div>
      <p class="loading-text">${_escapeHtml(message)}</p>
    </div>
  `;
  document.body.appendChild(overlay);
}

export function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.remove();
}

/* ================================================================== */
/*  Formatters & Helpers                                              */
/* ================================================================== */

export function formatDate(date, options = {}) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const defaults = { month: 'short', day: 'numeric', year: 'numeric', ...options };
    return new Intl.DateTimeFormat('en-US', defaults).format(d);
  } catch {
    return '';
  }
}

export function timeAgo(date) {
  try {
    const d = date instanceof Date ? date : new Date(date);
    const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
    const intervals = [
      { label: 'year', seconds: 31_536_000 },
      { label: 'month', seconds: 2_592_000 },
      { label: 'week', seconds: 604_800 },
      { label: 'day', seconds: 86_400 },
      { label: 'hour', seconds: 3_600 },
      { label: 'min', seconds: 60 },
    ];
    for (const interval of intervals) {
      const count = Math.floor(seconds / interval.seconds);
      if (count >= 1) return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
    }
    return 'just now';
  } catch {
    return '';
  }
}

export function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength).trimEnd() + '…';
}

export function validateEmail(email) {
  if (!email || !email.trim()) return { valid: false, message: 'Email is required.' };
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!pattern.test(email.trim())) return { valid: false, message: 'Please enter a valid email address.' };
  return { valid: true, message: '' };
}

export function validatePassword(password, minLength = 6) {
  if (!password) return { valid: false, message: 'Password is required.' };
  if (password.length < minLength) return { valid: false, message: `Password must be at least ${minLength} characters.` };
  return { valid: true, message: '' };
}

export function validateRequired(value, fieldName = 'This field') {
  if (!value || !String(value).trim()) return { valid: false, message: `${fieldName} is required.` };
  return { valid: true, message: '' };
}

export function validateUsername(username) {
  if (!username || !username.trim()) return { valid: false, message: 'Username is required.' };
  const pattern = /^[a-z0-9_]{3,30}$/;
  if (!pattern.test(username.trim())) {
    return { valid: false, message: 'Username must be 3-30 characters: lowercase letters, numbers, or underscores.' };
  }
  return { valid: true, message: '' };
}

export function showFieldError(input, message) {
  input.classList.add('input-error');
  let errorEl = input.parentElement?.querySelector('.field-error');
  if (!errorEl) {
    errorEl = document.createElement('span');
    errorEl.className = 'field-error';
    errorEl.setAttribute('role', 'alert');
    input.parentElement?.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

export function clearFieldError(input) {
  input.classList.remove('input-error');
  const errorEl = input.parentElement?.querySelector('.field-error');
  if (errorEl) errorEl.remove();
}

export function confirmDialog(message, options = {}) {
  const { title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel', variant = 'default' } = options;
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-backdrop';
    backdrop.innerHTML = `
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmTitle">
        <h3 id="confirmTitle" class="confirm-title">${_escapeHtml(title)}</h3>
        <p class="confirm-message">${_escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn btn-outline btn-sm" id="confirmCancel">${_escapeHtml(cancelText)}</button>
          <button class="btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'} btn-sm" id="confirmOk">${_escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const cleanup = (result) => { backdrop.remove(); resolve(result); };
    backdrop.querySelector('#confirmOk').addEventListener('click', () => cleanup(true));
    backdrop.querySelector('#confirmCancel').addEventListener('click', () => cleanup(false));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        cleanup(false);
      }
    });
    backdrop.querySelector('#confirmOk').focus();
  });
}

function _escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

export function escapeHtml(str) {
  return _escapeHtml(str);
}

/* ================================================================== */
/*  DOMContentLoaded Initialisation                                   */
/* ================================================================== */

export async function initPage() {
  await renderNavbar();
  renderFooter();

  // Handle sticky navbar scroll shadow
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (nav) {
      if (window.scrollY > 15) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
      }
    }
  }, { passive: true });

  onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') {
      await renderNavbar();
      renderFooter();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}
