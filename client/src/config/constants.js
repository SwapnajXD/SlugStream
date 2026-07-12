// NOTE: Vite exposes only VITE_* variables to client code at build time.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const FRONTEND_BASE =
  import.meta.env.VITE_PUBLIC_BASE_URL || window.location.origin;

// Optional: if unset, the CAPTCHA widget simply doesn't render, and the
// backend skips verification too (see server/.env.example).
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';