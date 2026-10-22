-- NutriVance Global Health administrator setup
-- Run this entire script in Supabase Dashboard > SQL Editor > New query.
-- IMPORTANT: create the auth user for nutrivance3@gmail.com first or immediately after.
-- Browser code must use ONLY the publishable/anon key, never service_role.

create extension if not exists pgcrypto;

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  summary text not null default '',
  body text not null default '',
  category text not null default 'Nutrition',
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  image_url text,
  author_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.articles enable row level security;
revoke all on table public.articles from anon, authenticated;
grant select on table public.articles to anon, authenticated;
grant insert, update, delete on table public.articles to authenticated;

-- Public visitors can read only published posts whose publication date is due.
drop policy if exists "Public can read published articles" on public.articles;
create policy "Public can read published articles"
on public.articles for select to anon, authenticated
using (status = 'published' and published_at is not null and published_at <= now());

-- Only the designated admin account can read/manage all articles.
-- auth.jwt() email is checked in addition to the authenticated role.
drop policy if exists "NutriVance admin can read all articles" on public.articles;
create policy "NutriVance admin can read all articles"
on public.articles for select to authenticated
using ((auth.jwt() ->> 'email') = 'nutrivance3@gmail.com');

drop policy if exists "NutriVance admin can insert articles" on public.articles;
create policy "NutriVance admin can insert articles"
on public.articles for insert to authenticated
with check ((auth.jwt() ->> 'email') = 'nutrivance3@gmail.com' and author_id = auth.uid());

drop policy if exists "NutriVance admin can update articles" on public.articles;
create policy "NutriVance admin can update articles"
on public.articles for update to authenticated
using ((auth.jwt() ->> 'email') = 'nutrivance3@gmail.com')
with check ((auth.jwt() ->> 'email') = 'nutrivance3@gmail.com' and author_id = auth.uid());

drop policy if exists "NutriVance admin can delete articles" on public.articles;
create policy "NutriVance admin can delete articles"
on public.articles for delete to authenticated
using ((auth.jwt() ->> 'email') = 'nutrivance3@gmail.com');

-- Private-to-admin image bucket; do not make this bucket public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nutrivance-media','nutrivance-media',true,8388608,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=true, file_size_limit=8388608,
allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif'];

-- Images intended for public articles are publicly readable; only the admin can upload/change/delete.
drop policy if exists "Public can view NutriVance media" on storage.objects;
create policy "Public can view NutriVance media"
on storage.objects for select to anon, authenticated
using (bucket_id = 'nutrivance-media');

drop policy if exists "Admin can view own NutriVance media" on storage.objects;
create policy "Admin can view own NutriVance media"
on storage.objects for select to authenticated
using (bucket_id = 'nutrivance-media' and (auth.jwt() ->> 'email') = 'nutrivance3@gmail.com' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Admin can upload own NutriVance media" on storage.objects;
create policy "Admin can upload own NutriVance media"
on storage.objects for insert to authenticated
with check (bucket_id = 'nutrivance-media' and (auth.jwt() ->> 'email') = 'nutrivance3@gmail.com' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Admin can update own NutriVance media" on storage.objects;
create policy "Admin can update own NutriVance media"
on storage.objects for update to authenticated
using (bucket_id = 'nutrivance-media' and (auth.jwt() ->> 'email') = 'nutrivance3@gmail.com' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'nutrivance-media' and (auth.jwt() ->> 'email') = 'nutrivance3@gmail.com' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Admin can delete own NutriVance media" on storage.objects;
create policy "Admin can delete own NutriVance media"
on storage.objects for delete to authenticated
using (bucket_id = 'nutrivance-media' and (auth.jwt() ->> 'email') = 'nutrivance3@gmail.com' and (storage.foldername(name))[1] = auth.uid()::text);
