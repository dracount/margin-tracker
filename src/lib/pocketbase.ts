import PocketBase from 'pocketbase';

// Use VITE_PB_URL if set, otherwise use same origin (for production) or localhost (for dev)
const getBaseUrl = () => {
  if (import.meta.env.VITE_PB_URL) {
    return import.meta.env.VITE_PB_URL;
  }
  // In browser, use same origin for production
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return window.location.origin;
  }
  // Fallback for local development
  return 'http://127.0.0.1:8090';
};

const pb = new PocketBase(getBaseUrl());

export default pb;
