import {requestLanguage} from '../dist/language-preference.js';
// Vercel supplies x-vercel-ip-country. No IP parsing, lookup, storage, or logging.
export default function language(req,res) {
 for(const [name,value] of Object.entries({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','Vary':'Cookie, X-Vercel-IP-Country, Accept-Language','X-Content-Type-Options':'nosniff'}))res.setHeader(name,value);
 if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.setHeader('Allow','GET, HEAD');return res.end();}
 const url=new URL(req.url,'https://seoulbeauty.me');
 const value=requestLanguage({search:url.search,cookie:req.headers.cookie,country:req.headers['x-vercel-ip-country'],acceptLanguage:req.headers['accept-language']});
 res.statusCode=200;return res.end(req.method==='HEAD'?undefined:JSON.stringify({language:value}));
}
