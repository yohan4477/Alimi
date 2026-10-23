// Explicit release gates after approved schema and capability verification.
// No URL, localStorage or account toggle exists.
export const ROOM_LIFECYCLE_ENABLED = true;
export const ROOM_EXPERIENCES_ENABLED = true;
const lifecycleRpc = new Set(['room_actions','leave_room','delete_room','delete_chat_message']);
const experienceRpc = new Set(['set_room_experience','delete_room_experience']);
export const roomRpcAllowedFor = (name, lifecycle = false, experiences = false) => (!lifecycleRpc.has(name) || lifecycle)
  && (!experienceRpc.has(name) || experiences);
export const roomRpcAllowed = name => roomRpcAllowedFor(name, ROOM_LIFECYCLE_ENABLED, ROOM_EXPERIENCES_ENABLED);
