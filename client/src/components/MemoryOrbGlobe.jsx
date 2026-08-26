import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, OrbitControls, Sparkles, Trail } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import "./MemoryOrbGlobe.css";

// v3: was an abstract "core + concentric pearl shells" arrangement -- warm,
// but nothing about it actually read as a *globe*; it was closer to a
// cluster of fireflies around a marble. Rebuilt around an actual planet: a
// textured, lit sphere you can see the surface of, with each Keepsake pinned
// to that surface (like a marker on a map) rather than drifting on its own
// independent orbit shell. The whole planet spins as one rigid body -- the
// orbs move because the globe under them turns, not because they're each
// running separate orbit math -- which is what makes it read as "a place"
// instead of "a swarm." Journal entries still feed in as `orbs`
// ({ id, date, color, label, emotion, core }) built by MoodGlobeLauncher.

const PLANET_RADIUS = 2.3;
const ORB_LIFT = 0.22; // how far above the surface each marker floats
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

/** Small deterministic PRNG (no Math.random) so the generated surface is
    stable across re-renders/remounts instead of reshuffling every time. */
function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** Procedurally paints a warm, continent-like surface onto a canvas and
    hands it back as a texture -- avoids shipping/loading an external planet
    texture asset, and keeps the palette tied to this app's actual colors
    (olive/gold) rather than a stock Earth photo. */
function usePlanetTexture() {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    const base = ctx.createLinearGradient(0, 0, 0, canvas.height);
    base.addColorStop(0, "#33422a");
    base.addColorStop(0.5, "#3f5031");
    base.addColorStop(1, "#293522");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rand = makeRng(11);
    const blobColors = ["#e8ab5f", "#d69a53", "#6f8f5c", "#546b3d", "#f6d9a0"];
    for (let i = 0; i < 46; i++) {
      const x = rand() * canvas.width;
      const y = rand() * canvas.height;
      const r = 26 + rand() * 70;
      ctx.beginPath();
      ctx.fillStyle = blobColors[i % blobColors.length];
      ctx.globalAlpha = 0.16 + rand() * 0.22;
      ctx.ellipse(x, y, r, r * (0.45 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      // wrap blobs near the seams so the texture tiles cleanly around the sphere
      if (x < r) {
        ctx.beginPath();
        ctx.ellipse(x + canvas.width, y, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (x > canvas.width - r) {
        ctx.beginPath();
        ctx.ellipse(x - canvas.width, y, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // gentle polar darkening, like shading toward the poles
    const polar = ctx.createLinearGradient(0, 0, 0, canvas.height);
    polar.addColorStop(0, "rgba(15,20,12,0.55)");
    polar.addColorStop(0.18, "rgba(15,20,12,0)");
    polar.addColorStop(0.82, "rgba(15,20,12,0)");
    polar.addColorStop(1, "rgba(15,20,12,0.55)");
    ctx.fillStyle = polar;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);
}

/** The planet itself: a lit, textured sphere plus a thin additive
    "atmosphere" shell for the classic glowing-rim-in-space look. */
function MemoryPlanet() {
  const texture = usePlanetTexture();
  const lightRef = useRef(null);

  useFrame((state) => {
    const pulse = 0.85 + Math.sin(state.clock.elapsedTime * 0.6) * 0.1;
    if (lightRef.current) lightRef.current.intensity = pulse;
  });

  return (
    <group>
      <pointLight ref={lightRef} color="#f6d9a0" distance={9} intensity={0.9} />

      <mesh>
        <sphereGeometry args={[PLANET_RADIUS, 96, 96]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.78}
          metalness={0.04}
          emissive="#e8ab5f"
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* atmosphere glow -- backside shell, additive, so it only reads at
          the silhouette edge rather than washing out the surface */}
      <mesh scale={1.055}>
        <sphereGeometry args={[PLANET_RADIUS, 64, 64]} />
        <meshBasicMaterial
          color="#f6d9a0"
          transparent
          opacity={0.16}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function MemoryPearl({ direction, color, orb, index, selected, dimmed, onSelect, introReady, registerRef }) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef(null);
  const meshRef = useRef(null);
  const lightRef = useRef(null);

  const phase = index * 0.41;
  const scaleAnim = useRef(0);
  const emissiveAnim = useRef(0.25);
  const opacityAnim = useRef(0.96);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const stagger = Math.min(1, Math.max(0, (t * 0.55 - index * 0.008) / 1.1));
    const intro = introReady ? THREE.MathUtils.smootherstep(stagger, 0, 1) : 0;

    // Pinned to the surface at a fixed direction -- the only motion here is
    // a small independent bob so markers still feel alive, plus whatever
    // lift comes from selection/hover. The globe's own spin (applied to the
    // whole parent group in GlobeScene) is what actually carries these
    // around, the same way a pin doesn't move on a map but the map can turn.
    const bob = Math.sin(t * 1.1 + phase) * 0.03;
    const lift = ORB_LIFT + (selected ? 0.16 : hovered ? 0.08 : 0) + bob;
    const pos = direction.clone().multiplyScalar(PLANET_RADIUS + lift);
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
      {/* thin stem grounding the marker to the surface, like a pin */}
      <mesh position={[0, -ORB_LIFT / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, ORB_LIFT, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </group>
  );

  if (!orb.core) return body;

  return (
    <Trail width={1} length={3.5} decay={1.6} color={color} attenuation={(t) => t * t}>
      {body}
    </Trail>
  );
}

/** Faint threads connecting Keepsakes into a constellation across the
    planet's surface. Recomputed every frame from the pearls' own live
    (already-animated) group positions. */
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
        color="#e8ab5f"
        transparent
        opacity={0.22}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/** Slow dolly-in on mount so the globe feels discovered rather than just
    appearing at its final framing. Hands off to OrbitControls once done. */
function CameraIntro() {
  const done = useRef(false);
  useFrame((state) => {
    if (done.current) return;
    const t = Math.min(1, state.clock.elapsedTime / 1.9);
    const eased = THREE.MathUtils.smootherstep(t, 0, 1);
    // Final resting distance was 6.2 -- at this scene's fov (38) that puts
    // the visible frame height at ~4.27 world units, SMALLER than the
    // planet's own 4.6 diameter (PLANET_RADIUS * 2), so the sphere
    // overflowed the canvas on every side with zero space/stars margin
    // around it -- confirmed live, it touched the modal's top and bottom
    // edges exactly. 8.6 leaves the planet at roughly 3/4 of the frame
    // height, matching "a small glowing world" rather than a wall of
    // texture, while staying inside OrbitControls' zoom range below.
    state.camera.position.set(0, lerp(2.2, 1.05, eased), lerp(15, 8.6, eased));
    state.camera.lookAt(0, 0, 0);
    if (t >= 1) done.current = true;
  });
  return null;
}

function GlobeScene({ orbs, selectedId, onSelect }) {
  const dirs = useMemo(() => fibonacciDirections(orbs.length), [orbs.length]);

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
    // The whole planet (surface + every pinned marker, as children of this
    // one group) spins together as a rigid body -- this is what makes it
    // read as an actual rotating globe instead of independently-drifting
    // particles.
    if (worldRef.current && !dragging) {
      worldRef.current.rotation.y += delta * 0.09;
      worldRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.1) * 0.04;
    }
  });

  return (
    <>
      <color attach="background" args={["#12180f"]} />
      <fog attach="fog" args={["#12180f", 10, 24]} />

      <ambientLight intensity={0.4} color="#f5e6c8" />
      <directionalLight position={[4, 5, 2]} intensity={0.9} color="#fff3df" />
      <directionalLight position={[-3, -2, -4]} intensity={0.25} color="#6f8f5c" />

      <Sparkles count={60} scale={9} size={1.4} speed={0.2} opacity={0.35} color="#f6d9a0" />
      <Environment preset="sunset" environmentIntensity={0.25} />

      <Float speed={0.3} rotationIntensity={0.03} floatIntensity={0.08}>
        <group ref={worldRef}>
          <MemoryPlanet />
          {orbs.map((orb, i) => (
            <MemoryPearl
              key={orb.id}
              orb={orb}
              index={i}
              direction={dirs[i]}
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
        minDistance={4.2}
        maxDistance={12}
        rotateSpeed={0.42}
        dampingFactor={0.09}
        enableDamping
        target={[0, 0, 0]}
        onStart={() => setDragging(true)}
        onEnd={() => setDragging(false)}
      />

      <EffectComposer multisampling={4}>
        <Bloom intensity={0.7} luminanceThreshold={0.4} luminanceSmoothing={0.7} mipmapBlur />
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
        camera={{ position: [0, 2.2, 15], fov: 38 }}
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
              background: `radial-gradient(circle at 35% 30%, #fff 0%, ${selected.color} 55%, color-mix(in srgb, ${selected.color} 60%, #1c2418) 100%)`,
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
