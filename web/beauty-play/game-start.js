// Resolve the invitation before the caller enables gameplay or emits events.
export async function resolveGameStart({fetchImpl=fetch, invite='', play, signal}={}) {
  const session = await fetchImpl('/api/session', {signal});
  if (!session.ok) throw Error('Session unavailable');
  const sessionInfo = await session.json();
  if (!invite) return {sessionInfo, invitation:null};
  const response = await fetchImpl('/api/invite?id='+encodeURIComponent(invite)+'&play='+encodeURIComponent(play), {signal});
  const invitation = await response.json();
  if (!response.ok) throw Object.assign(Error('Invitation unavailable'), {code:'invitation_unavailable'});
  return {sessionInfo, invitation};
}
