# MUSE — Creative Social Networking Platform

> **"Find your inspiration. Share your creation."**

MUSE is a warm, thoughtfully designed creative studio platform where graphic designers, UI/UX thinkers, web developers, photographers, and visual artists can publish projects, receive constructive feedback, enter creative challenges, and build an authentic portfolio.

---

## 🎨 Design System & Palette (Warm Creative Studio)

- **Warm Ivory (`#F7F4EC`)**: Base background, clean spacious canvas.
- **Soft Sage (`#A8B5A0`)**: Primary actions, button states, calm accents.
- **Terracotta (`#C8795A`)**: Highlights, badges, important calls to action.
- **Sand Beige (`#DCCBB8`)**: Borders, secondary panels, tactile surfaces.
- **Deep Olive (`#343B35`)**: High-contrast typography, brand mark, navigation.
- **Typography**: Playfair Display (editorial headings) & DM Sans (clean body).

---

## 📁 Project Architecture

Built with **Plain HTML5, CSS3, and Vanilla JavaScript (ES Modules)** — no Node build step, no framework overhead, runs straight in any browser or with VS Code Live Server.

```text
MUSE/
├── index.html              # 1. Landing Page (Hero, Principles, Featured, Spotlight)
├── signup.html             # 2. Registration with instant profile creation
├── login.html              # 3. Authentication with password recovery
├── discover.html           # 4. Curated inspiration, category pills & creators
├── feed.html               # 5. Chronological/Follower feed & sidebar
├── explore.html            # 6. Global search (Projects & Creators tabs)
├── project-details.html    # 7. Project view, gallery, comments & likes
├── create-project.html     # 8. Publishing studio with media upload & drafts
├── portfolio.html          # 9. Personal portfolio (All, Published, Drafts)
├── profile.html            # 10. Public creator profile & follower counts
├── edit-profile.html       # 11. Profile editor & avatar upload
├── notifications.html      # 12. Realtime activity stream & read states
├── challenges.html         # 13. Weekly creative challenges & deadlines
├── challenge-details.html  # 14. Challenge brief, rules & project submission
├── saved.html              # 15. Private bookmarks collection
├── settings.html           # 16. Account, security, password & preferences
├── supabase_schema.sql     # Complete PostgreSQL schema, RLS & Storage policies
├── css/
│   ├── style.css           # Core design tokens, components & utilities
│   ├── auth.css            # Auth cards, inputs & transitions
│   ├── dashboard.css       # Feed, layout & widget styles
│   ├── projects.css        # Project views & gallery components
│   └── responsive.css      # Desktop, tablet & mobile media queries
├── js/
│   ├── supabase.js         # Supabase JS SDK client & helpers
│   ├── auth.js             # Authentication & session listener
│   ├── common.js           # Navbar, footer, toast & modals
│   ├── projects.js         # Project CRUD & media management
│   ├── feed.js             # Personalized feed & creator discovery
│   ├── profile.js          # Profile stats, tabs & avatar storage
│   ├── interactions.js     # Likes, comments, follows & bookmarks
│   ├── challenges.js       # Challenges & participant submissions
│   └── notifications.js    # Activity notifications & Realtime
└── assets/
    ├── images/default-avatar.svg
    └── logo/muse-logo.svg
```

---

## 🚀 How to Run Locally with VS Code Live Server

1. **Open Folder**: Open the `MUSE` folder in Visual Studio Code.
2. **Install Live Server**: If you haven't already, install the **Live Server** extension (by Ritwick Dey) from the VS Code Marketplace.
3. **Start Preview**: Right-click `index.html` and select **"Open with Live Server"** (or click the *Go Live* button in the bottom status bar).
4. The website will open in your browser at `http://127.0.0.1:5500/index.html`.

---

## ⚡ Connecting to Your Supabase Backend

### Step 1: Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. Under **Project Settings > API**, copy your:
   - **Project URL**
   - **anon / public key**

### Step 2: Configure Frontend Credentials
Open `MUSE/js/supabase.js` and paste your credentials into lines 13–14:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_PUBLIC_KEY';
```

*(Note: Never paste your `service_role` key into client-side code!)*

### Step 3: Run Database Migrations
1. Open the Supabase Dashboard, go to **SQL Editor**.
2. Open `MUSE/supabase_schema.sql`, copy all contents, paste into the SQL Editor, and click **Run**.
3. This creates:
   - All 10 relational tables (`profiles`, `projects`, `project_images`, `likes`, `comments`, `follows`, `bookmarks`, `challenges`, `challenge_submissions`, `notifications`).
   - The automatic profile creation trigger on signup.
   - Comprehensive Row Level Security (RLS) policies.
   - The two Storage buckets (`muse-avatars` and `muse-projects`) with user-scoped upload policies.

---

## ✅ Feature Checklist & QA Verified

- [x] All 16 planned pages implemented with clean semantic HTML5.
- [x] Consistent Warm Creative Studio aesthetic across all views.
- [x] Responsive on desktop (1280px+), tablet (768px), and mobile (375px+).
- [x] Authentication flows: Sign up, Sign in, Password reset, and Logout.
- [x] Project creation with cover image upload, tool tags, draft vs published states.
- [x] Interactive community actions: Likes (prevents duplicates), comments (edit/delete by owner), follows (prevents self-follow), and private bookmarks.
- [x] Creative challenges with countdown deadlines and participant entries.
- [x] Safe DOM text escaping to prevent XSS.
- [x] Form validation with friendly feedback toasts and error highlights.
