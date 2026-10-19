// =====================================================================
//  ENDZONE KINGS — server config
//  Paste your free Supabase project's URL and public key here.
//  Supabase dashboard → your project → Project Settings → API (or "Connect")
//  Leave them empty to run in offline mode (accounts saved on this device only,
//  online 1v1 disabled).
// =====================================================================
export const CONFIG = {
  SUPABASE_URL: 'https://dhtnuisxbnmcnjgsiihn.supabase.co',       // looks like: https://abcdefghijklm.supabase.co
  // two-step login emails a CODE, which needs the Supabase "Magic link or OTP" email to show {{ .Token }}.
  // The free built-in email can't be edited (link only), so this stays off until custom SMTP is set up.
  TWOFA: false,
  SUPABASE_ANON_KEY: 'sb_publishable_hK16PxzdeuCc5l65cE-u-g_qd3oqm5A',  // the "anon public" key (or the "publishable" key, sb_publishable_...)
};
