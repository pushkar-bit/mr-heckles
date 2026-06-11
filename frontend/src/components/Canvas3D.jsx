/**
 * @file ThreePropertyCanvas.jsx
 * @description Mr. Heckles — Master Frontend Dashboard Canvas.
 *
 * Three procedural "digital twin" property archetypes rendered side-by-side
 * on a zero-clutter near-black plane:
 *
 *   1. HOSTEL      — Terracotta brick mass + procedural jali lattice facade
 *   2. RESIDENCY   — Stacked sliding glass block architecture
 *   3. RESORT & HOTEL — Asymmetric luxury pavilion villa composition
 *
 * Interaction matrix:
 *   • OrbitControls  — 360° drag with high-inertia dampening (premium feel)
 *   • Hover          — Smooth 300ms opacity fade-in of crisp label above structure
 *   • Click          — Smooth camera lerp to isolate & lock onto clicked property
 *   • Double-click / Escape — Reset camera to neutral panorama position
 *
 * Dependencies:  three  @react-three/fiber  @react-three/drei
 * Install:  npm install three @react-three/fiber @react-three/drei
 */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Environment } from '@react-three/drei';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────
//  Constants — Scene Layout
// ─────────────────────────────────────────────────────────────

const PROPERTY_SPACING = 7.5;

const PROPERTIES = [
  {
    id: 'hostel',
    label: 'HOSTEL',
    position: [-PROPERTY_SPACING, 0, 0],
    cameraPos: new THREE.Vector3(-PROPERTY_SPACING, 3.5, 6.5),
    cameraTarget: new THREE.Vector3(-PROPERTY_SPACING, 1.2, 0),
  },
  {
    id: 'residency',
    label: 'RESIDENCY',
    position: [0, 0, 0],
    cameraPos: new THREE.Vector3(0, 3.5, 6.5),
    cameraTarget: new THREE.Vector3(0, 1.5, 0),
  },
  {
    id: 'resort',
    label: 'RESORT & HOTEL',
    position: [PROPERTY_SPACING, 0, 0],
    cameraPos: new THREE.Vector3(PROPERTY_SPACING, 3.5, 6.5),
    cameraTarget: new THREE.Vector3(PROPERTY_SPACING, 0.8, 0),
  },
];

const DEFAULT_CAMERA_POS = new THREE.Vector3(0, 5, 18);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0.5, 0);

// ─────────────────────────────────────────────────────────────
//  Shared Materials (memoised at module scope)
// ─────────────────────────────────────────────────────────────

const MAT = {
  // Hostel terracotta
  terracotta: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#B5532A'),
    roughness: 0.88,
    metalness: 0.0,
  }),
  terracottaDark: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8C3E1C'),
    roughness: 0.9,
    metalness: 0.0,
  }),
  // Hostel jali (screen)
  jali: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#D4845A'),
    roughness: 0.6,
    metalness: 0.05,
    side: THREE.DoubleSide,
  }),
  // Residency glass panels
  glass: new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#A8C8E8'),
    transmission: 0.82,
    roughness: 0.02,
    metalness: 0.12,
    thickness: 0.4,
    ior: 1.5,
    reflectivity: 0.9,
    transparent: true,
    opacity: 0.92,
  }),
  glassFrame: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#E8EDF2'),
    roughness: 0.15,
    metalness: 0.7,
  }),
  // Resort villa
  villaWhite: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#F0EDE8'),
    roughness: 0.55,
    metalness: 0.0,
  }),
  villaAccent: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#D4C4A8'),
    roughness: 0.6,
    metalness: 0.0,
  }),
  villaRoof: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2A2A2A'),
    roughness: 0.7,
    metalness: 0.05,
  }),
  poolWater: new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#4A9EBF'),
    transmission: 0.6,
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  }),
  // Ground plane
  ground: new THREE.MeshStandardMaterial({
    color: new THREE.Color('#111111'),
    roughness: 1.0,
    metalness: 0.0,
  }),
  shadow: new THREE.ShadowMaterial({ opacity: 0.35 }),
};

// ─────────────────────────────────────────────────────────────
//  Sub-component: Procedural Jali Lattice (Hostel Facade)
//
//  Generates an M×N grid of thin cross bars — horizontal rails +
//  vertical stiles — mimicking a traditional Indian jali screen.
// ─────────────────────────────────────────────────────────────

const JaliLattice = ({ width = 2.6, height = 2.2, cols = 7, rows = 5 }) => {
  const bars = useMemo(() => {
    const items = [];
    const barThickness = 0.045;
    const depth = 0.06;
    const colSpacing = width / (cols + 1);
    const rowSpacing = height / (rows + 1);

    // Vertical stiles
    for (let c = 1; c <= cols; c++) {
      items.push({
        key: `v-${c}`,
        size: [barThickness, height + 0.1, depth],
        pos: [-width / 2 + c * colSpacing, 0, 0],
      });
    }
    // Horizontal rails
    for (let r = 1; r <= rows; r++) {
      items.push({
        key: `h-${r}`,
        size: [width + 0.1, barThickness, depth],
        pos: [0, -height / 2 + r * rowSpacing, 0],
      });
    }
    // Diamond accent nodes at intersections (every other)
    for (let c = 2; c <= cols - 1; c += 2) {
      for (let r = 2; r <= rows - 1; r += 2) {
        items.push({
          key: `d-${c}-${r}`,
          size: [0.11, 0.11, depth + 0.02],
          pos: [
            -width / 2 + c * colSpacing,
            -height / 2 + r * rowSpacing,
            0,
          ],
          rot: [0, 0, Math.PI / 4],
        });
      }
    }
    return items;
  }, [width, height, cols, rows]);

  return (
    <group>
      {bars.map(({ key, size, pos, rot = [0, 0, 0] }) => (
        <mesh
          key={key}
          position={pos}
          rotation={rot}
          material={MAT.jali}
          castShadow
        >
          <boxGeometry args={size} />
        </mesh>
      ))}
    </group>
  );
};

// ─────────────────────────────────────────────────────────────
//  Digital Twin 1: HOSTEL
//  Terracotta brick mass + jali lattice fascia + window bays
// ─────────────────────────────────────────────────────────────

const HostelBuilding = () => (
  <group>
    {/* Main body */}
    <mesh position={[0, 1.5, 0]} castShadow receiveShadow material={MAT.terracotta}>
      <boxGeometry args={[3.2, 3.0, 1.8]} />
    </mesh>

    {/* Darker plinth / base course */}
    <mesh position={[0, 0.2, 0]} castShadow receiveShadow material={MAT.terracottaDark}>
      <boxGeometry args={[3.4, 0.4, 2.0]} />
    </mesh>

    {/* Flat roof slab */}
    <mesh position={[0, 3.12, 0]} castShadow material={MAT.terracottaDark}>
      <boxGeometry args={[3.5, 0.12, 2.1]} />
    </mesh>

    {/* Roof parapet */}
    <mesh position={[0, 3.28, 0]} castShadow material={MAT.terracotta}>
      <boxGeometry args={[3.5, 0.18, 0.12]} />
    </mesh>
    <mesh position={[0, 3.28, 1.05]} castShadow material={MAT.terracotta}>
      <boxGeometry args={[3.5, 0.18, 0.12]} />
    </mesh>

    {/* Window cutout proxies (dark recesses) */}
    {[
      [-0.95, 1.5, 0.91],
      [0.95, 1.5, 0.91],
      [-0.95, 2.55, 0.91],
      [0.95, 2.55, 0.91],
    ].map(([x, y, z], i) => (
      <mesh key={i} position={[x, y, z]} material={MAT.terracottaDark}>
        <boxGeometry args={[0.55, 0.62, 0.04]} />
      </mesh>
    ))}

    {/* Jali lattice overlay — front face */}
    <group position={[0, 1.55, 0.94]}>
      <JaliLattice width={2.6} height={2.2} cols={7} rows={5} />
    </group>

    {/* Side jali (partial) */}
    <group position={[1.61, 1.55, 0]} rotation={[0, Math.PI / 2, 0]}>
      <JaliLattice width={1.5} height={2.2} cols={4} rows={5} />
    </group>

    {/* Ground shadow catcher */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
      <planeGeometry args={[4.5, 3]} />
      <shadowMaterial opacity={0.3} />
    </mesh>
  </group>
);

// ─────────────────────────────────────────────────────────────
//  Digital Twin 2: RESIDENCY
//  Stacked offset glass-slab tower with metal frames
// ─────────────────────────────────────────────────────────────

const GLASS_SLABS = [
  // [width, height, depth, x-offset, y-base, z-offset]
  [3.2, 0.85, 1.6, 0, 0.0, 0],
  [2.8, 0.85, 1.4, 0.28, 0.9, -0.05],
  [2.4, 0.85, 1.25, -0.2, 1.8, 0.08],
  [1.9, 0.75, 1.1, 0.15, 2.7, -0.04],
  [1.4, 0.55, 0.9, -0.1, 3.5, 0.0],
];

const ResidencyBuilding = () => (
  <group>
    {/* Plinth */}
    <mesh position={[0, 0.15, 0]} castShadow receiveShadow material={MAT.glassFrame}>
      <boxGeometry args={[3.5, 0.3, 1.8]} />
    </mesh>

    {GLASS_SLABS.map(([w, h, d, ox, yBase, oz], i) => (
      <group key={i} position={[ox, yBase + h / 2 + 0.3, oz]}>
        {/* Glass panel face */}
        <mesh castShadow receiveShadow material={MAT.glass}>
          <boxGeometry args={[w, h, d]} />
        </mesh>
        {/* Metal frame border (thin outer rim) */}
        <mesh material={MAT.glassFrame}>
          <boxGeometry args={[w + 0.04, h + 0.04, d + 0.04]} />
        </mesh>
        {/* Glass inner fill (slightly smaller to show frame) */}
        <mesh material={MAT.glass}>
          <boxGeometry args={[w - 0.04, h - 0.04, d - 0.04]} />
        </mesh>

        {/* Horizontal floor slab divider */}
        <mesh position={[0, h / 2 - 0.025, 0]} material={MAT.glassFrame}>
          <boxGeometry args={[w + 0.06, 0.06, d + 0.06]} />
        </mesh>

        {/* Vertical mullion lines */}
        {[-w / 4, 0, w / 4].map((mx, mi) => (
          <mesh key={mi} position={[mx, 0, d / 2 + 0.01]} material={MAT.glassFrame}>
            <boxGeometry args={[0.04, h, 0.03]} />
          </mesh>
        ))}
      </group>
    ))}

    {/* Penthouse cap */}
    <mesh position={[0.1, 4.1, 0]} castShadow material={MAT.glassFrame}>
      <boxGeometry args={[1.2, 0.1, 0.8]} />
    </mesh>
  </group>
);

// ─────────────────────────────────────────────────────────────
//  Digital Twin 3: RESORT & HOTEL
//  Asymmetric luxury pavilion — low horizontal mass + wings
// ─────────────────────────────────────────────────────────────

const ResortBuilding = () => (
  <group>
    {/* Central villa body — low & wide */}
    <mesh position={[0, 0.75, 0]} castShadow receiveShadow material={MAT.villaWhite}>
      <boxGeometry args={[3.8, 1.5, 2.0]} />
    </mesh>

    {/* Thin flat roof with overhang */}
    <mesh position={[0, 1.56, 0]} castShadow material={MAT.villaRoof}>
      <boxGeometry args={[4.4, 0.08, 2.6]} />
    </mesh>

    {/* Roof overhang shadow line */}
    <mesh position={[0, 1.52, 0]} material={MAT.villaAccent}>
      <boxGeometry args={[4.42, 0.04, 2.62]} />
    </mesh>

    {/* Left pavilion wing — lower offset */}
    <mesh position={[-2.6, 0.55, 0.2]} castShadow receiveShadow material={MAT.villaAccent}>
      <boxGeometry args={[1.5, 1.1, 1.6]} />
    </mesh>
    {/* Left wing flat roof */}
    <mesh position={[-2.6, 1.12, 0.2]} castShadow material={MAT.villaRoof}>
      <boxGeometry args={[1.9, 0.07, 2.0]} />
    </mesh>

    {/* Right utility block — taller, recessed */}
    <mesh position={[2.4, 0.95, -0.15]} castShadow receiveShadow material={MAT.villaWhite}>
      <boxGeometry args={[1.2, 1.9, 1.7]} />
    </mesh>
    {/* Right block roof */}
    <mesh position={[2.4, 1.96, -0.15]} castShadow material={MAT.villaRoof}>
      <boxGeometry args={[1.5, 0.07, 2.0]} />
    </mesh>

    {/* Entry canopy / porte-cochère */}
    <mesh position={[0, 1.35, 1.35]} castShadow material={MAT.villaRoof}>
      <boxGeometry args={[2.0, 0.06, 0.9]} />
    </mesh>
    {/* Canopy slim columns */}
    {[-0.8, 0.8].map((cx, ci) => (
      <mesh key={ci} position={[cx, 0.67, 1.35]} castShadow material={MAT.villaAccent}>
        <boxGeometry args={[0.08, 1.36, 0.08]} />
      </mesh>
    ))}

    {/* Swimming pool (ground level, front-right) */}
    <mesh position={[1.6, 0.02, 1.5]} receiveShadow material={MAT.poolWater}>
      <boxGeometry args={[2.0, 0.12, 1.1]} />
    </mesh>
    {/* Pool coping rim */}
    <mesh position={[1.6, 0.085, 1.5]} material={MAT.villaAccent}>
      <boxGeometry args={[2.1, 0.05, 1.2]} />
    </mesh>

    {/* Low boundary wall fragments */}
    {[
      [-2.0, 1.6], [2.8, 1.6], [-2.0, -0.9], [2.8, -0.9],
    ].map(([wx, wz], wi) => (
      <mesh key={wi} position={[wx, 0.22, wz]} castShadow material={MAT.villaAccent}>
        <boxGeometry args={[0.12, 0.45, 0.6]} />
      </mesh>
    ))}

    {/* Landscape detail: thin hedge strips */}
    {[-1.5, -0.5, 0.5].map((hx, hi) => (
      <mesh key={hi} position={[hx, 0.08, 1.85]} material={new THREE.MeshStandardMaterial({ color: '#2D5A27', roughness: 0.95 })}>
        <boxGeometry args={[0.6, 0.18, 0.25]} />
      </mesh>
    ))}
  </group>
);

// ─────────────────────────────────────────────────────────────
//  Component: Property Label (HTML overlay, hover-faded)
// ─────────────────────────────────────────────────────────────

const PropertyLabel = ({ label, isHovered, yOffset = 3.9 }) => (
  <Html
    center
    position={[0, yOffset, 0]}
    style={{ pointerEvents: 'none', userSelect: 'none' }}
  >
    <span
      style={{
        fontFamily: "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        fontSize: '11px',
        fontWeight: '300',
        letterSpacing: '0.35em',
        color: '#FFFFFF',
        opacity: isHovered ? 1 : 0,
        transition: 'opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
        display: 'block',
        padding: '4px 0',
        textShadow: '0 0 20px rgba(255,255,255,0.25)',
      }}
    >
      {label}
    </span>
    {/* Thin divider line below label */}
    <span
      style={{
        display: 'block',
        width: isHovered ? '100%' : '0%',
        height: '1px',
        background: 'rgba(255,255,255,0.35)',
        margin: '2px auto 0',
        transition: 'width 400ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    />
  </Html>
);

// ─────────────────────────────────────────────────────────────
//  Component: Invisible Hit-Test Bounding Box
//  Catches pointer events for the entire property group.
// ─────────────────────────────────────────────────────────────

const HitBox = ({ size = [4, 4.5, 2.5], onClick, onHover }) => (
  <mesh
    position={[0, size[1] / 2, 0]}
    onClick={onClick}
    onPointerOver={(e) => { e.stopPropagation(); onHover(true); }}
    onPointerOut={(e) => { e.stopPropagation(); onHover(false); }}
    visible={false}
  >
    <boxGeometry args={size} />
    <meshBasicMaterial transparent opacity={0} />
  </mesh>
);

// ─────────────────────────────────────────────────────────────
//  Component: Property Group
//  Wraps a digital twin with its label and hit-test box.
// ─────────────────────────────────────────────────────────────

const PropertyGroup = ({ config, isSelected, onSelect, children, hitBoxSize, labelYOffset }) => {
  const [hovered, setHovered] = useState(false);

  const handleClick = useCallback(
    (e) => {
      e.stopPropagation();
      onSelect(isSelected ? null : config.id);
    },
    [config.id, isSelected, onSelect]
  );

  return (
    <group
      position={config.position}
      onPointerOver={() => document.body.style.cursor = 'pointer'}
      onPointerOut={() => document.body.style.cursor = 'default'}
    >
      {children}
      <HitBox
        size={hitBoxSize}
        onClick={handleClick}
        onHover={setHovered}
      />
      <PropertyLabel
        label={config.label}
        isHovered={hovered || isSelected}
        yOffset={labelYOffset}
      />
    </group>
  );
};

// ─────────────────────────────────────────────────────────────
//  Component: Camera Controller
//  Smoothly lerps camera position and OrbitControls target.
// ─────────────────────────────────────────────────────────────

const LERP_FACTOR = 0.055; // Low = heavy/premium feel

const CameraController = ({ targetPos, targetLook, orbitRef }) => {
  const { camera } = useThree();

  const lerpPos = useRef(camera.position.clone());
  const lerpLook = useRef(targetLook.clone());

  useFrame(() => {
    // Lerp camera position
    lerpPos.current.lerp(targetPos, LERP_FACTOR);
    camera.position.copy(lerpPos.current);

    // Lerp orbit target
    if (orbitRef.current) {
      lerpLook.current.lerp(targetLook, LERP_FACTOR);
      orbitRef.current.target.copy(lerpLook.current);
      orbitRef.current.update();
    }
  });

  return null;
};

// ─────────────────────────────────────────────────────────────
//  Component: Scene (inner — has access to R3F context)
// ─────────────────────────────────────────────────────────────

const Scene = ({ selectedId, onSelect }) => {
  const orbitRef = useRef();

  // Resolve current camera targets based on selection state
  const { targetPos, targetLook } = useMemo(() => {
    if (!selectedId) {
      return {
        targetPos: DEFAULT_CAMERA_POS.clone(),
        targetLook: DEFAULT_CAMERA_TARGET.clone(),
      };
    }
    const prop = PROPERTIES.find((p) => p.id === selectedId);
    return {
      targetPos: prop.cameraPos.clone(),
      targetLook: prop.cameraTarget.clone(),
    };
  }, [selectedId]);

  return (
    <>
      {/* ── Lighting ─────────────────────────────────────── */}
      <ambientLight intensity={0.55} color="#E8EEF8" />

      {/* Key light — warm angle */}
      <directionalLight
        position={[8, 14, 8]}
        intensity={1.8}
        color="#FFF5E8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-bias={-0.0005}
      />

      {/* Fill light — cool opposite */}
      <directionalLight position={[-6, 8, -4]} intensity={0.6} color="#C8D8F0" />

      {/* Rim/back light */}
      <directionalLight position={[0, 3, -10]} intensity={0.4} color="#FFFFFF" />

      {/* Point accent — warm glow between buildings */}
      <pointLight position={[0, 6, 4]} intensity={0.8} color="#FFE8C8" distance={25} />

      {/* ── Ground Plane ─────────────────────────────────── */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        material={MAT.ground}
      >
        <planeGeometry args={[80, 80]} />
      </mesh>

      {/* Ground shadow catcher overlay */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.001, 0]}
        receiveShadow
      >
        <planeGeometry args={[80, 80]} />
        <shadowMaterial opacity={0.4} />
      </mesh>

      {/* Thin ground grid lines — subtle depth cue */}
      <gridHelper
        args={[60, 60, '#1A1A1A', '#161616']}
        position={[0, 0.002, 0]}
      />

      {/* ── Digital Twin 1: HOSTEL ───────────────────────── */}
      <PropertyGroup
        config={PROPERTIES[0]}
        isSelected={selectedId === 'hostel'}
        onSelect={onSelect}
        hitBoxSize={[4.2, 4.5, 2.8]}
        labelYOffset={4.0}
      >
        <HostelBuilding />
      </PropertyGroup>

      {/* ── Digital Twin 2: RESIDENCY ────────────────────── */}
      <PropertyGroup
        config={PROPERTIES[1]}
        isSelected={selectedId === 'residency'}
        onSelect={onSelect}
        hitBoxSize={[3.8, 5.0, 2.2]}
        labelYOffset={4.6}
      >
        <ResidencyBuilding />
      </PropertyGroup>

      {/* ── Digital Twin 3: RESORT & HOTEL ───────────────── */}
      <PropertyGroup
        config={PROPERTIES[2]}
        isSelected={selectedId === 'resort'}
        onSelect={onSelect}
        hitBoxSize={[5.2, 3.2, 3.0]}
        labelYOffset={3.0}
      >
        <ResortBuilding />
      </PropertyGroup>

      {/* ── Camera Controller (lerp engine) ──────────────── */}
      <CameraController
        targetPos={targetPos}
        targetLook={targetLook}
        orbitRef={orbitRef}
      />

      {/* ── Orbit Controls ───────────────────────────────── */}
      <OrbitControls
        ref={orbitRef}
        enableDamping
        dampingFactor={0.032}        // Very low = heavy inertia / premium feel
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        panSpeed={0.4}
        minDistance={4}
        maxDistance={32}
        minPolarAngle={0.15}         // Prevent flipping beneath ground
        maxPolarAngle={Math.PI / 2.08}
        makeDefault
      />
    </>
  );
};

// ─────────────────────────────────────────────────────────────
//  Root Export: ThreePropertyCanvas
// ─────────────────────────────────────────────────────────────

/**
 * Self-contained, full-viewport Three.js canvas for the Mr. Heckles
 * property dashboard. Drop into any React page as a leaf component.
 *
 * Props:
 *   onPropertySelect  {Function}  Called with property id string or null
 *                                 when a twin is clicked/deselected.
 *   theme             {'dark'|'light'}  Background mode. Default: 'dark'
 */
const ThreePropertyCanvas = ({
  onPropertySelect = () => {},
  theme = 'dark',
}) => {
  const [selectedId, setSelectedId] = useState(null);

  // Reset on Escape keypress
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') handleSelect(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const handleSelect = useCallback(
    (id) => {
      setSelectedId(id);
      onPropertySelect(id);
    },
    [onPropertySelect]
  );

  const bg = theme === 'dark' ? '#0A0A0A' : '#FFFFFF';

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        background: bg,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Wordmark ─────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          pointerEvents: 'none',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontFamily: "'Inter', 'Helvetica Neue', Helvetica, sans-serif",
            fontSize: '11px',
            fontWeight: '300',
            letterSpacing: '0.55em',
            color: theme === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)',
            textTransform: 'uppercase',
          }}
        >
          MR. HECKLES
        </span>
      </div>

      {/* ── Selection Indicator ──────────────────────────────── */}
      {selectedId && (
        <div
          style={{
            position: 'absolute',
            bottom: '36px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            textAlign: 'center',
            animation: 'fadeIn 0.4s ease',
          }}
        >
          <button
            onClick={() => handleSelect(null)}
            style={{
              fontFamily: "'Inter', 'Helvetica Neue', Helvetica, sans-serif",
              fontSize: '9px',
              fontWeight: '400',
              letterSpacing: '0.4em',
              color: 'rgba(255,255,255,0.45)',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              padding: '8px 20px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              transition: 'all 200ms ease',
            }}
            onMouseEnter={(e) => {
              e.target.style.color = 'rgba(255,255,255,0.8)';
              e.target.style.borderColor = 'rgba(255,255,255,0.35)';
            }}
            onMouseLeave={(e) => {
              e.target.style.color = 'rgba(255,255,255,0.45)';
              e.target.style.borderColor = 'rgba(255,255,255,0.12)';
            }}
          >
            ESC &nbsp;·&nbsp; Reset View
          </button>
        </div>
      )}

      {/* ── Hint text (shown only when nothing is selected) ── */}
      {!selectedId && (
        <div
          style={{
            position: 'absolute',
            bottom: '36px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: "'Inter', 'Helvetica Neue', Helvetica, sans-serif",
              fontSize: '9px',
              fontWeight: '300',
              letterSpacing: '0.35em',
              color: theme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.2)',
              textTransform: 'uppercase',
            }}
          >
            Drag to orbit &nbsp;·&nbsp; Click to select
          </span>
        </div>
      )}

      {/* Fade-in keyframe injected once */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(6px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>

      {/* ── Three.js Canvas ──────────────────────────────────── */}
      <Canvas
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        camera={{
          position: DEFAULT_CAMERA_POS.toArray(),
          fov: 42,
          near: 0.1,
          far: 200,
        }}
        onPointerMissed={() => handleSelect(null)}
        style={{ background: bg }}
      >
        <Scene selectedId={selectedId} onSelect={handleSelect} />
      </Canvas>
    </div>
  );
};

export default ThreePropertyCanvas;
