insert into storage.buckets (id, name, public) values ('muse-avatars','muse-avatars',true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('muse-projects','muse-projects',true) on conflict (id) do nothing;

drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable" on storage.objects for select using (bucket_id = 'muse-avatars');
drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar" on storage.objects for insert with check (bucket_id = 'muse-avatars' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Users can update/delete their own avatar" on storage.objects;
create policy "Users can update/delete their own avatar" on storage.objects for update using (bucket_id = 'muse-avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Project images are publicly readable" on storage.objects;
create policy "Project images are publicly readable" on storage.objects for select using (bucket_id = 'muse-projects');
drop policy if exists "Users can upload project images" on storage.objects;
create policy "Users can upload project images" on storage.objects for insert with check (bucket_id = 'muse-projects' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "Users can update/delete their project images" on storage.objects;
create policy "Users can update/delete their project images" on storage.objects for delete using (bucket_id = 'muse-projects' and auth.uid()::text = (storage.foldername(name))[1]);

notify pgrst, 'reload schema';
