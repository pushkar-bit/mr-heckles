/**
 * @file PropertySetup.jsx
 * @description Mr. Heckles — Property Setup Landing Page.
 *
 * Stage 1: Three 3D building models (Hostel · Residency · Resort & Hotel)
 *           — rotatable, hoverable, clickable.
 * Stage 2: On selection, a "matrix configurator" slides in.
 *           — Number of floors + rooms per floor input
 *           — Live 3D matrix grid preview that animates in
 *           — Per-floor / per-room size customisation
 *           — Uniform or irregular layout modes
 */

import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Float } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
//  Font import
// ─────────────────────────────────────────────────────────────
const FONT_LINK = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500&display=swap');`;

// ─────────────────────────────────────────────────────────────
//  Design tokens
// ─────────────────────────────────────────────────────────────
const C = {
  bg:       '#080808',
  surface:  'rgba(14,14,14,0.95)',
  border:   'rgba(255,255,255,0.07)',
  text:     'rgba(255,255,255,0.85)',
  muted:    'rgba(255,255,255,0.28)',
  faint:    'rgba(255,255,255,0.10)',
  accent:   'rgba(255,255,255,0.55)',
  hostel:   '#C2633A',
  residency:'#5B8FA8',
  resort:   '#8A9E6B',
};

// ─────────────────────────────────────────────────────────────
//  Property definitions
// ─────────────────────────────────────────────────────────────
const SPACING = 7.8;
const PROPERTIES = [
  {
    id: 'hostel',
    label: 'HOSTEL',
    sub: 'Dormitories · Shared rooms',
    accentColor: C.hostel,
    pos: [-SPACING, 0, 0],
    camPos: new THREE.Vector3(-SPACING, 3.2, 6.2),
    camTarget: new THREE.Vector3(-SPACING, 1.2, 0),
    hitBox: [4.4, 4.8, 2.8],
    labelY: 4.1,
  },
  {
    id: 'residency',
    label: 'RESIDENCY',
    sub: 'Apartments · Studio flats',
    accentColor: C.residency,
    pos: [0, 0, 0],
    camPos: new THREE.Vector3(0, 3.2, 6.2),
    camTarget: new THREE.Vector3(0, 1.6, 0),
    hitBox: [4.0, 5.2, 2.4],
    labelY: 4.7,
  },
  {
    id: 'resort',
    label: 'RESORT & HOTEL',
    sub: 'Suites · Premium rooms',
    accentColor: C.resort,
    pos: [SPACING, 0, 0],
    camPos: new THREE.Vector3(SPACING, 3.2, 6.2),
    camTarget: new THREE.Vector3(SPACING, 0.8, 0),
    hitBox: [5.4, 3.4, 3.2],
    labelY: 3.1,
  },
];

const DEFAULT_CAM = new THREE.Vector3(0, 5.5, 20);
const DEFAULT_TGT = new THREE.Vector3(0, 0.5, 0);

// ─────────────────────────────────────────────────────────────
//  Shared Materials
// ─────────────────────────────────────────────────────────────
const MAT = {
  terra:    new THREE.MeshStandardMaterial({ color:'#B5532A', roughness:0.88, metalness:0.0 }),
  terraDk:  new THREE.MeshStandardMaterial({ color:'#8C3E1C', roughness:0.9,  metalness:0.0 }),
  jali:     new THREE.MeshStandardMaterial({ color:'#D4845A', roughness:0.6,  metalness:0.05, side: THREE.DoubleSide }),
  glass:    new THREE.MeshPhysicalMaterial({ color:'#A8C8E8', transmission:0.82, roughness:0.02, metalness:0.12, thickness:0.4, ior:1.5, transparent:true, opacity:0.92 }),
  glassF:   new THREE.MeshStandardMaterial({ color:'#E8EDF2', roughness:0.15, metalness:0.7 }),
  villa:    new THREE.MeshStandardMaterial({ color:'#F0EDE8', roughness:0.55, metalness:0.0 }),
  villaAcc: new THREE.MeshStandardMaterial({ color:'#D4C4A8', roughness:0.6,  metalness:0.0 }),
  villaRf:  new THREE.MeshStandardMaterial({ color:'#2A2A2A', roughness:0.7,  metalness:0.05 }),
  pool:     new THREE.MeshPhysicalMaterial({ color:'#4A9EBF', transmission:0.6, roughness:0.05, metalness:0.1, transparent:true, opacity:0.85 }),
  ground:   new THREE.MeshStandardMaterial({ color:'#0D0D0D', roughness:1.0,  metalness:0.0 }),
};

// ─────────────────────────────────────────────────────────────
//  Building models (procedural)
// ─────────────────────────────────────────────────────────────
const JaliLattice = ({ width=2.6, height=2.2, cols=7, rows=5 }) => {
  const bars = useMemo(() => {
    const items = [];
    const t = 0.045, d = 0.06;
    const cS = width / (cols + 1), rS = height / (rows + 1);
    for (let c=1; c<=cols; c++) items.push({ k:`v${c}`, s:[t,height+0.1,d], p:[-width/2+c*cS,0,0] });
    for (let r=1; r<=rows; r++) items.push({ k:`h${r}`, s:[width+0.1,t,d], p:[0,-height/2+r*rS,0] });
    for (let c=2; c<=cols-1; c+=2) for (let r=2; r<=rows-1; r+=2)
      items.push({ k:`d${c}${r}`, s:[0.11,0.11,d+0.02], p:[-width/2+c*cS,-height/2+r*rS,0], rot:[0,0,Math.PI/4] });
    return items;
  }, [width, height, cols, rows]);
  return (
    <group>
      {bars.map(({ k, s, p, rot=[0,0,0] }) => (
        <mesh key={k} position={p} rotation={rot} material={MAT.jali} castShadow>
          <boxGeometry args={s} />
        </mesh>
      ))}
    </group>
  );
};

const HostelBuilding = () => (
  <group>
    <mesh position={[0,1.5,0]} castShadow receiveShadow material={MAT.terra}><boxGeometry args={[3.2,3.0,1.8]} /></mesh>
    <mesh position={[0,0.2,0]} castShadow receiveShadow material={MAT.terraDk}><boxGeometry args={[3.4,0.4,2.0]} /></mesh>
    <mesh position={[0,3.12,0]} castShadow material={MAT.terraDk}><boxGeometry args={[3.5,0.12,2.1]} /></mesh>
    <mesh position={[0,3.28,0]} castShadow material={MAT.terra}><boxGeometry args={[3.5,0.18,0.12]} /></mesh>
    <mesh position={[0,3.28,1.05]} castShadow material={MAT.terra}><boxGeometry args={[3.5,0.18,0.12]} /></mesh>
    {[[-0.95,1.5,0.91],[0.95,1.5,0.91],[-0.95,2.55,0.91],[0.95,2.55,0.91]].map(([x,y,z],i)=>(
      <mesh key={i} position={[x,y,z]} material={MAT.terraDk}><boxGeometry args={[0.55,0.62,0.04]} /></mesh>
    ))}
    <group position={[0,1.55,0.94]}><JaliLattice width={2.6} height={2.2} cols={7} rows={5} /></group>
    <group position={[1.61,1.55,0]} rotation={[0,Math.PI/2,0]}><JaliLattice width={1.5} height={2.2} cols={4} rows={5} /></group>
  </group>
);

const SLABS = [
  [3.2,0.85,1.6, 0,0.0,0],
  [2.8,0.85,1.4, 0.28,0.9,-0.05],
  [2.4,0.85,1.25,-0.2,1.8,0.08],
  [1.9,0.75,1.1, 0.15,2.7,-0.04],
  [1.4,0.55,0.9,-0.1,3.5,0.0],
];

const ResidencyBuilding = () => (
  <group>
    <mesh position={[0,0.15,0]} castShadow receiveShadow material={MAT.glassF}><boxGeometry args={[3.5,0.3,1.8]} /></mesh>
    {SLABS.map(([w,h,d,ox,yB,oz],i) => (
      <group key={i} position={[ox, yB+h/2+0.3, oz]}>
        <mesh castShadow receiveShadow material={MAT.glass}><boxGeometry args={[w,h,d]} /></mesh>
        <mesh material={MAT.glassF}><boxGeometry args={[w+0.04,h+0.04,d+0.04]} /></mesh>
        <mesh material={MAT.glass}><boxGeometry args={[w-0.04,h-0.04,d-0.04]} /></mesh>
        <mesh position={[0,h/2-0.025,0]} material={MAT.glassF}><boxGeometry args={[w+0.06,0.06,d+0.06]} /></mesh>
        {[-w/4,0,w/4].map((mx,mi)=>(
          <mesh key={mi} position={[mx,0,d/2+0.01]} material={MAT.glassF}><boxGeometry args={[0.04,h,0.03]} /></mesh>
        ))}
      </group>
    ))}
    <mesh position={[0.1,4.1,0]} castShadow material={MAT.glassF}><boxGeometry args={[1.2,0.1,0.8]} /></mesh>
  </group>
);

const ResortBuilding = () => (
  <group>
    <mesh position={[0,0.75,0]} castShadow receiveShadow material={MAT.villa}><boxGeometry args={[3.8,1.5,2.0]} /></mesh>
    <mesh position={[0,1.56,0]} castShadow material={MAT.villaRf}><boxGeometry args={[4.4,0.08,2.6]} /></mesh>
    <mesh position={[0,1.52,0]} material={MAT.villaAcc}><boxGeometry args={[4.42,0.04,2.62]} /></mesh>
    <mesh position={[-2.6,0.55,0.2]} castShadow receiveShadow material={MAT.villaAcc}><boxGeometry args={[1.5,1.1,1.6]} /></mesh>
    <mesh position={[-2.6,1.12,0.2]} castShadow material={MAT.villaRf}><boxGeometry args={[1.9,0.07,2.0]} /></mesh>
    <mesh position={[2.4,0.95,-0.15]} castShadow receiveShadow material={MAT.villa}><boxGeometry args={[1.2,1.9,1.7]} /></mesh>
    <mesh position={[2.4,1.96,-0.15]} castShadow material={MAT.villaRf}><boxGeometry args={[1.5,0.07,2.0]} /></mesh>
    <mesh position={[0,1.35,1.35]} castShadow material={MAT.villaRf}><boxGeometry args={[2.0,0.06,0.9]} /></mesh>
    {[-0.8,0.8].map((cx,ci)=>(<mesh key={ci} position={[cx,0.67,1.35]} castShadow material={MAT.villaAcc}><boxGeometry args={[0.08,1.36,0.08]} /></mesh>))}
    <mesh position={[1.6,0.02,1.5]} receiveShadow material={MAT.pool}><boxGeometry args={[2.0,0.12,1.1]} /></mesh>
    <mesh position={[1.6,0.085,1.5]} material={MAT.villaAcc}><boxGeometry args={[2.1,0.05,1.2]} /></mesh>
    {[[-2.0,1.6],[2.8,1.6],[-2.0,-0.9],[2.8,-0.9]].map(([wx,wz],wi)=>(
      <mesh key={wi} position={[wx,0.22,wz]} castShadow material={MAT.villaAcc}><boxGeometry args={[0.12,0.45,0.6]} /></mesh>
    ))}
    {[-1.5,-0.5,0.5].map((hx,hi)=>(
      <mesh key={hi} position={[hx,0.08,1.85]} material={new THREE.MeshStandardMaterial({color:'#2D5A27',roughness:0.95})}><boxGeometry args={[0.6,0.18,0.25]} /></mesh>
    ))}
  </group>
);

// ─────────────────────────────────────────────────────────────
//  3D Matrix Grid — live preview of floor × room layout
// ─────────────────────────────────────────────────────────────
const RoomCell = ({ position, size, color, isSelected, onClick, roomData }) => {
  const meshRef = useRef();
  const [hov, setHov] = useState(false);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    const targetScale = isSelected ? 1.08 : hov ? 1.04 : 1;
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.12);
  });

  const c = isSelected
    ? new THREE.Color(color).multiplyScalar(1.6)
    : hov
    ? new THREE.Color(color).multiplyScalar(1.25)
    : new THREE.Color(color);

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHov(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={(e) => { e.stopPropagation(); setHov(false); document.body.style.cursor = 'default'; }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={size} />
      <meshStandardMaterial color={c} roughness={0.4} metalness={0.1} />
      {/* Inner glow outline */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(...size)]} />
        <lineBasicMaterial color={isSelected ? '#ffffff' : '#333333'} transparent opacity={isSelected ? 0.6 : 0.2} />
      </lineSegments>
    </mesh>
  );
};

const MatrixGrid = ({ floors, roomsPerFloor, floorSizes, roomSizes, selectedCell, onCellClick, propertyType }) => {
  const ROOM_W = 0.7, ROOM_H = 0.45, ROOM_D = 0.55;
  const GAP = 0.08;
  const FLOOR_GAP = 0.06;

  const accentColor = propertyType === 'hostel' ? C.hostel
    : propertyType === 'residency' ? C.residency : C.resort;

  const cells = useMemo(() => {
    const result = [];
    let yOff = 0;
    for (let f = 0; f < floors; f++) {
      const fh = floorSizes[f] ?? ROOM_H;
      const rooms = roomsPerFloor[f] ?? roomsPerFloor[0] ?? 4;
      const totalW = rooms * (ROOM_W + GAP) - GAP;
      for (let r = 0; r < rooms; r++) {
        const rw = roomSizes[`${f}-${r}`] ?? ROOM_W;
        const x = -totalW / 2 + r * (ROOM_W + GAP) + ROOM_W / 2;
        result.push({
          key: `${f}-${r}`,
          floor: f, room: r,
          position: [x, yOff + fh / 2, 0],
          size: [rw, fh, ROOM_D],
        });
      }
      yOff += fh + FLOOR_GAP;
    }
    return result;
  }, [floors, roomsPerFloor, floorSizes, roomSizes]);

  const totalH = useMemo(() => {
    let h = 0;
    for (let f=0; f<floors; f++) h += (floorSizes[f] ?? ROOM_H) + FLOOR_GAP;
    return h;
  }, [floors, floorSizes]);

  return (
    <group position={[0, -totalH / 2, 0]}>
      {cells.map(({ key, floor, room, position, size }) => (
        <RoomCell
          key={key}
          position={position}
          size={size}
          color={accentColor}
          isSelected={selectedCell === key}
          onClick={() => onCellClick(key, floor, room)}
        />
      ))}
      {/* Floor labels */}
      {Array.from({ length: floors }, (_, f) => {
        const fh = floorSizes[f] ?? ROOM_H;
        let yOff = 0;
        for (let i=0; i<f; i++) yOff += (floorSizes[i] ?? ROOM_H) + FLOOR_GAP;
        return (
          <Html key={`lbl-${f}`} position={[-3.5, yOff + fh/2, 0]} style={{ pointerEvents:'none' }}>
            <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'8px', letterSpacing:'0.3em', color:'rgba(255,255,255,0.22)', textTransform:'uppercase', whiteSpace:'nowrap' }}>
              F{f + 1}
            </span>
          </Html>
        );
      })}
    </group>
  );
};

// ─────────────────────────────────────────────────────────────
//  Camera controller — smooth lerp
// ─────────────────────────────────────────────────────────────
const CameraController = ({ targetPos, targetLook, orbitRef }) => {
  const { camera } = useThree();
  const lP = useRef(camera.position.clone());
  const lL = useRef(targetLook.clone());

  useFrame(() => {
    lP.current.lerp(targetPos, 0.055);
    camera.position.copy(lP.current);
    if (orbitRef.current) {
      lL.current.lerp(targetLook, 0.055);
      orbitRef.current.target.copy(lL.current);
      orbitRef.current.update();
    }
  });
  return null;
};

// ─────────────────────────────────────────────────────────────
//  Label — always visible, highlights on hover/select
// ─────────────────────────────────────────────────────────────
const BuildingLabel = ({ label, isHovered, isSelected, yOffset, accentColor }) => (
  <Html center position={[0, yOffset, 0]} style={{ pointerEvents:'none', userSelect:'none' }}>
    <div style={{ textAlign:'center' }}>
      <span style={{
        fontFamily: "'Inter',sans-serif",
        fontSize: '10px', fontWeight: '300',
        letterSpacing: '0.42em',
        textTransform: 'uppercase',
        color: isSelected ? '#fff' : isHovered ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)',
        display: 'block',
        transition: 'color 300ms ease',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{
        height: '1px',
        background: isSelected ? accentColor : isHovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)',
        width: isSelected ? '100%' : isHovered ? '80%' : '30%',
        margin: '5px auto 0',
        transition: 'all 400ms ease',
      }} />
    </div>
  </Html>
);

// ─────────────────────────────────────────────────────────────
//  Landing Scene — three buildings side by side
// ─────────────────────────────────────────────────────────────
const LandingScene = ({ selectedId, onSelect }) => {
  const orbitRef = useRef();

  const { targetPos, targetLook } = useMemo(() => {
    if (!selectedId) return { targetPos: DEFAULT_CAM.clone(), targetLook: DEFAULT_TGT.clone() };
    const p = PROPERTIES.find(p => p.id === selectedId);
    return { targetPos: p.camPos.clone(), targetLook: p.camTarget.clone() };
  }, [selectedId]);

  return (
    <>
      <ambientLight intensity={0.5} color="#E8EEF8" />
      <directionalLight position={[8,14,8]} intensity={1.8} color="#FFF5E8" castShadow
        shadow-mapSize={[2048,2048]} shadow-camera-left={-25} shadow-camera-right={25}
        shadow-camera-top={20} shadow-camera-bottom={-20} shadow-bias={-0.0005} />
      <directionalLight position={[-6,8,-4]} intensity={0.5} color="#C8D8F0" />
      <directionalLight position={[0,3,-10]} intensity={0.3} color="#fff" />
      <pointLight position={[0,6,4]} intensity={0.7} color="#FFE8C8" distance={30} />

      {/* Ground */}
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0,0]} receiveShadow material={MAT.ground}>
        <planeGeometry args={[100,100]} />
      </mesh>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,0.001,0]} receiveShadow>
        <planeGeometry args={[100,100]} />
        <shadowMaterial opacity={0.4} />
      </mesh>
      <gridHelper args={[60,60,'#161616','#111111']} position={[0,0.002,0]} />

      {/* Buildings */}
      {PROPERTIES.map((prop) => {
        const Building = prop.id === 'hostel' ? HostelBuilding
          : prop.id === 'residency' ? ResidencyBuilding : ResortBuilding;
        return (
          <BuildingGroup
            key={prop.id}
            prop={prop}
            isSelected={selectedId === prop.id}
            onSelect={onSelect}
          >
            <Building />
          </BuildingGroup>
        );
      })}

      <CameraController targetPos={targetPos} targetLook={targetLook} orbitRef={orbitRef} />
      <OrbitControls
        ref={orbitRef}
        enableDamping dampingFactor={0.032} rotateSpeed={0.55} zoomSpeed={0.7}
        minDistance={4} maxDistance={35}
        minPolarAngle={0.1} maxPolarAngle={Math.PI / 2.05}
        makeDefault
      />
    </>
  );
};

const BuildingGroup = ({ prop, isSelected, onSelect, children }) => {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef();

  // Gentle float when not selected
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    if (!isSelected) {
      groupRef.current.position.y = Math.sin(t * 0.4 + prop.pos[0]) * 0.04;
    } else {
      groupRef.current.position.y = 0;
    }
  });

  return (
    <group
      position={prop.pos}
      ref={groupRef}
      onPointerOver={() => document.body.style.cursor = 'pointer'}
      onPointerOut={() => document.body.style.cursor = 'default'}
    >
      {children}
      {/* Invisible hit box */}
      <mesh
        position={[0, prop.hitBox[1]/2, 0]}
        onClick={(e) => { e.stopPropagation(); onSelect(isSelected ? null : prop.id); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
        visible={false}
      >
        <boxGeometry args={prop.hitBox} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <BuildingLabel
        label={prop.label}
        isHovered={hovered}
        isSelected={isSelected}
        yOffset={prop.labelY}
        accentColor={prop.accentColor}
      />
    </group>
  );
};

// ─────────────────────────────────────────────────────────────
//  Matrix Scene — 3D room grid configurator
// ─────────────────────────────────────────────────────────────
const MatrixScene = ({ floors, roomsPerFloor, floorSizes, roomSizes, selectedCell, onCellClick, propertyType }) => {
  const orbitRef = useRef();
  return (
    <>
      <ambientLight intensity={0.4} color="#E8EEF8" />
      <directionalLight position={[5,10,5]} intensity={1.4} color="#FFF5E8" castShadow
        shadow-mapSize={[1024,1024]} shadow-camera-left={-8} shadow-camera-right={8}
        shadow-camera-top={8} shadow-camera-bottom={-8} shadow-bias={-0.001} />
      <directionalLight position={[-4,6,-3]} intensity={0.4} color="#C8D8F0" />
      <pointLight position={[0,4,4]} intensity={0.5} color="#fff" distance={20} />

      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-0.01,0]} receiveShadow material={MAT.ground}>
        <planeGeometry args={[40,40]} />
      </mesh>
      <gridHelper args={[30,30,'#141414','#0F0F0F']} position={[0,0,0]} />

      <MatrixGrid
        floors={floors}
        roomsPerFloor={roomsPerFloor}
        floorSizes={floorSizes}
        roomSizes={roomSizes}
        selectedCell={selectedCell}
        onCellClick={onCellClick}
        propertyType={propertyType}
      />

      <OrbitControls
        ref={orbitRef}
        enableDamping dampingFactor={0.04} rotateSpeed={0.6} zoomSpeed={0.8}
        minDistance={2} maxDistance={20}
        minPolarAngle={0.05} maxPolarAngle={Math.PI/1.9}
        makeDefault
      />
    </>
  );
};

// ─────────────────────────────────────────────────────────────
//  UI: Slider with label
// ─────────────────────────────────────────────────────────────
const Slider = ({ label, value, min, max, onChange, unit='' }) => (
  <div style={{ marginBottom: '20px' }}>
    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
      <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.32em', textTransform:'uppercase', color:C.muted }}>{label}</span>
      <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'11px', color:C.text }}>{value}{unit}</span>
    </div>
    <input
      type="range" min={min} max={max} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width:'100%', accentColor:'rgba(255,255,255,0.6)', cursor:'pointer' }}
    />
  </div>
);

// ─────────────────────────────────────────────────────────────
//  UI: Step pill
// ─────────────────────────────────────────────────────────────
const StepPill = ({ n, label, active, done }) => (
  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
    <div style={{
      width:'20px', height:'20px', borderRadius:'50%', flexShrink:0,
      border:`1px solid ${active ? 'rgba(255,255,255,0.6)' : done ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}`,
      background: done ? 'rgba(255,255,255,0.1)' : 'transparent',
      display:'flex', alignItems:'center', justifyContent:'center',
    }}>
      <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', color: active ? C.text : C.faint }}>{done ? '✓' : n}</span>
    </div>
    <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.28em', textTransform:'uppercase', color: active ? C.accent : done ? C.muted : C.faint }}>
      {label}
    </span>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  Main Page
// ─────────────────────────────────────────────────────────────
export default function PropertySetup({ onComplete }) {
  // Stage: 'landing' → 'configure' → 'matrix' → 'customize'
  const [stage, setStage] = useState('landing');
  const [selectedType, setSelectedType] = useState(null);
  const [propertyName, setPropertyName] = useState('');
  const [floors, setFloors] = useState(3);
  const [roomsMode, setRoomsMode] = useState('uniform'); // 'uniform' | 'perFloor'
  const [uniformRooms, setUniformRooms] = useState(4);
  const [roomsPerFloor, setRoomsPerFloor] = useState({});
  const [floorSizes, setFloorSizes] = useState({});   // floor → height multiplier
  const [roomSizes, setRoomSizes] = useState({});      // "f-r" → width multiplier
  const [selectedCell, setSelectedCell] = useState(null);
  const [sizeMode, setSizeMode] = useState('uniform'); // 'uniform' | 'perFloor' | 'perRoom'
  const [unifRoomSize, setUnifRoomSize] = useState(1);
  const [nameInput, setNameInput] = useState(false);

  const selectedProp = PROPERTIES.find(p => p.id === selectedType);

  const resolvedRoomsPerFloor = useMemo(() => {
    const arr = [];
    for (let f=0; f<floors; f++) {
      arr.push(roomsMode === 'uniform' ? uniformRooms : (roomsPerFloor[f] ?? uniformRooms));
    }
    return arr;
  }, [floors, roomsMode, uniformRooms, roomsPerFloor]);

  const resolvedFloorSizes = useMemo(() => {
    const result = {};
    for (let f=0; f<floors; f++) result[f] = floorSizes[f] ?? 0.45;
    return result;
  }, [floors, floorSizes]);

  const resolvedRoomSizes = useMemo(() => {
    if (sizeMode === 'uniform') {
      const result = {};
      for (let f=0; f<floors; f++) {
        const rooms = resolvedRoomsPerFloor[f];
        for (let r=0; r<rooms; r++) result[`${f}-${r}`] = 0.35 + unifRoomSize * 0.35;
      }
      return result;
    }
    return roomSizes;
  }, [sizeMode, floors, resolvedRoomsPerFloor, unifRoomSize, roomSizes]);

  const handleBuildingSelect = (id) => {
    setSelectedType(id);
  };

  const handleConfirm = () => {
    if (!selectedType) return;
    setStage('configure');
  };

  const handleConfigureDone = () => {
    setStage('matrix');
  };

  const handleCellClick = (key, floor, room) => {
    setSelectedCell(key === selectedCell ? null : key);
  };

  const handleFinalize = () => {
    const config = {
      type: selectedType,
      name: propertyName || `My ${selectedProp?.label}`,
      floors,
      rooms: resolvedRoomsPerFloor,
      floorSizes: resolvedFloorSizes,
      roomSizes: resolvedRoomSizes,
    };
    onComplete?.(config);
  };

  const parsedSelectedCell = selectedCell ? { floor: Number(selectedCell.split('-')[0]), room: Number(selectedCell.split('-')[1]) } : null;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div style={{ width:'100%', height:'100vh', background: C.bg, position:'relative', overflow:'hidden' }}>
      <style>{`
        ${FONT_LINK}
        * { box-sizing: border-box; }
        input[type=range] { height: 2px; -webkit-appearance: none; background: rgba(255,255,255,0.12); border-radius: 2px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:rgba(255,255,255,0.8); cursor:pointer; }
        input[type=number] { background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.8); font-family:'Inter',sans-serif; font-size:14px; font-weight:200; text-align:center; outline:none; padding:6px 0; width:60px; }
        input[type=text] { background:transparent; border:none; border-bottom:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.8); font-family:'Inter',sans-serif; font-size:13px; font-weight:300; outline:none; padding:6px 0; width:100%; }
        @keyframes slideUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
      `}</style>

      {/* ── Top wordmark ── */}
      <div style={{ position:'absolute', top:'28px', left:'50%', transform:'translateX(-50%)', zIndex:20, pointerEvents:'none', textAlign:'center' }}>
        <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'10px', fontWeight:'300', letterSpacing:'0.55em', textTransform:'uppercase', color:'rgba(255,255,255,0.22)' }}>
          MR. HECKLES
        </span>
      </div>

      {/* ── Landing Stage ── */}
      {stage === 'landing' && (
        <>
          <Canvas
            shadows
            gl={{ antialias:true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure:1.05, outputColorSpace: THREE.SRGBColorSpace }}
            camera={{ position: DEFAULT_CAM.toArray(), fov:42, near:0.1, far:200 }}
            onPointerMissed={() => setSelectedType(null)}
            style={{ background: C.bg }}
          >
            <LandingScene selectedId={selectedType} onSelect={handleBuildingSelect} />
          </Canvas>

          {/* Bottom hint */}
          <AnimatePresence>
            {!selectedType && (
              <motion.div
                initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                transition={{ delay:0.5 }}
                style={{ position:'absolute', bottom:'36px', left:'50%', transform:'translateX(-50%)', zIndex:20, textAlign:'center', pointerEvents:'none' }}
              >
                <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.38em', textTransform:'uppercase', color:'rgba(255,255,255,0.16)' }}>
                  Drag to orbit · Click to select
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selection card */}
          <AnimatePresence>
            {selectedType && (
              <motion.div
                initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:20 }}
                transition={{ type:'spring', stiffness:300, damping:28 }}
                style={{
                  position:'absolute', bottom:'32px', left:'50%', transform:'translateX(-50%)',
                  zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', gap:'10px',
                }}
              >
                <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.42em', textTransform:'uppercase', color: selectedProp?.accentColor ?? C.muted, animation:'fadeIn 0.3s ease' }}>
                  {selectedProp?.sub}
                </span>
                <div style={{ display:'flex', gap:'10px' }}>
                  <button
                    onClick={() => setSelectedType(null)}
                    style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.35em', textTransform:'uppercase', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.3)', padding:'10px 22px', cursor:'pointer', transition:'all 200ms ease' }}
                    onMouseEnter={(e) => { e.target.style.color='rgba(255,255,255,0.6)'; e.target.style.borderColor='rgba(255,255,255,0.25)'; }}
                    onMouseLeave={(e) => { e.target.style.color='rgba(255,255,255,0.3)'; e.target.style.borderColor='rgba(255,255,255,0.1)'; }}
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleConfirm}
                    style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.38em', textTransform:'uppercase', background:'transparent', border:`1px solid ${selectedProp?.accentColor ?? 'rgba(255,255,255,0.25)'}`, color: selectedProp?.accentColor ?? C.text, padding:'10px 28px', cursor:'pointer', transition:'all 200ms ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    Configure →
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── Configure Stage ── */}
      {stage === 'configure' && (
        <motion.div
          initial={{ opacity:0 }} animate={{ opacity:1 }}
          style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'0' }}
        >
          {/* Building type chip */}
          <motion.div
            initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }}
            transition={{ delay:0.1 }}
            style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'40px' }}
          >
            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background: selectedProp?.accentColor }} />
            <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.45em', textTransform:'uppercase', color: selectedProp?.accentColor }}>
              {selectedProp?.label}
            </span>
          </motion.div>

          {/* Step progress */}
          <div style={{ display:'flex', gap:'24px', marginBottom:'40px' }}>
            <StepPill n={1} label="Type" done active={false} />
            <div style={{ width:'32px', height:'1px', background:'rgba(255,255,255,0.08)', alignSelf:'center' }} />
            <StepPill n={2} label="Layout" active done={false} />
            <div style={{ width:'32px', height:'1px', background:'rgba(255,255,255,0.08)', alignSelf:'center' }} />
            <StepPill n={3} label="Rooms" active={false} done={false} />
          </div>

          {/* Panel */}
          <motion.div
            initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }}
            transition={{ delay:0.15 }}
            style={{
              width:'420px', background: C.surface,
              border:`1px solid ${C.border}`,
              padding:'40px',
            }}
          >
            <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'10px', letterSpacing:'0.42em', textTransform:'uppercase', color:C.muted, display:'block', marginBottom:'32px' }}>
              Building Layout
            </span>

            {/* Property name */}
            <div style={{ marginBottom:'28px' }}>
              <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'8px', letterSpacing:'0.32em', textTransform:'uppercase', color:'rgba(255,255,255,0.2)', display:'block', marginBottom:'8px' }}>Property Name</span>
              <input
                type="text"
                value={propertyName}
                onChange={(e) => setPropertyName(e.target.value)}
                placeholder={`My ${selectedProp?.label ?? 'Property'}`}
                style={{ letterSpacing:'0.02em' }}
              />
            </div>

            {/* Floors */}
            <Slider label="Number of Floors" value={floors} min={1} max={20} onChange={setFloors} />

            {/* Rooms mode */}
            <div style={{ marginBottom:'20px' }}>
              <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'8px', letterSpacing:'0.32em', textTransform:'uppercase', color:'rgba(255,255,255,0.2)', display:'block', marginBottom:'12px' }}>Rooms per Floor</span>
              <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
                {['uniform','perFloor'].map((m) => (
                  <button key={m} onClick={() => setRoomsMode(m)} style={{
                    flex:1, padding:'8px 0',
                    fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.3em', textTransform:'uppercase',
                    background: roomsMode===m ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border:`1px solid ${roomsMode===m ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    color: roomsMode===m ? C.text : C.faint,
                    cursor:'pointer', transition:'all 200ms ease',
                  }}>
                    {m === 'uniform' ? 'Uniform' : 'Per Floor'}
                  </button>
                ))}
              </div>

              {roomsMode === 'uniform' ? (
                <Slider label="Rooms per Floor" value={uniformRooms} min={1} max={12} onChange={setUniformRooms} />
              ) : (
                <div style={{ maxHeight:'140px', overflowY:'auto', paddingRight:'4px' }}>
                  {Array.from({ length: floors }, (_, f) => (
                    <div key={f} style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'10px' }}>
                      <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.28em', textTransform:'uppercase', color:C.muted, width:'32px', flexShrink:0 }}>F{f+1}</span>
                      <input type="range" min={1} max={12} value={roomsPerFloor[f] ?? uniformRooms}
                        onChange={(e) => setRoomsPerFloor(prev => ({...prev, [f]: Number(e.target.value)}))}
                        style={{ flex:1 }} />
                      <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'11px', color:C.text, width:'20px', textAlign:'right' }}>
                        {roomsPerFloor[f] ?? uniformRooms}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={handleConfigureDone}
              style={{
                width:'100%', padding:'13px 0', marginTop:'8px',
                fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.42em', textTransform:'uppercase',
                background:'transparent', border:`1px solid ${selectedProp?.accentColor ?? 'rgba(255,255,255,0.2)'}`,
                color: selectedProp?.accentColor ?? C.text,
                cursor:'pointer', transition:'all 200ms ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Preview Matrix →
            </button>
            <button onClick={() => setStage('landing')} style={{ width:'100%', padding:'10px 0', marginTop:'8px', fontFamily:"'Inter',sans-serif", fontSize:'8px', letterSpacing:'0.3em', textTransform:'uppercase', background:'transparent', border:'none', color:'rgba(255,255,255,0.18)', cursor:'pointer' }}>
              ← Back
            </button>
          </motion.div>
        </motion.div>
      )}

      {/* ── Matrix Stage ── */}
      {stage === 'matrix' && (
        <div style={{ width:'100%', height:'100%', display:'flex' }}>
          {/* 3D canvas */}
          <div style={{ flex:1, position:'relative' }}>
            <Canvas
              shadows
              gl={{ antialias:true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure:1.0, outputColorSpace: THREE.SRGBColorSpace }}
              camera={{ position:[0, 3, 8], fov:45, near:0.1, far:100 }}
              style={{ background: C.bg }}
            >
              <MatrixScene
                floors={floors}
                roomsPerFloor={resolvedRoomsPerFloor}
                floorSizes={resolvedFloorSizes}
                roomSizes={resolvedRoomSizes}
                selectedCell={selectedCell}
                onCellClick={handleCellClick}
                propertyType={selectedType}
              />
            </Canvas>

            {/* Matrix legend */}
            <div style={{ position:'absolute', top:'28px', left:'28px', zIndex:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                <div style={{ width:'5px', height:'5px', borderRadius:'50%', background: selectedProp?.accentColor }} />
                <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.38em', textTransform:'uppercase', color:C.muted }}>
                  {selectedProp?.label}
                </span>
              </div>
              <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'8px', letterSpacing:'0.28em', textTransform:'uppercase', color:'rgba(255,255,255,0.15)' }}>
                {floors} floors · {resolvedRoomsPerFloor.reduce((a,b)=>a+b,0)} rooms total
              </span>
            </div>

            {/* Selected cell info */}
            <AnimatePresence>
              {selectedCell && (
                <motion.div
                  initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  style={{
                    position:'absolute', bottom:'80px', left:'28px', zIndex:10,
                    background: C.surface, border:`1px solid ${C.border}`,
                    padding:'16px 20px',
                  }}
                >
                  <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'8px', letterSpacing:'0.35em', textTransform:'uppercase', color:C.muted, display:'block', marginBottom:'6px' }}>
                    Floor {parsedSelectedCell?.floor + 1} · Room {parsedSelectedCell?.room + 1}
                  </span>
                  <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'10px', letterSpacing:'0.2em', color:C.text }}>
                    {sizeMode === 'perRoom' ? 'Custom size' : 'Standard'}
                  </span>
                  {sizeMode === 'perRoom' && (
                    <div style={{ marginTop:'10px' }}>
                      <Slider
                        label="Room Width"
                        value={Math.round(((roomSizes[selectedCell] ?? 0.7) - 0.35) / 0.35 * 100)}
                        min={0} max={100}
                        onChange={(v) => setRoomSizes(prev => ({ ...prev, [selectedCell]: 0.35 + v/100*0.35 }))}
                        unit="%"
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right panel */}
          <motion.div
            initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }}
            transition={{ delay:0.1 }}
            style={{
              width:'300px', height:'100%', background: C.surface,
              borderLeft:`1px solid ${C.border}`,
              display:'flex', flexDirection:'column',
              overflowY:'auto',
            }}
          >
            {/* Header */}
            <div style={{ padding:'28px 28px 20px', borderBottom:`1px solid ${C.border}` }}>
              <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                <div style={{ width:'5px', height:'5px', borderRadius:'50%', background: selectedProp?.accentColor }} />
                <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.42em', textTransform:'uppercase', color: selectedProp?.accentColor }}>
                  {selectedProp?.label}
                </span>
              </div>
              <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'13px', color:C.text, letterSpacing:'0.02em' }}>
                {propertyName || `My ${selectedProp?.label}`}
              </span>
            </div>

            <div style={{ padding:'24px 28px', flex:1 }}>
              {/* Steps */}
              <div style={{ display:'flex', flexDirection:'column', gap:'12px', marginBottom:'28px' }}>
                <StepPill n={1} label="Type" done />
                <StepPill n={2} label="Layout" done />
                <StepPill n={3} label="Customise" active />
              </div>

              {/* Floor heights */}
              <div style={{ marginBottom:'28px' }}>
                <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'8px', letterSpacing:'0.32em', textTransform:'uppercase', color:C.muted, display:'block', marginBottom:'12px' }}>Floor Heights</span>
                <div style={{ maxHeight:'100px', overflowY:'auto' }}>
                  {Array.from({ length: floors }, (_, f) => (
                    <div key={f} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
                      <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', color:C.muted, width:'24px', flexShrink:0 }}>F{f+1}</span>
                      <input type="range" min={20} max={100}
                        value={Math.round((floorSizes[f] ?? 0.45) * 200)}
                        onChange={(e) => setFloorSizes(prev => ({ ...prev, [f]: Number(e.target.value)/200 }))}
                        style={{ flex:1 }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Room size mode */}
              <div style={{ marginBottom:'28px' }}>
                <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'8px', letterSpacing:'0.32em', textTransform:'uppercase', color:C.muted, display:'block', marginBottom:'12px' }}>Room Sizes</span>
                <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'16px' }}>
                  {[
                    { val:'uniform', lbl:'Uniform (all same)' },
                    { val:'perFloor', lbl:'Per Floor' },
                    { val:'perRoom', lbl:'Per Room (click cell)' },
                  ].map(({ val, lbl }) => (
                    <button key={val} onClick={() => setSizeMode(val)} style={{
                      padding:'8px 12px', textAlign:'left',
                      fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.28em', textTransform:'uppercase',
                      background: sizeMode===val ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border:`1px solid ${sizeMode===val ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.05)'}`,
                      color: sizeMode===val ? C.text : C.faint,
                      cursor:'pointer', transition:'all 180ms ease',
                    }}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {sizeMode === 'uniform' && (
                  <Slider label="Room Width" value={unifRoomSize} min={1} max={3} onChange={setUnifRoomSize} />
                )}
                {sizeMode === 'perFloor' && (
                  <div style={{ maxHeight:'120px', overflowY:'auto' }}>
                    {Array.from({ length: floors }, (_, f) => (
                      <div key={f} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
                        <span style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', color:C.muted, width:'24px', flexShrink:0 }}>F{f+1}</span>
                        <input type="range" min={1} max={3}
                          value={floorSizes[`w-${f}`] ?? 1}
                          onChange={(e) => setFloorSizes(prev => ({ ...prev, [`w-${f}`]: Number(e.target.value) }))}
                          style={{ flex:1 }} />
                      </div>
                    ))}
                  </div>
                )}
                {sizeMode === 'perRoom' && (
                  <p style={{ fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.2em', color:'rgba(255,255,255,0.18)', lineHeight:1.6 }}>
                    Click any room cell in the 3D matrix to select and resize it individually.
                  </p>
                )}
              </div>
            </div>

            {/* CTA footer */}
            <div style={{ padding:'20px 28px', borderTop:`1px solid ${C.border}` }}>
              <button
                onClick={handleFinalize}
                style={{
                  width:'100%', padding:'13px 0',
                  fontFamily:"'Inter',sans-serif", fontSize:'9px', letterSpacing:'0.42em', textTransform:'uppercase',
                  background: selectedProp?.accentColor ? `${selectedProp.accentColor}18` : 'transparent',
                  border:`1px solid ${selectedProp?.accentColor ?? 'rgba(255,255,255,0.2)'}`,
                  color: selectedProp?.accentColor ?? C.text,
                  cursor:'pointer', transition:'all 200ms ease', marginBottom:'8px',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={(e) => e.currentTarget.style.background = selectedProp?.accentColor ? `${selectedProp.accentColor}18` : 'transparent'}
              >
                Create Property →
              </button>
              <button onClick={() => setStage('configure')} style={{ width:'100%', padding:'8px 0', fontFamily:"'Inter',sans-serif", fontSize:'8px', letterSpacing:'0.3em', textTransform:'uppercase', background:'transparent', border:'none', color:'rgba(255,255,255,0.15)', cursor:'pointer' }}>
                ← Back to Layout
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
