// Server-to-server adapter for Supabase's custom:naver OAuth2 provider.
// Never accept a caller-supplied profile or user id; verify the bearer with Naver.
export async function GET(request){
  const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
  const token=request.headers.get('authorization');
  if(!/^Bearer [^\s]{10,4096}$/.test(token||''))return Response.json({error:'unauthorized'},{status:401,headers});
  try{
    const response=await fetch('https://openapi.naver.com/v1/nid/me',{headers:{Authorization:token},signal:AbortSignal.timeout(10000)});
    const data=await response.json();const p=data.response;
    if(!response.ok||data.resultcode!=='00'||!p?.id)return Response.json({error:'invalid_token'},{status:401,headers});
    // Naver doesn't assert email_verified; never infer it or link by email here.
    return Response.json({sub:String(p.id),id:String(p.id),name:p.nickname||p.name||'Naver user',...(p.email?{email:p.email,email_verified:false}:{})},{headers});
  }catch{console.error('naver_userinfo_upstream_failed');return Response.json({error:'upstream_unavailable'},{status:502,headers});}
}
