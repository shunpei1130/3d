'use client';
import {useState,useEffect,useRef,useCallback,type FormEvent} from 'react';
import dynamic from 'next/dynamic';
import {ArrowUpRight,ArrowUp,Plus,Download,Mail,Box,ChevronDown,Check,RotateCcw,Settings2,MessageCircle,Sparkles,Bookmark,Upload,X,LoaderCircle,Printer,CheckCircle2,AlertCircle} from 'lucide-react';
import {type Design,tray,initialMessage,validateDesign} from '@/lib/design';
import {binarySTL} from '@/lib/geometry';
import type {MeshResult} from './viewer';
const Viewer=dynamic(()=>import('./viewer'),{ssr:false,loading:()=> <div className="viewer-placeholder"><Box/>3Dスタジオを開いています</div>});
type Message={role:'user'|'assistant';content:string};
type Saved={id:string;date:string;design:Design};
type Preview={design:Design;mesh:MeshResult;creationSeconds?:number};
type Activity=
 | {kind:'consult'|'load'}
 | {kind:'create';stage:'design'|'mesh';startedAt:number};

const creationPrompt='ここまでの相談内容で3D設計データを作成してください。不明な寸法は妥当な仮案とし、その値を説明してください。';

function addSavedDesign(entries:Saved[], item:Saved):Saved[]{
 const key=JSON.stringify(item.design);
 if(entries.some(entry=>JSON.stringify(entry.design)===key))return entries;
 return [item,...entries].slice(0,12);
}

function buildMesh(design:Design, signal:AbortSignal):Promise<MeshResult>{
 return new Promise((resolve,reject)=>{
  signal.throwIfAborted();
  const worker=new Worker(new URL('../lib/worker.ts',import.meta.url));
  const timer=setTimeout(()=>fail(new Error('3D変換が制限時間内に終わりませんでした。パーツを減らして、もう一度お試しください。')),45000);

  function cleanup(){
   clearTimeout(timer);
   signal.removeEventListener('abort',cancel);
   worker.terminate();
  }
  function fail(error:unknown){
   cleanup();
   reject(error);
  }
  function cancel(){fail(signal.reason);}

  signal.addEventListener('abort',cancel,{once:true});
  worker.onmessage=(event:MessageEvent<MeshResult|{error:string}>)=>{
   if('error' in event.data){
    fail(new Error(event.data.error));
    return;
   }
   cleanup();
   resolve(event.data);
  };
  const failWorker=()=>fail(new Error('3Dモデルに変換できませんでした。ページを開き直して、もう一度お試しください。'));
  worker.onerror=failWorker;
  worker.onmessageerror=failWorker;
  try{worker.postMessage({design});}catch{failWorker();}
 });
}

function formatDuration(seconds:number){
 return seconds<60?`${seconds}秒`:`${Math.floor(seconds/60)}分${seconds%60}秒`;
}

function download(name:string,data:BlobPart,type:string){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export default function Studio(){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [activity,setActivity]=useState<Activity|null>(null);
 const [creationElapsed,setCreationElapsed]=useState(0);
 const [ready,setReady]=useState(false);
 const [emailBusy,setEmailBusy]=useState(false);
 const [input,setInput]=useState('');
 const [messages,setMessages]=useState<Message[]>([{role:'assistant',content:initialMessage}]);
 const [error,setError]=useState('');
 const [toast,setToast]=useState('');
 const [status,setStatus]=useState({chat:false,email:false,protected:false});
 const [saved,setSaved]=useState<Saved[]>([]);
 const [history,setHistory]=useState<Array<Design|null>>([]);
 const [tab,setTab]=useState<'chat'|'saved'>('chat');
 const [workspaceView,setWorkspaceView]=useState<'chat'|'preview'>('chat');
 const [settings,setSettings]=useState(false);
 const [code,setCode]=useState('');
 const [showSpecs,setShowSpecs]=useState(false);
 const active=useRef<AbortController|null>(null);
 const chatEnd=useRef<HTMLDivElement|null>(null);
 const previewPanel=useRef<HTMLElement|null>(null);
 const fileInput=useRef<HTMLInputElement|null>(null);

 const design=preview?.design??null;
 const creating=activity?.kind==='create'?activity:null;
 const consulting=activity?.kind==='consult';
 const loading=activity?.kind==='load';
 const working=!ready||activity!==null;
 const startedAt=creating?.startedAt;

 const remember=useCallback((d:Design)=>{
  const date=new Date().toISOString();
  const id=globalThis.crypto?.randomUUID?.()??`${date}-${Math.random().toString(36).slice(2)}`;
  setSaved(entries=>addSavedDesign(entries,{id,date,design:d}));
 },[]);

 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/status',{signal:controller.signal}).then(r=>r.json()).then(setStatus).catch(()=>{});
  try{
   const entries=JSON.parse(localStorage.getItem('katachi-saved')||'[]');
   if(Array.isArray(entries))setSaved(entries.slice(0,12));
  }catch{}

  async function restore(){
   try{
    let stored:string|null=null;
    try{stored=localStorage.getItem('katachi-current');}catch{}
    if(!stored)return;
    const d=validateDesign(JSON.parse(stored));
    const isStarterTray=d.name===tray.name&&d.description===tray.description&&JSON.stringify(d.parts)===JSON.stringify(tray.parts)&&JSON.stringify(d.notes)===JSON.stringify(tray.notes);
    if(isStarterTray){
     localStorage.removeItem('katachi-current');
     return;
    }
    setActivity({kind:'load'});
    const mesh=await buildMesh(d,controller.signal);
    controller.signal.throwIfAborted();
    setPreview({design:d,mesh});
    setWorkspaceView('preview');
    remember(d);
   }catch{
    if(!controller.signal.aborted)setError('前回のデザインを開けませんでした。「保存したもの」から開き直してください。');
   }finally{
    if(!controller.signal.aborted){
     setActivity(null);
     setReady(true);
    }
   }
  }
  void restore();
  return()=>{
   controller.abort();
   active.current?.abort();
   active.current=null;
  };
 },[remember]);

 useEffect(()=>{
  if(!design)return;
  try{localStorage.setItem('katachi-current',JSON.stringify(design));}catch{}
 },[design]);
 useEffect(()=>{
  if(!ready)return;
  try{localStorage.setItem('katachi-saved',JSON.stringify(saved));}catch{}
 },[ready,saved]);
 useEffect(()=>{
  if(startedAt===undefined)return;
  const update=()=>setCreationElapsed(Math.floor((performance.now()-startedAt)/1000));
  update();
  const timer=setInterval(update,1000);
  return()=>clearInterval(timer);
 },[startedAt]);
 useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth',block:'nearest'})},[messages,consulting]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(t)},[toast]);
 useEffect(()=>{
  if(workspaceView!=='preview'||!design)return;
  const panel=previewPanel.current;
  panel?.focus({preventScroll:true});
  panel?.scrollIntoView({block:'start'});
 },[workspaceView,design]);

 function startWork(next:Activity){
  if(!ready||active.current)return null;
  const controller=new AbortController();
  active.current=controller;
  setError('');
  setActivity(next);
  return controller;
 }
 function finishWork(controller:AbortController){
  if(active.current!==controller)return;
  active.current=null;
  setActivity(null);
 }

 async function send(e?:FormEvent,create=false){
  e?.preventDefault();
  const prompt=create?creationPrompt:input.trim();
  if(!prompt||(create&&messages.length<2))return;
  const startedAt=performance.now();
  const controller=startWork(create?{kind:'create',stage:'design',startedAt}:{kind:'consult'});
  if(!controller)return;
  const next:Message[]=[...messages,{role:'user',content:prompt}];
  if(create)setCreationElapsed(0);
  else{
   setMessages(next);
   setInput('');
  }

  try{
   const response=await fetch('/api/chat',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-studio-password':code},
    body:JSON.stringify({messages:next.slice(-24),design,mode:create?'generate':'consult'}),
    signal:controller.signal
   });
   const data=await response.json().catch(()=>null);
   controller.signal.throwIfAborted();
   if(!response.ok){
    throw new Error(response.status===504
     ? 'AIの設計が制限時間内に終わりませんでした。指示を短くして、もう一度お試しください。'
     : data?.error||'AIと接続できませんでした。もう一度お試しください。');
   }
   if(typeof data?.reply!=='string')throw new Error('AIの返答を読み込めませんでした。もう一度お試しください。');
   setMessages(m=>[...m,{role:'assistant',content:data.reply}]);
   if(!create)return;
   if(!data.design)throw new Error('3Dモデルを作成できませんでした。相談の返答をご確認ください。');

   setActivity({kind:'create',stage:'mesh',startedAt});
   const d=validateDesign(data.design);
   const mesh=await buildMesh(d,controller.signal);
   controller.signal.throwIfAborted();
   const creationSeconds=Math.floor((performance.now()-startedAt)/1000);
   setHistory(h=>[...h.slice(-9),design]);
   setPreview({design:d,mesh,creationSeconds});
   remember(d);
   setTab('chat');
   setWorkspaceView('preview');
  }catch(e){
   if(active.current!==controller)return;
   if(controller.signal.aborted)setToast(create?'作成を停止しました':'相談を停止しました');
   else{
    setError(e instanceof Error?e.message:'接続に失敗しました。');
    if(!create)setInput(current=>current||prompt);
   }
  }finally{
   finishWork(controller);
  }
 }

 async function loadDesign(candidate:Design,source:'saved'|'import'|'undo'){
  const controller=startWork({kind:'load'});
  if(!controller)return;
  try{
   const d=validateDesign(candidate);
   const mesh=await buildMesh(d,controller.signal);
   controller.signal.throwIfAborted();
   setPreview({design:d,mesh});
   if(source==='undo'){
    setHistory(h=>h.slice(0,-1));
    return;
   }
   setHistory(h=>[...h.slice(-9),design]);
   if(source==='saved'){
    setMessages([{role:'assistant',content:`「${d.name}」を読み込みました。\nサイズや使い方、文字入れなど、変えたいところを教えてください。`}]);
   }
   setTab('chat');
   setWorkspaceView('preview');
   setToast(source==='saved'?'デザインを読み込みました':'プロジェクトを読み込みました');
  }catch(e){
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:'デザインを読み込めませんでした。');
  }finally{
   finishWork(controller);
  }
 }

 function undo(){
  if(working||!history.length)return;
  const previous=history[history.length-1];
  if(previous){
   void loadDesign(previous,'undo');
   return;
  }
  setPreview(null);
  setHistory(h=>h.slice(0,-1));
  setError('');
  setWorkspaceView('chat');
  try{localStorage.removeItem('katachi-current');}catch{}
 }

 async function importProject(file:File){
  if(working)return;
  if(file.size>100000){
   setError('プロジェクトファイルが大きすぎます。');
   return;
  }
  try{
   const d=validateDesign(JSON.parse(await file.text()));
   await loadDesign(d,'import');
  }catch{
   setError('KatachiのプロジェクトJSONを選んでください。');
  }
 }

 async function email(){
  if(!design||working||emailBusy)return;
  setEmailBusy(true);
  setError('');
  try{
   const response=await fetch('/api/email',{method:'POST',headers:{'Content-Type':'application/json','x-studio-password':code},body:JSON.stringify({design})});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||'送信に失敗しました');
   setToast('Resendがメール送信を受け付けました。受信箱をご確認ください。');
  }catch(e){
   setError(e instanceof Error?e.message:'送信に失敗しました。');
  }finally{
   setEmailBusy(false);
  }
 }

 const errorBanner=error&&<div role="alert" className="error-banner"><AlertCircle size={17}/><p>{error}</p><button aria-label="エラーを閉じる" onClick={()=>setError('')}><X size={16}/></button></div>;
 const creationStatus=creating&&<div className="creation-status">
  <span className="creation-stage" role="status"><LoaderCircle size={16} className="spin" aria-hidden="true"/>{creating.stage==='design'?'AIが設計データを作成中':'3Dモデルを組み立て中'}</span>
  <span className="creation-elapsed" role="timer">経過 {formatDuration(creationElapsed)}</span>
  <button type="button" onClick={()=>active.current?.abort()}>停止</button>
 </div>;
 return <div className="studio-shell">
 <header className="header"><a className="brand" href="/" aria-label="長谷川が作るよ ホーム"><span className="brand-icon"><Box size={24} strokeWidth={1.6}/></span>長谷川が作るよ</a><div className="header-right"><nav className="workspace-tabs" role="tablist" aria-label="表示を切り替え"><button id="workspace-tab-chat" className="workspace-tab" type="button" role="tab" aria-selected={workspaceView==='chat'} aria-controls="workspace-panel-chat" data-view="chat" onClick={()=>setWorkspaceView('chat')}><MessageCircle size={16}/>相談</button>{preview&&<button id="workspace-tab-preview" className="workspace-tab" type="button" role="tab" aria-selected={workspaceView==='preview'} aria-controls="workspace-panel-preview" data-view="preview" onClick={()=>setWorkspaceView('preview')}><Box size={16}/>プレビュー</button>}</nav><button className="icon-button" aria-label="設定を開く" onClick={()=>setSettings(true)}><Settings2 size={19}/></button></div></header>
 <main>
  <div className="workspace">
   {workspaceView==='chat'&&<aside id="workspace-panel-chat" className="chat-panel" role="tabpanel" aria-labelledby="workspace-tab-chat">
    <div className="panel-tabs"><button className={tab==='chat'?'active':''} onClick={()=>setTab('chat')}><MessageCircle size={16}/>相談する</button><button className={tab==='saved'?'active':''} onClick={()=>setTab('saved')}><Bookmark size={16}/>保存したもの {saved.length>0&&<small>{saved.length}</small>}</button></div>
     {tab==='chat'?<><div className="chat-heading"><span className="assistant-avatar"><Sparkles size={19}/></span><div><b>デザインパートナー</b><small>GPT-6 Luna <span>MAX</span></small></div><button className="icon-button" aria-label="新しい相談を始める" disabled={working} onClick={()=>{setMessages([{role:'assistant',content:initialMessage}]);setInput('');setError('')}}><Plus size={19}/></button></div>
     <div className="messages" aria-live="polite">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}>{m.role==='assistant'&&<span className="mini-mark">k.</span>}<div><small>{m.role==='user'?'あなた':'Katachi'}</small><p>{m.content}</p></div></div>)}{messages.length===1&&<div className="starter-prompts"><p>たとえば</p>{['スマホスタンドを作りたい','充電ケーブルをまとめたい','鍵と小物を置くトレーがほしい'].map(s=><button key={s} onClick={()=>setInput(s)}>{s}<ArrowUpRight size={14}/></button>)}</div>}{consulting&&<div className="thinking"><LoaderCircle size={16} className="spin"/>使いやすさと形を考えています…<button onClick={()=>active.current?.abort()}>停止</button></div>}<div ref={chatEnd}/></div>
     <form className="composer" onSubmit={send}><label className="sr-only" htmlFor="prompt">つくりたいものや変更点</label><textarea id="prompt" value={input} onChange={e=>setInput(e.target.value)} maxLength={5000} placeholder="つくりたいもの、変えたいところを教えてください" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><div className="composer-bottom"><small>Enterで送信 · Shift+Enterで改行</small><button type="submit" aria-label="相談を送信" disabled={!input.trim()||working}>{consulting?<LoaderCircle size={19} className="spin"/>:<ArrowUp size={20}/>}</button></div></form>
     <div className="create-action">
      <button className="primary" type="button" disabled={working||messages.length<2} onClick={()=>void send(undefined,true)}>{creating?'作成中…':'この内容で作る'}<ArrowUpRight size={16}/></button>
      {creationStatus}
      {loading&&<p className="loading-note" role="status">3Dモデルを読み込んでいます…</p>}
      {errorBanner}
    </div>
     <div className="chat-footnote"><span className={status.chat?'connected-dot':'pending-dot'}/>{status.chat?'A1 miniに合わせて設計します':'AI接続準備中'}</div></>:<div className="saved-list">
      <h3>保存したデザイン</h3>
      {creationStatus}
      {loading&&<p role="status">3Dモデルを読み込んでいます…</p>}
      {errorBanner}
      {!saved.length&&<div className="empty-saved"><Bookmark size={30}/><p>作成したデザインは<br/>ここから開き直せます。</p></div>}
      {saved.map(s=><button key={s.id} disabled={working} onClick={()=>void loadDesign(s.design,'saved')}><Box size={20}/><span><b>{s.design.name}</b><small>{new Date(s.date).toLocaleDateString('ja-JP')}</small></span><ArrowUpRight size={16}/></button>)}
      <button className="import-button" disabled={working} onClick={()=>fileInput.current?.click()}><Upload size={16}/>プロジェクトを読み込む</button>
     </div>}
   </aside>}
    {workspaceView==='preview'&&preview&&<section ref={previewPanel} id="workspace-panel-preview" className="design-panel" role="tabpanel" aria-labelledby="workspace-tab-preview" aria-describedby={preview.creationSeconds!==undefined?'creation-complete':undefined} tabIndex={-1}>
     {creationStatus}
     <div className="progress-guide">
      {preview.creationSeconds!==undefined
       ? <div id="creation-complete" role="status"><b className="creation-complete"><CheckCircle2 size={17} aria-hidden="true"/>3Dモデルが完成しました</b><p>作成時間 {preview.creationSeconds===0?'1秒未満':formatDuration(preview.creationSeconds)}</p></div>
       : <b>形とサイズを確認してください</b>}
      <button className="primary" onClick={()=>setWorkspaceView('chat')}>修正を相談する<ArrowUpRight size={16}/></button>
     </div>
     {errorBanner}
     <div className="design-title"><div><span className="section-kicker">YOUR DESIGN</span><h2>{preview.design.name}</h2></div><button className="text-button" disabled={working||!history.length} onClick={undo}><RotateCcw size={15}/>ひとつ戻す</button></div>
     <Viewer data={preview.mesh} busy={loading}/>
     <div className="details-row"><div className="dimensions"><span>できあがりサイズ</span><strong>{preview.mesh.dimensions.map(d=>d.toFixed(1).replace('.0','')).join(' × ')}<small>mm</small></strong><span>幅 × 奥行 × 高さ</span></div><div className="print-fit"><span className="fit-check"><CheckCircle2 size={16}/></span><div><b>A1 miniの範囲内</b><span>180 × 180 × 180 mm</span></div></div><button className="specs-button" aria-expanded={showSpecs} onClick={()=>setShowSpecs(v=>!v)}>設計メモ<ChevronDown size={15} className={showSpecs?'flip':''}/></button></div>
     {showSpecs&&<div className="specs"><p>{preview.design.description}</p><ul>{preview.design.notes.map((n,i)=><li key={i}>{n}</li>)}</ul><p className="muted">0.4 mmノズル · 積層0.2 mm · テクスチャPEI · eSUN PLA+<br/>造形範囲の確認済みでも、強度・サポート・文字・初層はスライスと実機で確認してください。</p></div>}
     <div className="receive"><div><span className="section-kicker">データ</span><h3>完成データを受け取る</h3><p>STLを保存するか、メールで依頼できます。</p></div><div className="receive-actions"><button className="secondary" disabled={working} onClick={()=>download('katachi-model.stl',binarySTL(preview.mesh.positions) as BlobPart,'application/octet-stream')}><Download size={17}/>STLを保存</button><button className="primary" disabled={working||emailBusy} onClick={email}>{emailBusy?<LoaderCircle className="spin" size={17}/>:<Mail size={17}/>}長谷川に依頼<ArrowUpRight size={16}/></button></div></div>
     <div className="export-footer"><span>s.hasegawa1130@gmail.com に送信 · STL＋編集用データ</span><button disabled={working} onClick={()=>{remember(preview.design);setToast('このブラウザに保存しました');download('project.katachi.json',JSON.stringify(preview.design,null,2),'application/json')}}><Bookmark size={14}/>保存する</button></div>
   </section>}
  </div>
 </main>
 <footer className="footer"><span className="footer-brand">katachi.</span><span>Bambu Lab A1 mini <Printer size={14}/></span></footer>
 <input type="file" ref={fileInput} accept=".json" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importProject(file)}}/>
 {toast&&<div className="toast" role="status"><Check size={17}/>{toast}</div>}
  {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-label="スタジオ設定" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="設定を閉じる" onClick={()=>setSettings(false)}><X size={20}/></button><div className="eyebrow">YOUR WORKSHOP</div><h2>いつものプリンターで。</h2><dl><dt>プリンター</dt><dd>Bambu Lab A1 mini</dd><dt>材料</dt><dd>eSUN PLA+ / 外部スプール</dd><dt>ノズル・積層</dt><dd>0.4 mm / 0.2 mm</dd><dt>AI</dt><dd>GPT-6 Luna / MAX</dd><dt>メール送信</dt><dd>{status.email?'接続済み':'接続準備中'}</dd></dl>{status.protected&&<label className="code-label">アクセスコード<input type="password" autoComplete="current-password" value={code} onChange={e=>setCode(e.target.value)} placeholder="管理者の設定したコード"/></label>}<p>会話はAIに送信されます。保存したデザインはこのブラウザ内に残ります。メールは「長谷川に依頼」を押したときだけ送信します。</p><button className="primary" onClick={()=>setSettings(false)}>閉じる</button></section></div>}
 </div>
}
