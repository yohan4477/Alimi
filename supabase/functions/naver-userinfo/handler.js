// UserInfo normalization for Supabase's custom OAuth provider.
// A Naver access token is verified with Naver; no client-supplied identity is trusted.
export async function naverUserinfo(request, fetchImpl = fetch) {
  const headers = {'Content-Type':'application/json','Cache-Control':'no-store'};
  const reply = (body, status) => new Response(JSON.stringify(body), {status,headers});
  if (request.method !== 'GET') return reply({error:'method_not_allowed'},405);
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer [^\s]+$/i.test(authorization)) return reply({error:'invalid_token'},401);
  try {
    const upstream = await fetchImpl('https://openapi.naver.com/v1/nid/me', {
      headers:{Authorization:authorization}, signal:AbortSignal.timeout(8000),redirect:'error'
    });
    if (!upstream.ok) return reply({error:'invalid_token'},401);
    const data = await upstream.json();
    if (data.resultcode !== '00' || typeof data.response?.id !== 'string' || !data.response.id) return reply({error:'invalid_token'},401);
    // Do not assert email_verified or link accounts using an unverified email.
    return reply({sub:data.response.id,...(typeof data.response.nickname==='string'?{name:data.response.nickname}:{})},200);
  } catch { return reply({error:'provider_unavailable'},502); }
}
