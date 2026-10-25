'use client';
import {createContext,useContext,useEffect,useState,Children,isValidElement,cloneElement,type ReactNode,type ReactElement} from 'react';
import dictionaries from './translations.json';
import {initialLanguage,resolveVisitorLanguage,rememberLanguage} from '../../dist/language-preference.js';
export type Language='ko'|'en';
const LanguageContext=createContext<{lang:Language;setLanguage:(lang:Language)=>void}>({lang:'ko',setLanguage:()=>{}});
const entries={ko:Object.entries(dictionaries.ko).sort((a,b)=>b[0].length-a[0].length),en:Object.entries(dictionaries.en).sort((a,b)=>b[0].length-a[0].length)};
// Exact-match names that arrive with data loaded at runtime (catalog brands); never used for partial replacement.
export function addTranslations(lang:Language,names:Record<string,string>){Object.assign(dictionaries[lang] as Record<string,string>,names);}
export function translate(text:string,lang:Language){
 const direct=(dictionaries[lang] as Record<string,string>)[text];if(direct)return direct;
 if(lang==='en'){
  let m=text.match(/^(\d+)명 중 (\d+)명이 너와 같은 선택!$/);if(m)return `${m[2]} of ${m[1]} people picked your product!`;
  m=text.match(/^(\d+)명의 사용 경험 응답$/);if(m)return `${m[1]} responses from people who tried it`;
 }
 const rows=entries[lang];let result='',i=0;while(i<text.length){const row=rows.find(([key])=>text.startsWith(key,i));if(row){result+=row[1];i+=row[0].length;}else{result+=text[i];i++;}}
 return lang==='en'?result.replace(/(\d+)건/g,'$1 responses').replace(/명/g,' people'):result;
}
export function LanguageProvider({children}:{children:ReactNode}){
 const [lang,setLang]=useState<Language>(()=>(initialLanguage()||'en') as Language);
 const [ready,setReady]=useState(false);
 useEffect(()=>{let active=true;resolveVisitorLanguage().then(value=>{if(active){setLang(value as Language);setReady(true);}});return()=>{active=false;};},[]);
 useEffect(()=>{document.documentElement.lang=lang;const path=location.pathname;document.title=path==='/play'?(lang==='ko'?'뷰티뷰티 — 뷰티 놀이터':'Beauty Beauty — Beauty Playground'):path==='/community'?(lang==='ko'?'서울뷰티 연결 체험 — 뷰티뷰티':'Seoul Beauty Journey — Beauty Beauty'):path==='/plan'?'Beauty Beauty — CX & PRD':path==='/ops'?(lang==='ko'?'뷰티뷰티 — 운영 현황':'Beauty Beauty — Operations'):(lang==='ko'?'언니가 골라줄게 · Seoul Beauty':'Let Me Pick · Seoul Beauty');},[lang]);
 function setLanguage(value:Language){setLang(value);rememberLanguage(value);const u=new URL(location.href);u.searchParams.set('lang',value);history.replaceState(null,'',u);}
 if(!ready)return null;
 return <LanguageContext.Provider value={{lang,setLanguage}}>{children}</LanguageContext.Provider>;
}
export const useLanguage=()=>useContext(LanguageContext);
// Both languages are shown and the current one is filled, so the label never reads as the target language.
export function LanguageSwitch(){const {lang,setLanguage}=useLanguage();return <div className="language-switch" role="group" aria-label="Language / 언어">{(['ko','en'] as const).map(l=><button key={l} type="button" aria-pressed={lang===l} className={lang===l?'active':''} onClick={()=>{if(lang!==l)setLanguage(l);}} aria-label={l==='ko'?'한국어':'English'}>{l.toUpperCase()}</button>)}</div>}
function localize(node:ReactNode,lang:Language):ReactNode{return Children.map(node,child=>{if(typeof child==='string')return translate(child,lang);if(!isValidElement(child))return child;const el=child as ReactElement<Record<string,unknown>>;const props:Record<string,unknown>={};for(const key of ['alt','title','aria-label','aria-roledescription','placeholder'])if(typeof el.props[key]==='string')props[key]=translate(el.props[key] as string,lang);if(typeof el.props.href==='string'&&el.props.href.startsWith('/')&&!el.props.href.startsWith('//')){const [path,query]=el.props.href.split('?');const params=new URLSearchParams(query);params.set('lang',lang);props.href=path+'?'+params.toString();}if(el.props.children!==undefined)props.children=localize(el.props.children as ReactNode,lang);return cloneElement(el,props);});}
export function LocaleView({children}:{children:ReactNode}){const {lang}=useLanguage();return <>{localize(children,lang)}</>}
