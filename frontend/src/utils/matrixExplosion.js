/**
 * @file matrixExplosion.js
 * @description Kinetic matrix explosion animation system for Mr. Heckles.
 *
 * Transforms a solid 3D building model into an open, spatially-distributed
 * matrix of individual room nodes — and collapses it back — entirely driven
 * by React-Three-Fiber's useFrame tick loop. Zero external tween dependencies.
 *
 * Exports:
 *   cubicEaseInOut(t)              — Pure easing function
 *   expoOut(t)                     — Pure easing function
 *   expoInOut(t)                   — Pure easing function
 *   computeCollapsedPositions()    — Pre-compute packed positions
 *   computeExplodedPositions()     — Pre-compute exploded target positions
 *   useMatrixExplosion()           — R3F useFrame animation hook
 *   RoomNode                       — Individual room visual mesh component
 *   ExplodedPropertyMatrix         — Drop-in replacement for a solid building group
 *
 * Integration:
 *   Replace <HostelBuilding /> (or any building component) with:
 *   <ExplodedPropertyMatrix
 *     unitsLayout={property.unitsLayout}
 *     isExploded={isExploded}
 *     onRoomClick={(unit) => setSelectedRoom(unit)}
 *   />
 */

import React, {
  useRef,
  useEffect,
  useMemo,
  useState,
  useCallback,
  createRef,
} from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════
//  SECTION 1 — Pure Easing Functions (zero dependencies)
// ═══════════════════════════════════════════════════════════════

/**
 * Cubic ease-in-out
 * Slow start → fast middle → slow end.
 * Classic, intentional, symmetrical — used for collapse direction.
 *
 * @param {number} t — Normalised time [0, 1]
 * @returns {number} Eased value [0, 1]
 */
export const cubicEaseInOut = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/**
 * Expo out
 * Explosive start → smooth, asymptotic deceleration.
 * Creates the dramatic "snap-apart" feel for the explosion direction.
 *
 * @param {number} t — Normalised time [0, 1]
 * @returns {number} Eased value [0, 1]
 */
export const expoOut = (t) => {
  t = Math.max(0, Math.min(1, t));
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
};

/**
 * Expo in-out
 * Symmetric exponential — sharp acceleration + sharp deceleration.
 * Used when both entry and exit need a premium kinetic feel.
 *
 * @param {number} t — Normalised time [0, 1]
 * @returns {number} Eased value [0, 1]
 */
export const expoInOut = (t) => {
  t = Math.max(0, Math.min(1, t));
  if (t === 0 || t === 1) return t;
  return t < 0.5
    ? Math.pow(2, 20 * t - 10) / 2
    : (2 - Math.pow(2, -20 * t + 10)) / 2;
};

/** Easing registry keyed by string identifier */
const EASING_MAP = {
  cubic:       cubicEaseInOut,
  expo_out:    expoOut,
  expo_inout:  expoInOut,
};

// ═══════════════════════════════════════════════════════════════
//  SECTION 2 — Position Computation Utilities
// ═══════════════════════════════════════════════════════════════

/**
 * Groups unitsLayout array by floorNumber.
 * @param {Array} unitsLayout
 * @returns {Object<number, Array>}
 */
const groupByFloor = (unitsLayout) =>
  unitsLayout.reduce((acc, unit) => {
    const key = unit.floorNumber;
    if (!acc[key]) acc[key] = [];
    acc[key].push(unit);
    return acc;
  }, {});

/**
 * computeCollapsedPositions
 *
 * Assigns each room node a compact "assembled" world position
 * matching the solid building's visual footprint.
 * Rooms on the same floor are arranged in a tight grid column/row pack.
 *
 * @param {Array}  unitsLayout  — Property.unitsLayout from DB
 * @param {Object} options
 * @param {number} options.unitWidth   — X spacing between rooms (default 1.1)
 * @param {number} options.unitHeight  — Y separation per floor (default 0.9)
 * @param {number} options.unitDepth   — Z spacing between rows (default 1.0)
 * @param {number} options.originX/Y/Z — World origin of the building centroid
 *
 * @returns {Array<PositionData>}  Flat array (index-matched to unitsLayout)
 *   where each entry is: { ...unit, floorIndex, roomIndex, collapsedPos }
 */
export const computeCollapsedPositions = (unitsLayout = [], options = {}) => {
  const {
    unitWidth  = 1.1,
    unitHeight = 0.9,
    unitDepth  = 1.0,
    originX    = 0,
    originY    = 0,
    originZ    = 0,
  } = options;

  const floorGroups = groupByFloor(unitsLayout);
  const floorKeys   = Object.keys(floorGroups).map(Number).sort((a, b) => a - b);

  return unitsLayout.map((unit) => {
    const fi        = floorKeys.indexOf(unit.floorNumber);
    const floorRooms = floorGroups[unit.floorNumber];
    const ri        = floorRooms.findIndex((r) => r.roomNumber === unit.roomNumber);
    const numRooms  = floorRooms.length;
    const cols      = Math.max(1, Math.ceil(Math.sqrt(numRooms)));
    const col       = ri % cols;
    const row       = Math.floor(ri / cols);
    const numRows   = Math.ceil(numRooms / cols);

    return {
      ...unit,
      floorIndex: fi,
      roomIndex:  ri,
      numRoomsOnFloor: numRooms,
      collapsedPos: new THREE.Vector3(
        originX + (col - (cols - 1) / 2) * unitWidth,
        originY + fi * unitHeight,
        originZ + (row - (numRows   - 1) / 2) * unitDepth
      ),
    };
  });
};

/**
 * computeExplodedPositions
 *
 * Assigns each room node a "spread apart" world position:
 *   • Y-axis: floors stack with a large vertical gap (floorGap)
 *   • XZ-plane: rooms fan out radially from each floor's centre
 *
 * @param {Array<PositionData>} positionData — output of computeCollapsedPositions
 * @param {Object} options
 * @param {number} options.floorGap    — Y metres between floors (default 2.8)
 * @param {number} options.roomSpread  — XZ radius from floor centre (default 2.6)
 * @param {string} options.spreadMode  — 'radial' | 'grid'
 * @param {number} options.gridPadding — Extra gap in grid mode (default 0.5)
 * @param {number} options.floorYBase  — World Y baseline of floor 0 (default 0)
 *
 * @returns {Array<THREE.Vector3>}  Index-matched exploded positions
 */
export const computeExplodedPositions = (positionData = [], options = {}) => {
  const {
    floorGap    = 2.8,
    roomSpread  = 2.6,
    spreadMode  = 'radial',
    gridPadding = 0.5,
    floorYBase  = 0,
  } = options;

  // Pre-group by floorIndex for numRooms lookup
  const floorMap = positionData.reduce((acc, unit) => {
    if (!acc[unit.floorIndex]) acc[unit.floorIndex] = [];
    acc[unit.floorIndex].push(unit);
    return acc;
  }, {});

  return positionData.map((unit) => {
    const { floorIndex, roomIndex } = unit;
    const numRooms = floorMap[floorIndex]?.length ?? 1;

    let rx = 0, rz = 0;

    if (spreadMode === 'radial') {
      // Equal-angle fan around floor centre
      // For single room: stays at centre
      if (numRooms > 1) {
        const angle  = (roomIndex / numRooms) * Math.PI * 2;
        rx = Math.cos(angle) * roomSpread;
        rz = Math.sin(angle) * roomSpread;
      }
    } else {
      // Grid spread — rooms arranged in rows/columns
      const cols   = Math.max(1, Math.ceil(Math.sqrt(numRooms)));
      const numRows = Math.ceil(numRooms / cols);
      const col    = roomIndex % cols;
      const row    = Math.floor(roomIndex / cols);
      const step   = roomSpread + gridPadding;
      rx = (col - (cols - 1) / 2) * step;
      rz = (row - (numRows - 1) / 2) * step;
    }

    return new THREE.Vector3(
      rx,
      floorYBase + floorIndex * floorGap,
      rz
    );
  });
};

// ═══════════════════════════════════════════════════════════════
//  SECTION 3 — Core Animation Hook: useMatrixExplosion
// ═══════════════════════════════════════════════════════════════

/**
 * useMatrixExplosion
 *
 * React-Three-Fiber hook that drives per-node position interpolation
 * via useFrame (no setInterval, no external tween library).
 *
 * Algorithm:
 *   On isExploded toggle:
 *     1. Snapshot current world positions of all nodeRefs as `fromPositions`.
 *     2. Compute target `toPositions` (exploded or collapsed).
 *     3. Record `startTime = performance.now()`.
 *     4. In each useFrame tick:
 *        a. For each node, compute per-floor stagger offset.
 *        b. Normalise elapsed time → t ∈ [0, 1].
 *        c. Apply easing function.
 *        d. THREE.Vector3.lerpVectors(from, to, easedT) → node.position.
 *     5. Mark animation complete when all nodes reach t = 1.
 *
 * @param {Object} params
 * @param {Array<React.RefObject>} params.nodeRefs
 *   Flat array of ref objects — index-matched to positionData.
 *   Each ref.current must be a THREE.Group/Mesh with a .position Vector3.
 *
 * @param {Array<PositionData>} params.positionData
 *   Output of computeCollapsedPositions(). Contains collapsedPos per node.
 *
 * @param {Array<THREE.Vector3>} params.explodedPositions
 *   Output of computeExplodedPositions(). Index-matched exploded targets.
 *
 * @param {boolean} params.isExploded
 *   When toggled true  → animate toward explodedPositions.
 *   When toggled false → animate toward collapsedPos.
 *
 * @param {Object} [params.options]
 *   duration        {number}  — Total animation window in ms  (default 1200)
 *   easingMode      {string}  — Easing for explosion           (default 'expo_out')
 *   collapseEasing  {string}  — Easing for collapse            (default 'cubic')
 *   floorDelay      {number}  — Stagger ms per floor index     (default 80)
 *
 * @returns {{ progress: number, isAnimating: boolean }}
 */
export const useMatrixExplosion = ({
  nodeRefs,
  positionData,
  explodedPositions,
  isExploded,
  options = {},
}) => {
  const {
    duration       = 1200,
    easingMode     = 'expo_out',
    collapseEasing = 'cubic',
    floorDelay     = 80,
  } = options;

  // Mutable animation state — stored in ref to avoid re-renders on every frame
  const anim = useRef({
    active:        false,
    startTime:     null,
    fromPositions: null,   // THREE.Vector3[]
    toPositions:   null,   // THREE.Vector3[]
    direction:     isExploded ? 1 : -1,
    progress:      isExploded ? 1 : 0,
  });

  const isMountedRef = useRef(false);

  // Trigger on isExploded toggle
  useEffect(() => {
    if (!isMountedRef.current) {
      // First mount — set initial positions without animation
      isMountedRef.current = true;
      const initialPositions = isExploded ? explodedPositions : positionData.map((d) => d.collapsedPos);
      nodeRefs.forEach((ref, i) => {
        if (ref.current && initialPositions[i]) {
          ref.current.position.copy(initialPositions[i]);
        }
      });
      anim.current.progress = isExploded ? 1 : 0;
      return;
    }

    // Snapshot current live positions as animation "from"
    const snapshot = nodeRefs.map((ref) =>
      ref.current ? ref.current.position.clone() : new THREE.Vector3()
    );

    anim.current.fromPositions = snapshot;
    anim.current.toPositions   = isExploded
      ? explodedPositions
      : positionData.map((d) => d.collapsedPos);
    anim.current.direction  = isExploded ? 1 : -1;
    anim.current.startTime  = performance.now();
    anim.current.active     = true;
  }, [isExploded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Animation tick
  useFrame(() => {
    const state = anim.current;
    if (!state.active || !state.startTime) return;
    if (!state.fromPositions || !state.toPositions) return;

    const easing = EASING_MAP[state.direction === 1 ? easingMode : collapseEasing]
                   ?? cubicEaseInOut;

    let allDone = true;

    nodeRefs.forEach((ref, i) => {
      if (!ref.current) return;

      const unit = positionData[i];
      if (!unit) return;

      // Per-floor stagger: higher floors animate later during explosion,
      // but lead during collapse (reversed stagger for cinematic effect)
      const staggerMs = state.direction === 1
        ? unit.floorIndex * floorDelay                               // Explosion: bottom-up
        : (Math.max(...positionData.map((u) => u.floorIndex)) - unit.floorIndex) * floorDelay; // Collapse: top-down

      const elapsed         = performance.now() - state.startTime;
      const adjustedElapsed = Math.max(0, elapsed - staggerMs);
      // Compress effective duration so staggered nodes still finish within total window
      const effectiveDur    = Math.max(duration - staggerMs * 0.6, duration * 0.5);
      const rawT            = Math.min(adjustedElapsed / effectiveDur, 1);
      const easedT          = easing(rawT);

      if (rawT < 1) allDone = false;

      const from = state.fromPositions[i];
      const to   = state.toPositions[i];

      if (from && to) {
        ref.current.position.lerpVectors(from, to, easedT);
      }

      // Canonical progress from first node
      if (i === 0) state.progress = rawT;
    });

    if (allDone) {
      state.active   = false;
      state.progress = state.direction === 1 ? 1 : 0;
      // Snap all nodes to exact targets (eliminates floating point drift)
      nodeRefs.forEach((ref, i) => {
        if (ref.current && state.toPositions[i]) {
          ref.current.position.copy(state.toPositions[i]);
        }
      });
    }
  });

  // Return live-reading accessors (not React state — no re-render cost)
  return {
    get progress()    { return anim.current.progress; },
    get isAnimating() { return anim.current.active;   },
  };
};

// ═══════════════════════════════════════════════════════════════
//  SECTION 4 — RoomNode Visual Component
// ═══════════════════════════════════════════════════════════════

/** Status → color mapping */
const STATUS_COLORS = {
  vacant:      '#C8D4DC',
  occupied:    '#D4A574',
  maintenance: '#C4622D',
};

/** UnitType → box size [w, h, d] */
const TYPE_DIMENSIONS = {
  '1BHK':        [0.85, 0.62, 0.75],
  '2BHK':        [0.95, 0.68, 0.82],
  'studio':      [0.72, 0.58, 0.68],
  'shared_room': [0.90, 0.58, 0.80],
};

/**
 * RoomNode
 * Individual room cell rendered as a coloured, labeled box.
 * Renders a small Html label on hover displaying unit details.
 */
const RoomNode = ({ unit, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef();

  const color  = STATUS_COLORS[unit.status] ?? '#CCCCCC';
  const dims   = TYPE_DIMENSIONS[unit.unitType] ?? [0.85, 0.62, 0.75];

  // Subtle breathing animation on hovered node
  useFrame((_, delta) => {
    if (!meshRef.current) return;
    const targetScale = hovered ? 1.08 : 1.0;
    meshRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      delta * 6
    );
  });

  return (
    <group
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true);  document.body.style.cursor = 'pointer'; }}
      onPointerOut={(e)  => { e.stopPropagation(); setHovered(false); document.body.style.cursor = 'default'; }}
      onClick={(e)       => { e.stopPropagation(); onClick?.(unit);  }}
    >
      {/* Room volume */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={dims} />
        <meshStandardMaterial
          color={color}
          roughness={0.65}
          metalness={0.05}
          emissive={hovered ? color : '#000000'}
          emissiveIntensity={hovered ? 0.18 : 0}
        />
      </mesh>

      {/* Thin border frame — visible on hover */}
      {hovered && (
        <mesh>
          <boxGeometry args={[dims[0] + 0.04, dims[1] + 0.04, dims[2] + 0.04]} />
          <meshBasicMaterial color="#FFFFFF" wireframe />
        </mesh>
      )}

      {/* Room label (hover only) */}
      {hovered && (
        <Html
          center
          position={[0, dims[1] / 2 + 0.22, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontSize: '9px',
            fontWeight: '300',
            letterSpacing: '0.25em',
            color: '#FFFFFF',
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            borderTop: '1px solid rgba(255,255,255,0.12)',
          }}>
            <span style={{ opacity: 0.5 }}>RM </span>
            <span>{unit.roomNumber}</span>
            <span style={{ margin: '0 6px', opacity: 0.3 }}>·</span>
            <span style={{ opacity: 0.7 }}>{unit.status}</span>
          </div>
        </Html>
      )}

      {/* Persistent floor indicator dot (visible when not hovered) */}
      {!hovered && (
        <mesh position={[0, dims[1] / 2 + 0.04, 0]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </group>
  );
};

// ═══════════════════════════════════════════════════════════════
//  SECTION 5 — ExplodedPropertyMatrix (Drop-in Building Replacement)
// ═══════════════════════════════════════════════════════════════

/**
 * ExplodedPropertyMatrix
 *
 * Drop-in replacement for a solid building component (HostelBuilding, etc).
 * Renders all rooms from unitsLayout as individual RoomNode instances,
 * wiring them to the useMatrixExplosion hook.
 *
 * Props:
 *   unitsLayout   {Array}    — Property.unitsLayout from DB
 *   isExploded    {boolean}  — Toggle to trigger explosion/collapse
 *   onRoomClick   {Function} — Called with unit object on room click
 *   explosionOpts {Object}   — Passed to computeExplodedPositions
 *   collapseOpts  {Object}   — Passed to computeCollapsedPositions
 *   animOpts      {Object}   — Passed to useMatrixExplosion options
 */
export const ExplodedPropertyMatrix = ({
  unitsLayout = [],
  isExploded  = false,
  onRoomClick,
  explosionOpts = {},
  collapseOpts  = {},
  animOpts      = {},
}) => {
  // Pre-compute both position sets (memoised — only recomputes when unitsLayout changes)
  const positionData = useMemo(
    () => computeCollapsedPositions(unitsLayout, collapseOpts),
    [unitsLayout, JSON.stringify(collapseOpts)]  // eslint-disable-line
  );

  const explodedPositions = useMemo(
    () => computeExplodedPositions(positionData, explosionOpts),
    [positionData, JSON.stringify(explosionOpts)] // eslint-disable-line
  );

  // Create stable refs for every room node
  const nodeRefs = useMemo(
    () => positionData.map(() => createRef()),
    [positionData.length]  // eslint-disable-line
  );

  // Wire the animation hook
  useMatrixExplosion({
    nodeRefs,
    positionData,
    explodedPositions,
    isExploded,
    options: {
      duration:       1200,
      easingMode:     'expo_out',
      collapseEasing: 'cubic',
      floorDelay:     80,
      ...animOpts,
    },
  });

  const handleRoomClick = useCallback(
    (unit) => onRoomClick?.(unit),
    [onRoomClick]
  );

  if (positionData.length === 0) {
    return null; // No units — render nothing
  }

  return (
    <group>
      {positionData.map((unit, i) => (
        <group key={`${unit.floorNumber}-${unit.roomNumber}`} ref={nodeRefs[i]}>
          <RoomNode unit={unit} onClick={handleRoomClick} />
        </group>
      ))}
    </group>
  );
};

export default ExplodedPropertyMatrix;
