// =============================================================
// Shared Supabase client helper, scoped to net-new dashboard
// features (currently: the Media Uploads component on index.html).
//
// Per-page state sync (goals/health/finance/water) already has its
// own working pipeline in sync.js (generic app_state JSONB sync)
// and gym.html's own pcCollectState/pcApplyRemoteState + progress
// photo uploads. This file intentionally does NOT duplicate that —
// it exposes SUPABASE_URL / SUPABASE_ANON_KEY as global constants
// plus a small client + Storage helper for anything built on top
// of this file going forward.
// =============================================================
(function () {
  'use strict';

  // Same project as the rest of the dashboard. Falls back to
  // LocalStorage-only behavior (via getSupabaseClient() returning
  // null) if these are ever blanked out to 'PASTE-...' placeholders.
  window.SUPABASE_URL = window.SUPABASE_URL || 'https://rwzfbrvcherwhglxglal.supabase.co';
  window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_5YmEF1bdESRoB97VscGVPA_ShzGqAFo';

  let cachedClient = null;
  function getSupabaseClient() {
    if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) return null;
    if (window.SUPABASE_URL.indexOf('PASTE-') === 0) return null;
    if (!cachedClient) {
      cachedClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }
    return cachedClient;
  }
  window.getSupabaseClient = getSupabaseClient;

  // -------- Media Hub: Supabase Storage-backed file uploads --------
  // Deliberately table-free: the "media" bucket's own file listing
  // is the shared source of truth across devices. There's no
  // Postgres realtime channel for Storage, so listMediaFiles() is
  // called on load/focus (see index.html) to pick up files another
  // device uploaded, mirroring the polling pattern already used by
  // topbar.js for the water pill.
  const MEDIA_BUCKET = 'media';

  async function uploadMediaFile(file) {
    const supa = getSupabaseClient();
    if (!supa) return { ok: false, error: 'Supabase not configured — file kept local-only.' };
    const safeName = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    try {
      const { error } = await supa.storage.from(MEDIA_BUCKET).upload(safeName, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false
      });
      if (error) return { ok: false, error: error.message || 'Upload failed.' };
      const { data } = supa.storage.from(MEDIA_BUCKET).getPublicUrl(safeName);
      return { ok: true, name: safeName, url: data ? data.publicUrl : null };
    } catch (e) {
      return { ok: false, error: 'Upload failed.' };
    }
  }

  async function listMediaFiles() {
    const supa = getSupabaseClient();
    if (!supa) return [];
    try {
      const { data, error } = await supa.storage.from(MEDIA_BUCKET).list('', {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
      });
      if (error || !data) return [];
      return data
        .filter((f) => f.id)
        .map((f) => ({
          name: f.name,
          url: supa.storage.from(MEDIA_BUCKET).getPublicUrl(f.name).data.publicUrl,
          createdAt: f.created_at
        }));
    } catch (e) {
      return [];
    }
  }

  window.MediaHub = { uploadFile: uploadMediaFile, listFiles: listMediaFiles };
})();
