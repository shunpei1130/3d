'use client';
import {Canvas,useThree} from '@react-three/fiber';
import {OrbitControls,ContactShadows,Grid,RoundedBox,Html} from '@react-three/drei';
import {useEffect,useLayoutEffect,useMemo,useRef,useState,Component,type ComponentRef,type ReactNode} from 'react';
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
const phoneGap=22;
const viewDirection=new THREE.Vector3(1.2,1.05,1.5).normalize();

function Rig({reset,dimensions,phone,upright}:{reset:number;dimensions:MeshResult['dimensions'];phone:boolean;upright:boolean}){
 const camera=useThree(state=>state.camera);
 const aspect=useThree(state=>state.size.width/state.size.height);
 const controls=useRef<ComponentRef<typeof OrbitControls>>(null);
 const [width,depth,height]=dimensions;
 const viewWidth=phone?width+phoneGap+IPHONE.width:width;
 const viewDepth=phone?Math.max(depth,upright?IPHONE.thickness:IPHONE.length):depth;
 const viewHeight=phone?Math.max(height,upright?IPHONE.length:IPHONE.thickness):height;
 const radius=Math.hypot(viewWidth,viewDepth,viewHeight)/2;

 useLayoutEffect(()=>{
  if(!(camera instanceof THREE.PerspectiveCamera)||!controls.current||!Number.isFinite(aspect)||aspect<=0)return;
  const vertical=THREE.MathUtils.degToRad(camera.getEffectiveFOV()/2);
  const horizontal=Math.atan(Math.tan(vertical)*aspect);
  const distance=radius*1.12/Math.sin(Math.min(vertical,horizontal));
  const target=controls.current.target.set(0,viewHeight/2,0);
  camera.position.copy(target).addScaledVector(viewDirection,distance);
  controls.current.update();
 },[aspect,camera,radius,reset,viewHeight]);

 return <OrbitControls ref={controls} makeDefault minDistance={Math.max(.2,radius*.6)} maxDistance={Math.max(850,radius*8)} maxPolarAngle={Math.PI/2-.01} enableDamping/>;
}

export default function Viewer({data,busy}:{data:MeshResult;busy:boolean}){
 const [phone,setPhone]=useState(false),[upright,setUpright]=useState(false),[reset,setReset]=useState(0),[color,setColor]=useState('#a5b4a4'),[grid,setGrid]=useState(true);
 const offset=phone?-(IPHONE.width+phoneGap)/2:0;
 return <div className="viewer-wrap">
  <div className="viewer-top"><span className="live-dot"/> 実寸プレビュー <span className="unit">単位 mm</span></div>
  <div className="viewport" data-testid="viewport" aria-label={phone?'作成したモデルとiPhone 16の3Dサイズ比較':'作成したモデルの3Dプレビュー'}>
   <Boundary><Canvas shadows dpr={[1,1.7]} camera={{position:[220,180,280],fov:37,near:.1,far:2000}} gl={{antialias:true}}>
    <color attach="background" args={['#f0f0e9']}/><ambientLight intensity={1.8}/><directionalLight position={[100,300,120]} intensity={3} castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-240} shadow-camera-right={240} shadow-camera-top={240} shadow-camera-bottom={-240}/><directionalLight position={[-200,100,-100]} intensity={1.2}/>
    <group position={[offset,0,0]}><Item data={data} color={color}/></group>
    {phone&&<group position={[data.dimensions[0]/2+phoneGap/2,0,0]}><Phone upright={upright}/><Html position={[0,0,90]} center><div className="model-label phone-label">iPhone 16 <b>71.6 × 147.6 × 7.8</b></div></Html></group>}
    {grid&&<Grid position={[0,-.12,0]} args={[600,600]} cellSize={10} cellThickness={.5} cellColor="#d4d8cd" sectionSize={50} sectionThickness={.8} sectionColor="#c2c9bc" fadeDistance={650} infiniteGrid/>}
    <ContactShadows position={[0,-.08,0]} opacity={.24} scale={700} blur={2.5} far={180} resolution={256} color="#4e6555"/>
    <Rig reset={reset} dimensions={data.dimensions} phone={phone} upright={upright}/>
   </Canvas></Boundary>
   {busy&&<div className="model-busy"><span className="spinner"/>かたちを更新中</div>}
   <div className="viewer-hint"><ArrowUpRight size={14}/>ドラッグで回転 · スクロールで拡大</div>
  </div>
  <div className="viewer-controls"><button aria-pressed={phone} className={phone?'active':''} onClick={()=>setPhone(v=>!v)}><Smartphone size={15}/>iPhone 16と比較</button>{phone&&<button onClick={()=>setUpright(v=>!v)}>{upright?'寝かせる':'立てる'}</button>}<div className="swatches" aria-label="表示カラー">{['#a5b4a4','#d8c9b1','#a9afb8','#e3dcd0'].map(c=><button key={c} style={{background:c}} aria-label={`表示色 ${c}`} aria-pressed={c===color} className={c===color?'selected':''} onClick={()=>setColor(c)}/>)}</div><button aria-pressed={grid} onClick={()=>setGrid(v=>!v)} className="grid-toggle">グリッド</button><button aria-label="視点をリセット" onClick={()=>setReset(n=>n+1)}><RotateCcw size={16}/></button></div>
  <p className="color-note">色は表示用です。印刷には現在のフィラメントを使用します。iPhoneは本体外寸の比較用モデルです（カメラの突起・ケースを除く）。</p>
 </div>
}
