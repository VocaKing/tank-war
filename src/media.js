// A versioned Pages build can reuse the already published, unchanged map and showroom media.
export const sharedMediaUrl = path => (import.meta.env.VITE_SHARED_MEDIA_BASE || import.meta.env.BASE_URL) + path;
