// Security-reviewed release gates. Default OFF until the separately approved schema
// and grants are applied and verified. No URL, localStorage or account toggle exists.
export const ROOM_LIFECYCLE_ENABLED = false;
export const ROOM_EXPERIENCES_ENABLED = false;
const lifecycleRpc = new Set(['room_actions','leave_room','delete_room','delete_chat_message']);
const experienceRpc = new Set(['set_room_experience','delete_room_experience']);
export const roomRpcAllowed = name => (!lifecycleRpc.has(name) || ROOM_LIFECYCLE_ENABLED)
  && (!experienceRpc.has(name) || ROOM_EXPERIENCES_ENABLED);
