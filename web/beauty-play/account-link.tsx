'use client';
import {useEffect,useRef,useState} from 'react';
import {GoogleAuth,AUTH_STORAGE_KEYS} from '../../dist/auth.js';
import {linkGameAccount,restoreAccount} from './account-link-flow.js';
import {useLanguage} from './locale';

type Account={id:string;email?:string};
export default function AccountLink({accountLinkEnabled=false}:{accountLinkEnabled?:boolean}) {
  const {lang}=useLanguage(),ko=lang==='ko';
  const [account,setAccount]=useState<Account|null>(null),[loading,setLoading]=useState(true),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[restart,setRestart]=useState(false);
  const generation=useRef(0),mounted=useRef(false),auth=useRef<GoogleAuth|null>(null);
  useEffect(()=>{
    if(!accountLinkEnabled)return;
    mounted.current=true;
    const restore=async()=>{
      const request=++generation.current;
      setConsent(false);setAccount(null);setLoading(true);
      const client=new GoogleAuth();auth.current=client;
      try{const user=await restoreAccount(client);if(mounted.current&&generation.current===request)setAccount(user?.id&&!user.is_anonymous?{id:user.id,email:user.email}:null);}
      catch{if(mounted.current&&generation.current===request)setMessage(ko?'로그인 상태를 확인하지 못했어요. 다시 로그인한 뒤 시도해 주세요.':'Could not check your account. Sign in again before trying.');}
      finally{if(mounted.current&&generation.current===request)setLoading(false);}
    };
    const changed=(event:StorageEvent)=>{if(event.key===AUTH_STORAGE_KEYS.SESSION_KEY||event.key===null){setMessage(ko?'로그인 계정이 바뀌었어요. 계정을 확인하고 다시 동의해 주세요.':'Your account changed. Check the account and consent again.');void restore();}};
    void restore();window.addEventListener('storage',changed);
    return()=>{mounted.current=false;generation.current++;window.removeEventListener('storage',changed);};
  },[accountLinkEnabled,ko]);
  if(!accountLinkEnabled)return null;
  async function link(){
    if(!consent||!account||busy||!auth.current)return;
    const request=generation.current,displayedUserId=account.id,client=auth.current;
    setBusy(true);setMessage('');
    try{
      const result=await linkGameAccount({consent,displayedUserId,auth:client,isCurrent:()=>mounted.current&&generation.current===request});
      if(!mounted.current)return;
      if(result.status==='account_changed'||result.status==='account_changed_after_send'){
        setConsent(false);setAccount(null);setRestart(result.status==='account_changed_after_send');
        setMessage(result.status==='account_changed_after_send'?(ko?'요청 중 로그인 상태가 바뀌었어요. 연결이 처리됐을 수 있으니 새 게임으로 이동해 주세요.':'Your account changed during the request. Linking may have completed. Start a new game to continue.'):(ko?'계정이 바뀌어 연결하지 않았어요. 새로고침 후 계정을 확인하고 다시 동의해 주세요.':'Your account changed, so nothing was linked. Refresh, check the account, and consent again.'));
      }
    }catch{if(mounted.current){setConsent(false);setMessage(ko?'연결 결과를 확인하지 못했어요. 다시 시도하기 전에 새로고침해 주세요.':'Could not confirm linking. Refresh before trying again.');}}
    finally{if(mounted.current)setBusy(false);}
  }
  return <section className="account-link">
    <h3>{ko?'게임 기록을 내 계정에 보관하기':'Keep game history in my account'}</h3>
    <p>{ko?'선택 사항이에요. 연결하면 현재 익명 게임 세션의 기록만 아래 계정에 보관되고, 새 익명 게임이 시작돼요. 이전 세션의 기록은 포함되지 않아요.':'This is optional. Linking saves only the current anonymous game session’s history to the account below and starts a new anonymous game. Earlier sessions are not included.'}</p>
    {loading?<p role="status">{ko?'로그인 확인 중…':'Checking sign-in…'}</p>:account?<>
      <p>{ko?'연결할 계정: ':'Account to link: '}{account.email||account.id}</p>
      <label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>{ko?'현재 익명 게임 세션의 기록을 위 계정에 연결하는 데 동의해요.':'I consent to linking the current anonymous game session’s history to the account above.'}</label>
      <button type="button" className="outline" disabled={!consent||busy} onClick={link}>{busy?(ko?'연결 중…':'Linking…'):(ko?'계정에 연결하고 새 게임 시작':'Link account and start a new game')}</button>
    </>:<a href={ko?'/kr?lang=ko':'/us?lang=en'}>{ko?'커뮤니티에서 로그인하기':'Sign in through the community'}</a>}
    {message&&<p role="status">{message}</p>}
    {restart&&<a href={ko?'/beauty-play/?lang=ko':'/beauty-play/?lang=en'}>{ko?'새 게임으로 이동':'Start a new game'}</a>}
  </section>;
}
