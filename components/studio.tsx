'use client';
import {useState,useEffect,useRef,useCallback,FormEvent} from 'react';
import dynamic from 'next/dynamic';
import {ArrowUpRight,ArrowUp,Plus,Download,Mail,Box,ChevronDown,Check,RotateCcw,Settings2,MessageCircle,Sparkles,Bookmark,Upload,X,LoaderCircle,Printer,Layers,CheckCircle2,AlertCircle} from 'lucide-react';
import {Design,tray,initialMessage,validateDesign} from '@/lib/design';
import {binarySTL} from '@/lib/geometry';
import {MeshResult} from './viewer';
const Viewer=dynamic(()=>import('./viewer'),{ssr:false,loading:()=> <div className="viewer-placeholder"><Box/>3Dスタジオを開いています</div>});
type Message={role:'user'|'assistant';content:string};
type Saved={id:string;date:string;design:Design};
function addSavedDesign(entries:Saved[], item:Saved):Saved[]{
 const key=JSON.stringify(item.design);
 if(entries.some(entry=>JSON.stringify(entry.design)===key))return entries;
 return [item,...entries].slice(0,12);
}
function download(name:string,data:BlobPart,type:string){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
export default function Studio(){
 const [previewAvailable,setPreviewAvailable]=useState(false),[creating,setCreating]=useState(false);
 const pendingPreview=useRef(false);
 const restoredDesign=useRef<Design|null>(null);
 const [creationStarted,setCreationStarted]=useState<number|null>(null),[creationElapsed,setCreationElapsed]=useState(0);
 const creationEstimate=useRef(120);
 useEffect(()=>{if(!creating){setCreationStarted(null);return;}if(!creationStarted)return;const update=()=>setCreationElapsed(Math.floor((Date.now()-creationStarted)/1000));update();const timer=setInterval(update,1000);return()=>clearInterval(timer)},[creating,creationStarted]);
 const [design,setDesign]=useState<Design|null>(null),[mesh,setMesh]=useState<MeshResult|null>(null),[busy,setBusy]=useState(false),[generating,setGenerating]=useState(false),[emailBusy,setEmailBusy]=useState(false),[input,setInput]=useState(''),[messages,setMessages]=useState<Message[]>([{role:'assistant',content:initialMessage}]),[error,setError]=useState(''),[toast,setToast]=useState(''),[status,setStatus]=useState({chat:false,email:false,protected:false}),[saved,setSaved]=useState<Saved[]>([]),[history,setHistory]=useState<Array<Design|null>>([]),[tab,setTab]=useState<'chat'|'saved'>('chat'),[workspaceView,setWorkspaceView]=useState<'chat'|'preview'>('chat'),[previewUpdated,setPreviewUpdated]=useState(false),[settings,setSettings]=useState(false),[code,setCode]=useState(''),[showSpecs,setShowSpecs]=useState(false),[ready,setReady]=useState(false);
 const worker=useRef<Worker|null>(null),job=useRef(0),timeout=useRef<ReturnType<typeof setTimeout>|null>(null),chatEnd=useRef<HTMLDivElement|null>(null),previewPanel=useRef<HTMLElement|null>(null),fileInput=useRef<HTMLInputElement|null>(null),abort=useRef<AbortController|null>(null),meshDesign=useRef<Design|null>(null);
 useEffect(()=>{fetch('/api/status').then(r=>r.json()).then(setStatus).catch(()=>{});try{const s=JSON.parse(localStorage.getItem('katachi-saved')||'[]');setSaved(s.slice(0,12));const d=localStorage.getItem('katachi-current');if(d){const restored=validateDesign(JSON.parse(d));const isStarterTray=restored.name===tray.name&&restored.description===tray.description&&JSON.stringify(restored.parts)===JSON.stringify(tray.parts)&&JSON.stringify(restored.notes)===JSON.stringify(tray.notes);if(isStarterTray)localStorage.removeItem('katachi-current');else {restoredDesign.current=restored;setDesign(restored);}}}catch{}setReady(true);return()=>abort.current?.abort()},[]);
 useEffect(()=>{if(!ready)return;try{if(design)localStorage.setItem('katachi-current',JSON.stringify(design));else localStorage.removeItem('katachi-current');localStorage.setItem('katachi-saved',JSON.stringify(saved))}catch{}},[ready,design,saved]);
 useEffect(()=>{chatEnd.current?.scrollIntoView({behavior:'smooth',block:'nearest'})},[messages,generating]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),4500);return()=>clearTimeout(t)},[toast]);
 useEffect(()=>{if(!previewUpdated)return;const t=setTimeout(()=>setPreviewUpdated(false),3000);return()=>clearTimeout(t)},[previewUpdated]);
 useEffect(()=>{if(workspaceView!=='preview'||!previewUpdated)return;const frame=requestAnimationFrame(()=>previewPanel.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}));return()=>cancelAnimationFrame(frame)},[workspaceView,previewUpdated]);
 const generate=useCallback((d:Design|null)=>{
  setError('');setMesh(null);meshDesign.current=null;
  if(!d){worker.current?.terminate();worker.current=null;if(timeout.current)clearTimeout(timeout.current);timeout.current=null;job.current++;setBusy(false);return;}
  setBusy(true);const id=++job.current;
  worker.current?.terminate();if(timeout.current)clearTimeout(timeout.current);
  const w=new Worker(new URL('../lib/worker.ts',import.meta.url));worker.current=w;
  w.onmessage=e=>{if(e.data.id!==job.current)return;if(timeout.current)clearTimeout(timeout.current);setBusy(false);if(e.data.error){pendingPreview.current=false;setCreating(false);setError(e.data.error);}else{setMesh(e.data);meshDesign.current=d;
   if(pendingPreview.current||restoredDesign.current===d){
    restoredDesign.current=null;
    const item={id:crypto.randomUUID(),date:new Date().toISOString(),design:d};
    setSaved(entries=>addSavedDesign(entries,item));
   }
   if(pendingPreview.current){pendingPreview.current=false;setCreating(false);setCreationStarted(start=>{if(start){try{localStorage.setItem('katachi-creation-seconds',String(Math.round((Date.now()-start)/1000)))}catch{}}return null});setPreviewAvailable(true);setWorkspaceView('preview');setPreviewUpdated(true);}}};
  w.onerror=()=>{if(timeout.current)clearTimeout(timeout.current);setBusy(false);setCreating(false);pendingPreview.current=false;setError('3Dデータを作成できませんでした。指示を見直すか、形をシンプルにしてください。');};
  timeout.current=setTimeout(()=>{w.terminate();setBusy(false);setError('形状が複雑で処理に時間がかかっています。パーツを減らしてお試しください。')},45000);
  w.postMessage({id,design:d});
 },[]);
 useEffect(()=>{if(ready)generate(design);return()=>{worker.current?.terminate();if(timeout.current)clearTimeout(timeout.current)}},[ready,design,generate]);
 function change(d:Design){try{const checked=validateDesign(d);setHistory(h=>[...h.slice(-9),design]);setDesign(checked)}catch(e){setError(e instanceof Error?e.message:'データを読み込めませんでした。')}}
 function openDesign(d:Design){if(generating)return;change(d);setMessages([{role:'assistant',content:`「${d.name}」を読み込みました。\nサイズや使い方、文字入れなど、変えたいところを教えてください。`}]);setTab('chat');setPreviewAvailable(true);setWorkspaceView('preview');setPreviewUpdated(true);setToast('デザインを読み込みました');}
 async function send(e?:FormEvent,request?:string){e?.preventDefault();if(!(request||input).trim()||generating)return;const prompt=(request||input).trim(),next=[...messages,{role:'user' as const,content:prompt}];setMessages(next);setInput('');setGenerating(true);if(request){pendingPreview.current=true;setCreating(true);setCreationStarted(Date.now());setCreationElapsed(0);try{const previous=Number(localStorage.getItem('katachi-creation-seconds'));creationEstimate.current=previous>=10&&previous<=325?Math.round(previous):120;}catch{creationEstimate.current=120;}setPreviewAvailable(false);}setError('');const controller=new AbortController();abort.current=controller;
  try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','x-studio-password':code},body:JSON.stringify({messages:next.slice(-24),design,mode:request?'generate':'consult'}),signal:controller.signal});const data=await r.json();if(!r.ok)throw new Error(data.error||'AIと接続できませんでした。');setMessages(m=>[...m,{role:'assistant',content:data.reply}]);if(data.design){change(data.design);}else if(request){pendingPreview.current=false;setCreating(false);}}
  catch(e){if(e instanceof Error&&e.name==='AbortError'){setToast('相談を停止しました');}else{pendingPreview.current=false;setCreating(false);setError(e instanceof Error?e.message:'接続に失敗しました。');setInput(prompt);}}finally{setGenerating(false);abort.current=null;}
 }
 function save(){if(!design)return;const item={id:crypto.randomUUID(),date:new Date().toISOString(),design};setSaved(entries=>addSavedDesign(entries,item));setToast('このブラウザに保存しました');}
 async function email(){if(!design||!mesh||busy||generating||emailBusy||meshDesign.current!==design)return;setEmailBusy(true);setError('');try{const r=await fetch('/api/email',{method:'POST',headers:{'Content-Type':'application/json','x-studio-password':code},body:JSON.stringify({design})});const data=await r.json();if(!r.ok)throw new Error(data.error||'送信に失敗しました');setToast('Resendがメール送信を受け付けました。受信箱をご確認ください。')}catch(e){setError(e instanceof Error?e.message:'送信に失敗しました。')}finally{setEmailBusy(false)}}
 const enabled=!!mesh&&!busy&&!generating;
 return <div className="studio-shell">
 <header className="header"><a className="brand" href="/" aria-label="長谷川が作るよ ホーム"><span className="brand-icon"><Box size={24} strokeWidth={1.6}/></span>長谷川が作るよ</a><div className="header-right"><nav className="workspace-tabs" role="tablist" aria-label="表示を切り替え"><button id="workspace-tab-chat" className="workspace-tab" type="button" role="tab" aria-selected={workspaceView==='chat'} aria-controls="workspace-panel-chat" data-view="chat" onClick={()=>setWorkspaceView('chat')}><MessageCircle size={16}/>相談</button>{previewAvailable&&<button id="workspace-tab-preview" className="workspace-tab" type="button" role="tab" aria-selected={workspaceView==='preview'} aria-controls="workspace-panel-preview" data-view="preview" onClick={()=>setWorkspaceView('preview')}><Box size={16}/>プレビュー{previewUpdated&&<span className="tab-update-indicator">更新</span>}</button>}</nav><button className="icon-button" aria-label="設定を開く" onClick={()=>setSettings(true)}><Settings2 size={19}/></button></div></header>
 <main>
  {workspaceView==='preview'&&<div className="progress-guide"><div><b>形とサイズを確認してください</b><p>変更したいところがあれば、相談に戻って作り直せます。</p></div><button className="primary" onClick={()=>setWorkspaceView('chat')}>修正を相談する<ArrowUpRight size={16}/></button></div>}
  <div className="workspace">
   {workspaceView==='chat'&&<aside id="workspace-panel-chat" className="chat-panel" role="tabpanel" aria-labelledby="workspace-tab-chat">
    <div className="panel-tabs"><button className={tab==='chat'?'active':''} onClick={()=>setTab('chat')}><MessageCircle size={16}/>相談する</button><button className={tab==='saved'?'active':''} onClick={()=>setTab('saved')}><Bookmark size={16}/>保存したもの {saved.length>0&&<small>{saved.length}</small>}</button></div>
    {tab==='chat'?<><div className="chat-heading"><span className="assistant-avatar"><Sparkles size={19}/></span><div><b>デザインパートナー</b><small>GPT-6 Luna <span>MAX</span></small></div><button className="icon-button" aria-label="新しい相談を始める" disabled={generating} onClick={()=>{setMessages([{role:'assistant',content:initialMessage}]);setInput('');setError('')}}><Plus size={19}/></button></div>
    <div className="messages" aria-live="polite">{messages.map((m,i)=><div className={`message ${m.role}`} key={i}>{m.role==='assistant'&&<span className="mini-mark">k.</span>}<div><small>{m.role==='user'?'あなた':'Katachi'}</small><p>{m.content}</p></div></div>)}{messages.length===1&&<div className="starter-prompts"><p>たとえば</p>{['スマホスタンドを作りたい','充電ケーブルをまとめたい','鍵と小物を置くトレーがほしい'].map(s=><button key={s} onClick={()=>setInput(s)}>{s}<ArrowUpRight size={14}/></button>)}</div>}{generating&&<div className="thinking"><LoaderCircle size={16} className="spin"/>使いやすさと形を考えています…<button onClick={()=>abort.current?.abort()}>停止</button></div>}<div ref={chatEnd}/></div>
    <form className="composer" onSubmit={send}><label className="sr-only" htmlFor="prompt">つくりたいものや変更点</label><textarea id="prompt" value={input} onChange={e=>setInput(e.target.value)} maxLength={5000} placeholder="つくりたいもの、変えたいところを教えてください" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send()}}}/><div className="composer-bottom"><small>Enterで送信 · Shift+Enterで改行</small><button type="submit" aria-label="相談を送信" disabled={!input.trim()||generating}>{generating?<LoaderCircle size={19} className="spin"/>:<ArrowUp size={20}/>}</button></div></form>
    <div style={{margin:"10px 18px 0",flexShrink:0}}>
     <button className="primary" style={{width:"100%",minHeight:44}} disabled={generating||busy||creating||messages.length<2} onClick={()=>void send(undefined,'ここまでの相談内容で3D設計データを作成してください。不明な寸法は妥当な仮案とし、その値を説明してください。')}>{creating?'作成中…':'この内容で作る'}<ArrowUpRight size={16}/></button>
     {creating&&<p role="timer" style={{fontSize:11,margin:"6px 0 0"}}>{creating?(creationElapsed<creationEstimate.current?'あと約'+(creationEstimate.current-creationElapsed)+'秒（目安）':'目安より時間がかかっています。そのままお待ちください。')+' ・ 経過 '+creationElapsed+'秒。'+(busy?'3Dの形状を処理しています。':'AIが設計しています。'):null}</p>}
    </div>
    <div className="chat-footnote"><span className={status.chat?'connected-dot':'pending-dot'}/>{status.chat?'A1 miniに合わせて設計します':'AI接続準備中'}</div></>:<div className="saved-list"><h3>保存したデザイン</h3>{!saved.length&&<div className="empty-saved"><Bookmark size={30}/><p>気に入ったかたちは<br/>「保存する」で残せます。</p></div>}{saved.map(s=><button key={s.id} onClick={()=>{openDesign(s.design)}}><Box size={20}/><span><b>{s.design.name}</b><small>{new Date(s.date).toLocaleDateString('ja-JP')}</small></span><ArrowUpRight size={16}/></button>)}<button className="import-button" onClick={()=>fileInput.current?.click()}><Upload size={16}/>プロジェクトを読み込む</button></div>}
   </aside>}
   {previewAvailable&&workspaceView==='preview'&&<section ref={previewPanel} id="workspace-panel-preview" className={`design-panel${previewUpdated?' preview-updated':''}`} role="tabpanel" aria-labelledby="workspace-tab-preview" aria-label="モデルとデータ">
    <div className="design-title"><div><span className="section-kicker">YOUR DESIGN</span><h2>{design?.name??'新しいデザイン'}</h2></div>{previewUpdated&&<span className="preview-notice" role="status"><CheckCircle2 size={15}/>更新しました</span>}<button className="text-button" disabled={generating||!history.length} onClick={()=>{const prev=history.at(-1);if(prev!==undefined){setDesign(prev);setHistory(h=>h.slice(0,-1))}}}><RotateCcw size={15}/>ひとつ戻す</button></div>
    <Viewer data={mesh} busy={busy}/>
    <div className="details-row"><div className="dimensions"><span>できあがりサイズ</span><strong>{mesh?mesh.dimensions.map(d=>d.toFixed(1).replace('.0','')).join(' × '):'— × — × —'}<small>mm</small></strong><span>幅 × 奥行 × 高さ</span></div><div className="print-fit"><span className={mesh?'fit-check':'fit-pending'}>{mesh?<CheckCircle2 size={16}/>:<Layers size={16}/>}</span><div><b>{mesh?'A1 miniの範囲内':design?'形状を確認中':'チャットで作成'}</b><span>180 × 180 × 180 mm</span></div></div><button className="specs-button" disabled={!design} aria-expanded={showSpecs} onClick={()=>setShowSpecs(v=>!v)}>設計メモ<ChevronDown size={15} className={showSpecs?'flip':''}/></button></div>
    {showSpecs&&design&&<div className="specs"><p>{design.description}</p><ul>{design.notes.map((n,i)=><li key={i}>{n}</li>)}</ul><p className="muted">0.4 mmノズル · 積層0.2 mm · テクスチャPEI · eSUN PLA+<br/>造形範囲の確認済みでも、強度・サポート・文字・初層はスライスと実機で確認してください。</p></div>}
    <div className="receive"><div><span className="section-kicker">データ</span><h3>完成データを受け取る</h3><p>STLを保存するか、メールで依頼できます。</p></div><div className="receive-actions"><button className="secondary" disabled={!enabled} onClick={()=>{if(mesh)download('katachi-model.stl',binarySTL(mesh.positions) as BlobPart,'application/octet-stream')}}><Download size={17}/>STLを保存</button><button className="primary" disabled={!enabled||emailBusy} onClick={email}>{emailBusy?<LoaderCircle className="spin" size={17}/>:<Mail size={17}/>}長谷川に依頼<ArrowUpRight size={16}/></button></div></div>
    <div className="export-footer"><span>s.hasegawa1130@gmail.com に送信 · STL＋編集用データ</span><button disabled={!enabled||!design} onClick={()=>{if(!design)return;save();download('project.katachi.json',JSON.stringify(design,null,2),'application/json')}}><Bookmark size={14}/>保存する</button></div>
    {error&&<div role="alert" className="error-banner"><AlertCircle size={17}/><p>{error}</p><button aria-label="エラーを閉じる" onClick={()=>setError('')}><X size={16}/></button></div>}
   </section>}
  </div>
 </main>
 <footer className="footer"><span className="footer-brand">katachi.</span><span>Bambu Lab A1 mini <Printer size={14}/></span></footer>
 <input type="file" ref={fileInput} accept=".json" className="hidden" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>100000){setError('プロジェクトファイルが大きすぎます。');return;}try{change(validateDesign(JSON.parse(await file.text())));setTab('chat');setPreviewAvailable(true);setWorkspaceView('preview');setPreviewUpdated(true);setToast('プロジェクトを読み込みました')}catch{setError('KatachiのプロジェクトJSONを選んでください。')}e.target.value=''}}/>
 {toast&&<div className="toast" role="status"><Check size={17}/>{toast}</div>}
  {settings&&<div className="modal-backdrop" onClick={()=>setSettings(false)}><section className="settings-modal" role="dialog" aria-modal="true" aria-label="スタジオ設定" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="設定を閉じる" onClick={()=>setSettings(false)}><X size={20}/></button><div className="eyebrow">YOUR WORKSHOP</div><h2>いつものプリンターで。</h2><dl><dt>プリンター</dt><dd>Bambu Lab A1 mini</dd><dt>材料</dt><dd>eSUN PLA+ / 外部スプール</dd><dt>ノズル・積層</dt><dd>0.4 mm / 0.2 mm</dd><dt>AI</dt><dd>GPT-6 Luna / MAX</dd><dt>メール送信</dt><dd>{status.email?'接続済み':'接続準備中'}</dd></dl>{status.protected&&<label className="code-label">アクセスコード<input type="password" autoComplete="current-password" value={code} onChange={e=>setCode(e.target.value)} placeholder="管理者の設定したコード"/></label>}<p>会話はAIに送信されます。保存したデザインはこのブラウザ内に残ります。メールは「長谷川に依頼」を押したときだけ送信します。</p><button className="primary" onClick={()=>setSettings(false)}>閉じる</button></section></div>}
 </div>
}
