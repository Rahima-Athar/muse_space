create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text,
  bio text,
  avatar_url text,
  skills text,
  website text,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);
alter table public.profiles drop constraint if exists username_format_check;
alter table public.profiles add constraint username_format_check check (username ~ '^[a-z0-9_]{3,30}$');

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  tools text,
  cover_image text,
  external_url text,
  status text default 'published' check (status in ('draft','published')),
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);
create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_projects_category on public.projects(category);
create index if not exists idx_projects_status on public.projects(status);
create index if not exists idx_projects_created_at on public.projects(created_at desc);

create table if not exists public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  image_url text not null,
  display_order integer default 1,
  created_at timestamptz default timezone('utc', now()) not null
);
create index if not exists idx_project_images_project_id on public.project_images(project_id);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz default timezone('utc', now()) not null,
  unique(user_id, project_id)
);
create index if not exists idx_likes_project_id on public.likes(project_id);
create index if not exists idx_likes_user_id on public.likes(user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  content text not null,
  created_at timestamptz default timezone('utc', now()) not null,
  updated_at timestamptz default timezone('utc', now()) not null
);
create index if not exists idx_comments_project_id on public.comments(project_id);
create index if not exists idx_comments_user_id on public.comments(user_id);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default timezone('utc', now()) not null,
  unique(follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);
create index if not exists idx_follows_follower on public.follows(follower_id);
create index if not exists idx_follows_following on public.follows(following_id);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz default timezone('utc', now()) not null,
  unique(user_id, project_id)
);
create index if not exists idx_bookmarks_user_id on public.bookmarks(user_id);

create table if not exists public.challenges (
  id text primary key,
  title text not null,
  description text,
  category text,
  cover_image text,
  start_date timestamptz default timezone('utc', now()) not null,
  deadline timestamptz,
  status text default 'active' check (status in ('active','upcoming','completed')),
  created_at timestamptz default timezone('utc', now()) not null
);
insert into public.challenges (id,title,description,category,cover_image,start_date,deadline,status) values
 ('challenge-earth-form','Earth & Form: Organic Tactility','Explore organic textures, warm palettes, and tactile shapes.','Graphic Design','https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop&q=80',now(),now()+interval '12 days','active'),
 ('challenge-harmonics','Harmonics in Motion','A 10-second interactive poster or animated typography system.','Digital Art','https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',now(),now()+interval '20 days','active'),
 ('challenge-architectures','Architectures of Silence','Editorial photography and spatial UI exploring modern brutalism.','Photography','https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80',now()+interval '10 days',now()+interval '30 days','upcoming')
on conflict (id) do nothing;

create table if not exists public.challenge_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id text not null references public.challenges(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  description text,
  created_at timestamptz default timezone('utc', now()) not null,
  unique(challenge_id, project_id)
);
create index if not exists idx_submissions_challenge on public.challenge_submissions(challenge_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  project_id uuid references public.projects(id) on delete cascade,
  message text not null,
  read boolean default false not null,
  created_at timestamptz default timezone('utc', now()) not null
);
create index if not exists idx_notifications_recipient on public.notifications(recipient_id);
create index if not exists idx_notifications_read on public.notifications(recipient_id, read);

create or replace function public.handle_new_user()
returns trigger as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := coalesce(lower(new.raw_user_meta_data->>'username'), 'creator_' || substring(new.id::text,1,8));
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
  if base_username is null or length(base_username) < 3 then
    base_username := 'creator_' || substring(new.id::text,1,8);
  end if;
  final_username := base_username;
  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;
  insert into public.profiles (id, username, full_name, avatar_url)
  values (new.id, final_username, coalesce(new.raw_user_meta_data->>'full_name','Creative Creator'), new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_images enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.bookmarks enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_submissions enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone" on public.profiles for select using (true);
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

drop policy if exists "Published projects are viewable by everyone" on public.projects;
create policy "Published projects are viewable by everyone" on public.projects for select using (status = 'published' or auth.uid() = user_id);
drop policy if exists "Authenticated users can create projects" on public.projects;
create policy "Authenticated users can create projects" on public.projects for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update only their own projects" on public.projects;
create policy "Users can update only their own projects" on public.projects for update using (auth.uid() = user_id);
drop policy if exists "Users can delete only their own projects" on public.projects;
create policy "Users can delete only their own projects" on public.projects for delete using (auth.uid() = user_id);

drop policy if exists "Gallery images are viewable with project" on public.project_images;
create policy "Gallery images are viewable with project" on public.project_images for select using (true);
drop policy if exists "Users can insert images for their projects" on public.project_images;
create policy "Users can insert images for their projects" on public.project_images for insert with check (exists (select 1 from public.projects where id = project_id and user_id = auth.uid()));
drop policy if exists "Users can delete images from their projects" on public.project_images;
create policy "Users can delete images from their projects" on public.project_images for delete using (exists (select 1 from public.projects where id = project_id and user_id = auth.uid()));

drop policy if exists "Likes are viewable by everyone" on public.likes;
create policy "Likes are viewable by everyone" on public.likes for select using (true);
drop policy if exists "Authenticated users can like projects" on public.likes;
create policy "Authenticated users can like projects" on public.likes for insert with check (auth.uid() = user_id);
drop policy if exists "Users can unlike projects" on public.likes;
create policy "Users can unlike projects" on public.likes for delete using (auth.uid() = user_id);

drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Comments are viewable by everyone" on public.comments for select using (true);
drop policy if exists "Authenticated users can add comments" on public.comments;
create policy "Authenticated users can add comments" on public.comments for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update their own comments" on public.comments;
create policy "Users can update their own comments" on public.comments for update using (auth.uid() = user_id);
drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments" on public.comments for delete using (auth.uid() = user_id);

drop policy if exists "Follows are viewable by everyone" on public.follows;
create policy "Follows are viewable by everyone" on public.follows for select using (true);
drop policy if exists "Users can follow creators" on public.follows;
create policy "Users can follow creators" on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "Users can unfollow creators" on public.follows;
create policy "Users can unfollow creators" on public.follows for delete using (auth.uid() = follower_id);

drop policy if exists "Users can only view their own bookmarks" on public.bookmarks;
create policy "Users can only view their own bookmarks" on public.bookmarks for select using (auth.uid() = user_id);
drop policy if exists "Users can bookmark projects" on public.bookmarks;
create policy "Users can bookmark projects" on public.bookmarks for insert with check (auth.uid() = user_id);
drop policy if exists "Users can remove their bookmarks" on public.bookmarks;
create policy "Users can remove their bookmarks" on public.bookmarks for delete using (auth.uid() = user_id);

drop policy if exists "Challenges viewable by everyone" on public.challenges;
create policy "Challenges viewable by everyone" on public.challenges for select using (true);

drop policy if exists "Submissions viewable by everyone" on public.challenge_submissions;
create policy "Submissions viewable by everyone" on public.challenge_submissions for select using (true);
drop policy if exists "Users can submit their own projects to challenges" on public.challenge_submissions;
create policy "Users can submit their own projects to challenges" on public.challenge_submissions for insert with check (auth.uid() = user_id and exists (select 1 from public.projects where id = project_id and user_id = auth.uid()));

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications" on public.notifications for select using (auth.uid() = recipient_id);
drop policy if exists "Authenticated users can trigger notifications" on public.notifications;
create policy "Authenticated users can trigger notifications" on public.notifications for insert with check (auth.uid() = actor_id);
drop policy if exists "Users can mark their notifications as read" on public.notifications;
create policy "Users can mark their notifications as read" on public.notifications for update using (auth.uid() = recipient_id);

notify pgrst, 'reload schema';
