// Abstract, generated profile illustrations. These are fallbacks, never user photos.
export function avatar(seed, extra='') {
  const n=[...String(seed)].reduce((v,c)=>(v*31+c.charCodeAt(0))>>>0,0);
  const skin=['#e0b399','#c58b65','#edc4ab','#98664c'][n%4],bg=['#dbe2dd','#e8dfce','#cedcdf','#e0dbd9'][n%4],shirt=['#486555','#bea99c','#323f47','#88917b'][n%4];
  return `<span class="profile-avatar ${extra}" aria-hidden="true"><svg viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><path d="M4 64c2-16 14-20 28-20s26 4 28 20" fill="${shirt}"/><path d="M17 42c-6-13-4-33 12-34 20-3 25 18 19 35l-8 9-23-3z" fill="#28302e"/><path d="M26 39h13v13H26z" fill="${skin}"/><path d="M22 25c0-12 22-12 22 0l-2 12c-2 11-17 10-19-1z" fill="${skin}"/><path d="M18 27C17 9 40 7 44 21c-10 1-10-5-12-6-2 7-7 11-14 12" fill="#28302e"/>${n%3===0?'<circle cx="29" cy="9" r="8" fill="#28302e"/>':''}</svg></span>`;
}
export const bookmark='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
