import { Canvas, useFrame } from "@react-three/fiber";
import {
  Environment,
  Float,
  MeshTransmissionMaterial,
  OrbitControls,
  Sparkles,
  Stars,
  Trail,
} from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import "./MemoryOrbGlobe.css";

// Ported from the equoria-journal side project's MemoryOrbGlobe -- a full 3D
// "memory planet": a glowing core with small orbiting pearls, one per
// journal entry, colored by mood. Journal entries feed in as `orbs`
// ({ id, date, color, label, emotion, core }) built by MoodGlobeLauncher from
// the same mood-calendar data the calendar already fetches.

const CORE_RADIUS = 1.05;
const SHELL_RADII = [2.55, 3.05, 3.55];
const ORB_SIZE = 0.1;

function fibonacciDirections(count) {
  const dirs = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(count - 1, 1)) * 2;
    const r = Math.sqrt(Math.max(1 - y * y, 0));
    const theta = golden * i;
    dirs.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize());
  }
  return dirs;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Quiet luminous heart of the memory field. */
function MemoryCore() {
  const lightRef = useRef(null);

  useFrame((state) => {
    const pulse = 0.9 + Math.sin(state.clock.elapsedTime * 0.85) * 0.15;
    if (lightRef.current) lightRef.current.intensity = pulse;
  });

  return (
    <group>
      <pointLight ref={lightRef} color="#c8e8f5" distance={8} intensity={1} />

      {/* Soft solid pearl */}
      <mesh>
        <sphereGeometry args={[CORE_RADIUS * 0.72, 64, 64]} />
        <meshStandardMaterial
          color="#eaf6fc"
          emissive="#7eb8d0"
          emissiveIntensity={0.35}
          roughness={0.35}
          metalness={0.05}
        />
      </mesh>

      {/* Clear glass shell */}
      <mesh>
        <sphereGeometry args={[CORE_RADIUS, 64, 64]} />
        <MeshTransmissionMaterial
          samples={6}
          resolution={256}
          transmission={0.95}
          roughness={0.12}
          thickness={1.1}
          ior={1.4}
          chromaticAberration={0.02}
          anisotropicBlur={0.2}
          color="#d0ebf5"
        />
      </mesh>
    </group>
  );
}

function MemoryPearl({
  direction,
  shellRadius,
  color,
  orb,
  index,
  selected,
  dimmed,
  onSelect,
  introReady,
  registerRef,
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const lightRef = useRef(null);

  const phase = index * 0.41;
  const orbitSpeed = 0.045 + (index % 7) * 0.006;
  const scaleAnim = useRef(0);
  const emissiveAnim = useRef(0.25);
  const opacityAnim = useRef(0.96);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const stagger = Math.min(1, Math.max(0, (t * 0.55 - index * 0.008) / 1.1));
    const intro = introReady ? THREE.MathUtils.smootherstep(stagger, 0, 1) : 0;

    const angle = t * orbitSpeed + phase;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0.15, 1, 0.08).normalize(), angle);
    const radius = shellRadius + (selected ? 0.18 : hovered ? 0.08 : 0);
    const pos = direction.clone().applyQuaternion(q).multiplyScalar(radius);
    pos.y += Math.sin(t * 0.9 + phase) * 0.05;

    if (groupRef.current) groupRef.current.position.copy(pos);

    const coreBoost = orb.core ? 1.45 : 1;
    const targetScale = (selected ? 1.35 : hovered ? 1.15 : 1) * coreBoost * intro;
    const breath = orb.core ? 1 + Math.sin(t * 1.9 + phase) * 0.06 : 1 + Math.sin(t * 1.4 + phase) * 0.02;
    scaleAnim.current = lerp(scaleAnim.current, targetScale * breath, 0.1);
    emissiveAnim.current = lerp(
      emissiveAnim.current,
      orb.core ? 0.95 : selected ? 0.85 : hovered ? 0.55 : 0.28,
      0.1,
    );
    opacityAnim.current = lerp(opacityAnim.current, dimmed ? 0.22 : 0.96, 0.08);

    if (meshRef.current) {
      meshRef.current.scale.setScalar(scaleAnim.current);
      const mat = meshRef.current.material;
      mat.emissiveIntensity = emissiveAnim.current * (dimmed ? 0.35 : 1);
      mat.opacity = opacityAnim.current;
    }
    if (lightRef.current) {
      lightRef.current.intensity = lerp(
        lightRef.current.intensity,
        (selected ? 0.9 : hovered ? 0.35 : 0) * (dimmed ? 0.2 : 1),
        0.12,
      );
    }
  });

  // Expose this pearl's live group so ConstellationLines can read its
  // continuously-animated world position without duplicating the motion math.
  useEffect(() => {
    registerRef(index, groupRef.current);
    return () => registerRef(index, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const body = (
    <group ref={groupRef}>
      <pointLight ref={lightRef} color={color} distance={2.2} intensity={0} />
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(orb);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[ORB_SIZE, 32, 32]} />
        <meshPhysicalMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.28}
          roughness={0.15}
          metalness={0.08}
          clearcoat={1}
          clearcoatRoughness={0.12}
          reflectivity={0.6}
          transparent
          opacity={0.96}
        />
      </mesh>
    </group>
  );

  // Only core memories (currently: today's entry, if any) trail light behind
  // them as they orbit -- keeps the extra draw calls cheap while still
  // making the globe read as alive rather than static balls on rails.
  if (!orb.core) return body;

  return (
    <Trail width={1.1} length={4.5} decay={1.4} color={color} attenuation={(t) => t * t}>
      {body}
    </Trail>
  );
}

/** Faint threads connecting core memories into a constellation. Recomputed
    every frame from the pearls' own live (already-animated) group positions,
    so the lines stay perfectly attached without re-deriving the orbit math. */
function ConstellationLines({ pearlRefs, coreIndices }) {
  const geometryRef = useRef(null);
  const positions = useMemo(() => new Float32Array(coreIndices.length * 2 * 3), [coreIndices.length]);

  useFrame(() => {
    const geom = geometryRef.current;
    if (!geom || coreIndices.length < 2) return;
    const posAttr = geom.attributes.position;
    const arr = posAttr.array;
    for (let i = 0; i < coreIndices.length; i++) {
      const a = pearlRefs.current[coreIndices[i]];
      const b = pearlRefs.current[coreIndices[(i + 1) % coreIndices.length]];
      const o = i * 6;
      if (a) {
        arr[o] = a.position.x;
        arr[o + 1] = a.position.y;
        arr[o + 2] = a.position.z;
      }
      if (b) {
        arr[o + 3] = b.position.x;
        arr[o + 4] = b.position.y;
        arr[o + 5] = b.position.z;
      }
    }
    posAttr.needsUpdate = true;
  });

  if (coreIndices.length < 2) return null;

  return (
    <lineSegments>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial
        color="#bfe8ff"
        transparent
        opacity={0.22}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/** Slow dolly-in on mount so the globe feels discovered rather than just
    appearing at its final framing. Hands off to OrbitControls once done --
    OrbitControls re-derives its internal spherical offset from the camera's
    current position on every update, so releasing control after the fly-in
    is a plain handoff, not a fight over ownership. */
function CameraIntro() {
  const done = useRef(false);
  useFrame((state) => {
    if (done.current) return;
    const t = Math.min(1, state.clock.elapsedTime / 1.9);
    const eased = THREE.MathUtils.smootherstep(t, 0, 1);
    state.camera.position.set(0, lerp(2.6, 0.6, eased), lerp(21, 8.5, eased));
    state.camera.lookAt(0, 0, 0);
    if (t >= 1) done.current = true;
  });
  return null;
}

function GlobeScene({ orbs, selectedId, onSelect }) {
  const dirs = useMemo(() => fibonacciDirections(orbs.length), [orbs.length]);
  const placements = useMemo(
    () =>
      orbs.map((_, i) => ({
        dir: dirs[i],
        radius: SHELL_RADII[i % SHELL_RADII.length],
      })),
    [orbs, dirs],
  );

  const worldRef = useRef(null);
  const [introReady, setIntroReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pearlRefs = useRef([]);

  const registerPearlRef = (index, group) => {
    pearlRefs.current[index] = group;
  };

  const coreIndices = useMemo(() => orbs.map((o, i) => (o.core ? i : -1)).filter((i) => i >= 0), [orbs]);

  useEffect(() => {
    const id = window.setTimeout(() => setIntroReady(true), 100);
    return () => window.clearTimeout(id);
  }, []);

  useFrame((state, delta) => {
    if (worldRef.current && !dragging) {
      worldRef.current.rotation.y += delta * 0.04;
      worldRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.12) * 0.05;
    }
  });

  return (
    <>
      <color attach="background" args={["#071019"]} />
      <fog attach="fog" args={["#071019", 12, 28]} />

      <ambientLight intensity={0.4} color="#d4e8f2" />
      <directionalLight position={[4, 5, 2]} intensity={0.85} color="#fff8f0" />
      <directionalLight position={[-3, -2, -4]} intensity={0.25} color="#6a9bb8" />

      <Stars radius={60} depth={50} count={1600} factor={2.2} saturation={0} fade speed={0.35} />
      <Sparkles count={40} scale={9} size={1.4} speed={0.25} opacity={0.35} color="#dff3fa" />
      <Environment preset="warehouse" environmentIntensity={0.35} />

      <Float speed={0.35} rotationIntensity={0.04} floatIntensity={0.1}>
        <group ref={worldRef}>
          <MemoryCore />
          {orbs.map((orb, i) => (
            <MemoryPearl
              key={orb.id}
              orb={orb}
              index={i}
              direction={placements[i].dir}
              shellRadius={placements[i].radius}
              color={orb.color}
              selected={selectedId === orb.id}
              dimmed={selectedId !== null && selectedId !== orb.id}
              onSelect={onSelect}
              introReady={introReady}
              registerRef={registerPearlRef}
            />
          ))}
          <ConstellationLines pearlRefs={pearlRefs} coreIndices={coreIndices} />
        </group>
      </Float>

      <CameraIntro />

      <OrbitControls
        enablePan={false}
        enableZoom
        minDistance={5.5}
        maxDistance={13}
        rotateSpeed={0.42}
        dampingFactor={0.09}
        enableDamping
        target={[0, 0, 0]}
        onStart={() => setDragging(true)}
        onEnd={() => setDragging(false)}
      />

      <EffectComposer multisampling={4}>
        <Bloom intensity={0.85} luminanceThreshold={0.35} luminanceSmoothing={0.7} mipmapBlur />
        <Vignette offset={0.35} darkness={0.55} />
      </EffectComposer>
    </>
  );
}

export default function MemoryOrbGlobe({ orbs, onOrbClick }) {
  const [selected, setSelected] = useState(null);

  const handleSelect = (orb) => {
    setSelected(orb);
    onOrbClick?.(orb);
  };

  return (
    <div className="globe-wrap">
      <div className="globe-hint">Drag gently · touch a memory</div>
      <Canvas
        camera={{ position: [0, 2.6, 21], fov: 38 }}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
        }}
      >
        <GlobeScene orbs={orbs} selectedId={selected?.id ?? null} onSelect={handleSelect} />
      </Canvas>

      {selected && (
        <aside className="orb-panel" role="dialog" aria-label="Memory orb details">
          <button type="button" className="orb-panel-close" onClick={() => setSelected(null)}>
            Close
          </button>
          <div
            className="orb-panel-swatch"
            style={{
              background: `radial-gradient(circle at 35% 30%, #fff 0%, ${selected.color} 55%, color-mix(in srgb, ${selected.color} 60%, #102030) 100%)`,
              boxShadow: `0 0 28px ${selected.color}88`,
            }}
          />
          <p className="orb-panel-label">{selected.label ?? "Memory"}</p>
          {selected.core && <p className="orb-panel-core">{selected.coreLabel || "Highlighted"}</p>}
          <p className="orb-panel-date">{selected.date}</p>
          {selected.themes && selected.themes.length > 0 ? (
            <p className="orb-panel-hint">Keywords: {selected.themes.join(", ")}</p>
          ) : (
            <p className="orb-panel-hint">Each pearl holds a day. Choose another to wander.</p>
          )}
        </aside>
      )}
    </div>
  );
}
