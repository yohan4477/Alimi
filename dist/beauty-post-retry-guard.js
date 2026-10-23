// A conservative same-tab guard, NOT server idempotency. It cannot deduplicate
// separate tabs/devices or prove that a lost response did not commit a write.
import {createPost, validatePostProduct} from './community-api.js';
import {RpcError} from './supabase.js';
const prefix = 'seoulbeauty-post-pending:';
const rejectedStatuses = new Set([400, 401, 403, 404, 409, 422, 429]);
export const knownPostRejection = error => error instanceof RpcError && rejectedStatuses.has(error.status);
const guardError = code => Object.assign(new Error(code), {code});

export async function createGuardedPost(secret, room, draft, {storage, fetchImpl = fetch} = {}) {
  // All local product validation must happen before a durable pending marker.
  const payload = {...draft, item: validatePostProduct(draft.item)};
  const key = draft.beautyHandoffId ? prefix + draft.beautyHandoffId : null;
  if (key) {
    let previous;
    try {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') throw Error();
      previous = storage.getItem(key);
      if (!previous) {
        storage.setItem(key, 'pending');
        if (storage.getItem(key) !== 'pending') throw Error();
      }
    } catch {throw guardError('post:storage');}
    if (previous) throw guardError(previous === 'posted' ? 'post:already' : 'post:uncertain');
  }
  let post;
  try {
    post = await createPost(secret, room, payload, fetchImpl);
    // A malformed successful response is still ambiguous; never repeat the write.
    if (!post || !Number.isSafeInteger(post.id) || post.id <= 0) throw Error('Invalid post response');
  } catch (error) {
    if (key && knownPostRejection(error)) {
      try {storage.removeItem(key);} catch {}
    } else if (key) {
      throw guardError('post:uncertain');
    }
    throw error;
  }
  if (key) {
    // Keep the opaque completed marker for this tab. Clearing it before draft
    // cleanup could republish a stale restored draft if cleanup/storage fails.
    try {storage.setItem(key, 'posted');} catch {}
  }
  return post;
}
