-- Qualify the storage object key explicitly; an unqualified `name` is bound to
-- players.name inside the policy subquery and rejects valid owner uploads.
DROP POLICY IF EXISTS "player uploads own banner" ON storage.objects;
CREATE POLICY "player uploads own banner" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'player-banners'
    AND EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.auth_user_id = auth.uid()
        AND p.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

DROP POLICY IF EXISTS "player updates own banner" ON storage.objects;
CREATE POLICY "player updates own banner" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'player-banners'
    AND EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.auth_user_id = auth.uid()
        AND p.id::text = (storage.foldername(storage.objects.name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'player-banners'
    AND EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.auth_user_id = auth.uid()
        AND p.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );

DROP POLICY IF EXISTS "player deletes own banner" ON storage.objects;
CREATE POLICY "player deletes own banner" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'player-banners'
    AND EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.auth_user_id = auth.uid()
        AND p.id::text = (storage.foldername(storage.objects.name))[1]
    )
  );
