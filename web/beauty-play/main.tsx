import React from 'react';import {createRoot} from 'react-dom/client';import Home from './page';import Landing from './landing';import {LanguageProvider} from './locale';import './game.css';
// Route this game’s calls through its bounded same-origin adapter. No Seoul Beauty auth cookies are forwarded.
const originalFetch=window.fetch.bind(window);window.fetch=(input,init)=>originalFetch(typeof input==='string'&&input.startsWith('/api/')?'/beauty-play'+input:input,init);
const replace=history.replaceState.bind(history);history.replaceState=(state,unused,url)=>replace(state,unused,typeof url==='string'&&url.startsWith('/?')?'/beauty-play'+url:url);
const q=new URLSearchParams(location.search),playing=q.has('character')||q.has('invite');createRoot(document.getElementById('root')!).render(<LanguageProvider>{playing?<Home/>:<Landing/>}</LanguageProvider>);
