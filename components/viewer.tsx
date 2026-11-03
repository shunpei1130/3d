'use client';
import {Canvas,useThree} from '@react-three/fiber';
import {OrbitControls,ContactShadows,Grid,RoundedBox,Html,Line} from '@react-three/drei';
import {useEffect,useMemo,useRef,useState,Component,ReactNode} from 'react';
import * as THREE from 'three';
import {IPHONE} from '@/lib/design';
import {RotateCcw,Smartphone,ArrowUpRight,Box} from 'lucide-react';
export type MeshResult={positions:Float32Array;dimensions:[number,number,number];volume:number;triangles:number};
class Boundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true}}render(){return this.state.failed?<div className="viewer-fallback"><Box size={30}/><p>3D表示を開始できませんでした。</p><small>WebGL対応のブラウザで開き直してください。ダウンロードは引き続き使えます。</small></div>:this.props.children}}
function Item({data,color}:{data:MeshResult;color:string}){
 const geometry=useMemo(()=>{const g=new THREE.BufferGeometry();const a=new Float32Array(data.positions.length);for(let i=0;i<a.length;i+=3){a[i]=data.positions[i];a[i+1]=data.positions[i+2];a[i+2]=-data.positions[i+1];}g.setAttribute('position',new THREE.BufferAttribute(a,3));g.computeVertexNormals();return g},[data]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <mesh geometry={geometry} castShadow receiveShadow><meshStandardMaterial color={color} roughness={.8} metalness={.03}/></mesh>
}
function Phone({upright}:{upright:boolean}){return <group rotation={upright?[0,0,0]:[-Math.PI/2,0,0]} position={[0,upright?IPHONE.length/2:IPHONE.thickness/2,0]}>
 <RoundedBox args={[71.6,147.6,7.8]} radius={9} smoothness={6} castShadow><meshStandardMaterial color="#b9c6c3" roughness={.4} metalness={.55}/></RoundedBox>
 <RoundedBox args={[68.2,144.2,.45]} radius={8} smoothness={6} position={[0,0,4]}><meshStandardMaterial color="#182c29" roughness={.4}/></RoundedBox>
 <RoundedBox args={[23,6,.5]} radius={2.9} smoothness={3} position={[0,61,4.4]}><meshStandardMaterial color="#0a1210"/></RoundedBox>
 <RoundedBox args={[23,1.3,.5]} radius={.6} smoothness={3} position={[0,-65,4.4]}><meshStandardMaterial color="#d7e7dd"/></RoundedBox>
 </group>}
function Rig({reset,data}:{reset:number;data:MeshResult}){const {camera}=useThree();const controls=useRef<any>(null);useEffect(()=>{const size=Math.max(...data.dimensions,150);camera.position.set(size*1.2,size*1.05,size*1.5);controls.current?.target.set(0,Math.min(data.dimensions[2],80)/2,0);controls.current?.update()},[reset,camera,data.dimensions]);return <OrbitControls ref={controls} makeDefault minDistance={70} maxDistance={850} maxPolarAngle={Math.PI/2-.01} enableDamping/>}
export default function Viewer({data,busy}:{data:MeshResult|null;busy:boolean}){
 const [phone,setPhone]=useState(true),[upright,setUpright]=useState(false),[reset,setReset]=useState(0),[color,setColor]=useState('#a5b4a4'),[grid,setGrid]=useState(true);
 const offset=phone?-(IPHONE.width+22)/2:0;
 return <div className="viewer-wrap">
  <div className="viewer-top"><span className="live-dot"/> 実寸プレビュー <span className="unit">単位 mm</span></div>
  <div className="viewport" data-testid="viewport" aria-label={data?'作成したモデルとiPhone 16の3Dサイズ比較':'iPhone 16の3Dモデル'}>
   <Boundary><Canvas shadows dpr={[1,1.7]} camera={{position:[220,180,280],fov:37,near:.1,far:2000}} gl={{antialias:true}}>
    <color attach="background" args={['#f0f0e9']}/><ambientLight intensity={1.8}/><directionalLight position={[100,300,120]} intensity={3} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-240} shadow-camera-right={240} shadow-camera-top={240} shadow-camera-bottom={-240}/><directionalLight position={[-200,100,-100]} intensity={1.2}/>
    {data&&<group position={[offset,0,0]}><Item data={data} color={color}/><Html position={[0,.5,data.dimensions[1]/2+16]} center><div className="model-label">つくるもの <b>{data.dimensions[0].toFixed(0)} × {data.dimensions[1].toFixed(0)} × {data.dimensions[2].toFixed(0)}</b></div></Html></group>}
    {phone&&<group position={data?[data.dimensions[0]/2+22+IPHONE.width/2+offset,0,0]:[0,0,0]}><Phone upright={upright}/><Html position={[0,0,90]} center><div className="model-label phone-label">iPhone 16 <b>71.6 × 147.6 × 7.8</b></div></Html></group>}
    {grid&&<Grid position={[0,-.12,0]} args={[600,600]} cellSize={10} cellThickness={.5} cellColor="#d4d8cd" sectionSize={50} sectionThickness={.8} sectionColor="#c2c9bc" fadeDistance={650} infiniteGrid/>}
    <ContactShadows position={[0,-.08,0]} opacity={.24} scale={700} blur={2.5} far={180} resolution={256} color="#4e6555"/>
    {data?<Rig reset={reset} data={data}/>:<OrbitControls key={reset} makeDefault minDistance={70} maxDistance={850} maxPolarAngle={Math.PI/2-.01} enableDamping/>}
   </Canvas></Boundary>
   {busy&&<div className="model-busy"><span className="spinner"/>かたちを更新中</div>}
   <div className="viewer-hint"><ArrowUpRight size={14}/>ドラッグで回転 · スクロールで拡大</div>
  </div>
  <div className="viewer-controls"><button aria-pressed={phone} className={phone?'active':''} onClick={()=>setPhone(v=>!v)}><Smartphone size={15}/>{data?'iPhone 16と比較':'iPhone 16'}</button>{phone&&data&&<button onClick={()=>setUpright(v=>!v)}>{upright?'寝かせる':'立てる'}</button>}{data&&<div className="swatches" aria-label="表示カラー">{['#a5b4a4','#d8c9b1','#a9afb8','#e3dcd0'].map(c=><button key={c} style={{background:c}} aria-label={`表示色 ${c}`} aria-pressed={c===color} className={c===color?'selected':''} onClick={()=>setColor(c)}/>)}</div>}<button aria-pressed={grid} onClick={()=>setGrid(v=>!v)} className={data?'grid-toggle':''}>グリッド</button><button aria-label="視点をリセット" onClick={()=>setReset(n=>n+1)}><RotateCcw size={16}/></button></div>
  <p className="color-note">色は表示用です。印刷には現在のフィラメントを使用します。iPhoneは本体外寸の比較用モデルです（カメラの突起・ケースを除く）。</p>
 </div>
}
