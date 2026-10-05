-- Une vraie photo de profil, prise dans la galerie du téléphone.
--
-- Jusqu'ici l'avatar ne pouvait être qu'un dessin DiceBear fabriqué sur
-- l'appareil (`dicebear:<style>:<graine>` dans `profiles.avatar_url`). L'app
-- recadre maintenant la photo en carré de 400 px, la compresse en JPEG et la
-- dépose ici, dans le dossier de son auteur : `avatars/<uid>/<horodatage>.jpg`.
--
-- Le seau est public en lecture : la photo s'affiche chez les membres des
-- espaces par une simple URL, sans jeton. Écrire, remplacer, lister ou retirer
-- n'est permis que dans son propre dossier.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars: déposer dans son dossier" on storage.objects;
create policy "avatars: déposer dans son dossier"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: remplacer dans son dossier" on storage.objects;
create policy "avatars: remplacer dans son dossier"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Lister son dossier sert à retirer l'ancienne photo, et à tout effacer avant
-- la suppression du compte. Personne ne liste le dossier des autres.
drop policy if exists "avatars: lire son dossier" on storage.objects;
create policy "avatars: lire son dossier"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars: retirer de son dossier" on storage.objects;
create policy "avatars: retirer de son dossier"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- `avatar_url` s'affiche chez les autres membres : n'importe quelle adresse y
-- servirait de pixel de suivi. On n'accepte que les deux formes que l'app
-- écrit elle-même : un dessin DiceBear, ou une photo de ce seau.
alter table public.profiles drop constraint if exists profiles_avatar_url_source;
alter table public.profiles add constraint profiles_avatar_url_source check (
  avatar_url is null
  or avatar_url like 'dicebear:%'
  or avatar_url like 'https://tnvnmsevddvcklkitnpa.supabase.co/storage/v1/object/public/avatars/%'
);
