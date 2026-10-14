'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { Play, Pause, Rotate3d, AlertCircle } from 'lucide-react';
import { useI18n } from '../lib/i18n';

interface Tooth3DProps {
  className?: string;
}

export const Tooth3D: React.FC<Tooth3DProps> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { t } = useI18n();

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Three.js instances ref
  const instancesRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    toothGroup: THREE.Group;
    animationId?: number;
    clock: THREE.Clock;
    isIntersecting: boolean;
    isTabVisible: boolean;
    targetRotationY: number;
    targetRotationX: number;
    currentRotationY: number;
    currentRotationX: number;
  } | null>(null);

  const prevPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Procedural anatomical molar generator
  const createAnatomicalMolar = (): THREE.Group => {
    const group = new THREE.Group();

    // 1. Realistic enamel crown material
    const enamelMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xfcfbf7), // Warm ivory white
      roughness: 0.16,
      metalness: 0.02,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      reflectivity: 0.9,
      transmission: 0.08, // Subsurface translucency characteristic of enamel
      ior: 1.55,
      specularColor: new THREE.Color(0xffffff),
    });

    // 2. Cementum root material (slightly warmer, matte)
    const rootMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xf3eddc),
      roughness: 0.38,
      metalness: 0.0,
    });

    // 3. Occlusal crown with 4 distinct anatomical cusps (Molar anatomy)
    // Central crown body: Rounded box with sub-divided vertices shaped like a molar
    const crownGeo = new THREE.CylinderGeometry(1.28, 1.08, 1.45, 32, 16);
    const pos = crownGeo.attributes.position;

    // Sculpt realistic cusps on the occlusal table (top vertices)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      if (y > 0.3) {
        // Sculpt 4 cusps: Mesiobuccal, Distobuccal, Mesiolingual, Distolingual
        const cuspFactor =
          Math.sin(x * 2.2) * Math.sin(z * 2.2) * 0.22 +
          Math.cos(x * 3.5 + z * 3.5) * 0.06;
        // Central developmental groove depression
        const centralFissure = -Math.exp(-(x * x + z * z) * 2.5) * 0.18;
        pos.setY(i, y + cuspFactor + centralFissure);
      } else if (y < -0.3) {
        // Taper towards the cervical neck
        const cervicalTaper = 1.0 - (y + 0.3) * 0.15;
        pos.setX(i, x * cervicalTaper);
        pos.setZ(i, z * cervicalTaper);
      }
    }
    crownGeo.computeVertexNormals();
    const crownMesh = new THREE.Mesh(crownGeo, enamelMaterial);
    crownMesh.position.y = 0.55;
    group.add(crownMesh);

    // 4. Cervical line / neck ring
    const neckGeo = new THREE.TorusGeometry(1.02, 0.08, 16, 32);
    neckGeo.rotateX(Math.PI / 2);
    const neckMesh = new THREE.Mesh(neckGeo, enamelMaterial);
    neckMesh.position.y = -0.15;
    group.add(neckMesh);

    // 5. Roots: Bifurcated anatomical roots (Mesial and Distal roots)
    const createCurvedRoot = (xOffset: number, zOffset: number, curveDir: number) => {
      const rootCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(xOffset * 0.7, -0.15, zOffset),
        new THREE.Vector3(xOffset * 0.9, -0.9, zOffset * 0.9),
        new THREE.Vector3(xOffset * (0.8 + curveDir * 0.25), -1.8, zOffset * 0.7),
        new THREE.Vector3(xOffset * (0.5 + curveDir * 0.35), -2.6, zOffset * 0.4),
      ]);

      const rootGeo = new THREE.TubeGeometry(rootCurve, 24, 0.42, 16, false);
      // Taper the root toward apex
      const rootPos = rootGeo.attributes.position;
      for (let i = 0; i < rootPos.count; i++) {
        const ry = rootPos.getY(i);
        const factor = THREE.MathUtils.clamp((-ry + 0.2) / 2.6, 0, 1);
        const scale = 1.0 - factor * 0.65; // taper to 35% radius at apex
        rootPos.setX(i, rootPos.getX(i) * scale + (1 - scale) * (xOffset * 0.5));
        rootPos.setZ(i, rootPos.getZ(i) * scale);
      }
      rootGeo.computeVertexNormals();
      return new THREE.Mesh(rootGeo, rootMaterial);
    };

    // Root 1 (Mesial root - broader with slight inward curve)
    const root1 = createCurvedRoot(-0.55, 0.1, -0.2);
    group.add(root1);

    // Root 2 (Distal root - tapered with complementary curve)
    const root2 = createCurvedRoot(0.55, -0.1, 0.25);
    group.add(root2);

    // Root 3 (Lingual accessory root for realistic mandibular/maxillary molar volume)
    const root3 = createCurvedRoot(0.0, 0.55, 0.1);
    root3.scale.set(0.85, 0.95, 0.85);
    group.add(root3);

    // Center pivot point
    group.position.y = 0.5;
    return group;
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // Detect WebGL support
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (!gl) {
        setHasError(true);
        setIsLoading(false);
        return;
      }
    } catch {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 450;

    // 1. Scene
    const scene = new THREE.Scene();

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.5, 6.5);

    // 3. Renderer with power efficiency settings
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
    } catch {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    // 4. Realistic Studio Lighting Setup
    // Key light (soft warm overhead)
    const keyLight = new THREE.DirectionalLight(0xfff8ee, 1.8);
    keyLight.position.set(4, 5, 4);
    scene.add(keyLight);

    // Fill light (cool soft diffuse from left)
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.1);
    fillLight.position.set(-4, 2, 3);
    scene.add(fillLight);

    // Mint Rim light (accents tooth silhouette and clinic brand teal)
    const rimLight = new THREE.DirectionalLight(0x5eead4, 1.4);
    rimLight.position.set(0, -3, -4);
    scene.add(rimLight);

    // Soft ambient illumination
    const ambientLight = new THREE.AmbientLight(0xf8fafc, 0.85);
    scene.add(ambientLight);

    // 5. Add Molar Group
    const toothGroup = createAnatomicalMolar();
    scene.add(toothGroup);

    // Initial slight tilt for aesthetic presentation
    toothGroup.rotation.x = 0.22;
    toothGroup.rotation.y = -0.35;

    const clock = new THREE.Clock();

    // Store references
    instancesRef.current = {
      scene,
      camera,
      renderer,
      toothGroup,
      clock,
      isIntersecting: true,
      isTabVisible: document.visibilityState === 'visible',
      targetRotationY: -0.35,
      targetRotationX: 0.22,
      currentRotationY: -0.35,
      currentRotationX: 0.22,
    };

    setIsLoading(false);

    // 6. Animation loop
    const animate = () => {
      const inst = instancesRef.current;
      if (!inst) return;

      const delta = inst.clock.getDelta();
      const elapsedTime = inst.clock.getElapsedTime();

      // Only render if visible and tab active
      if (inst.isIntersecting && inst.isTabVisible) {
        // Idle floating & rotation if not paused
        if (!isPaused && !isDragging) {
          inst.targetRotationY += delta * 0.35; // gentle idle rotation
          inst.toothGroup.position.y = 0.5 + Math.sin(elapsedTime * 1.5) * 0.08; // subtle floating
        }

        // Smooth damping interpolation
        inst.currentRotationY += (inst.targetRotationY - inst.currentRotationY) * 0.08;
        inst.currentRotationX += (inst.targetRotationX - inst.currentRotationX) * 0.08;

        inst.toothGroup.rotation.y = inst.currentRotationY;
        inst.toothGroup.rotation.x = inst.currentRotationX;

        inst.renderer.render(inst.scene, inst.camera);
      }

      inst.animationId = requestAnimationFrame(animate);
    };

    animate();

    // 7. Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0 && instancesRef.current) {
          instancesRef.current.camera.aspect = newW / newH;
          instancesRef.current.camera.updateProjectionMatrix();
          instancesRef.current.renderer.setSize(newW, newH);
        }
      }
    });
    resizeObserver.observe(container);

    // 8. Intersection Observer (pause when off-screen)
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0] && instancesRef.current) {
          instancesRef.current.isIntersecting = entries[0].isIntersecting;
        }
      },
      { threshold: 0.1 }
    );
    intersectionObserver.observe(container);

    // 9. Tab visibility
    const handleVisibilityChange = () => {
      if (instancesRef.current) {
        instancesRef.current.isTabVisible = document.visibilityState === 'visible';
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 10. Check reduced-motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setIsPaused(true);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      if (instancesRef.current?.animationId) {
        cancelAnimationFrame(instancesRef.current.animationId);
      }
      renderer.dispose();
      instancesRef.current = null;
    };
  }, [isPaused, isDragging]);

  // Pointer & Touch interactions:
  // Preserves native vertical page scrolling while enabling horizontal drag rotation
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    prevPointerRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !prevPointerRef.current || !instancesRef.current) return;

    const dx = e.clientX - prevPointerRef.current.x;
    const dy = e.clientY - prevPointerRef.current.y;

    instancesRef.current.targetRotationY += dx * 0.008;
    instancesRef.current.targetRotationX = THREE.MathUtils.clamp(
      instancesRef.current.targetRotationX + dy * 0.005,
      -0.4,
      0.6
    );

    prevPointerRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    prevPointerRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[360px] sm:h-[420px] md:h-[500px] flex items-center justify-center select-none overflow-hidden ${className}`}
    >
      {/* Fallback & Loading Poster */}
      {(isLoading || hasError) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-teal-50/40 via-white to-mint/20 rounded-3xl p-6 text-center">
          <svg
            className="w-40 h-48 text-teal-700/80 animate-pulse drop-shadow-md"
            viewBox="0 0 120 150"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Anatomical Molar Silhouette */}
            <path
              d="M 25 35 C 20 18, 40 10, 50 18 C 55 22, 65 22, 70 18 C 80 10, 100 18, 95 35 C 92 48, 94 65, 88 78 C 82 92, 85 110, 80 140 C 76 142, 68 135, 68 120 C 68 100, 66 85, 60 85 C 54 85, 52 100, 52 120 C 52 135, 44 142, 40 140 C 35 110, 38 92, 32 78 C 26 65, 28 48, 25 35 Z"
              fill="url(#toothGrad)"
              stroke="#0f766e"
              strokeWidth="2"
            />
            <defs>
              <linearGradient id="toothGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#f8fafc" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>
            </defs>
          </svg>
          {hasError ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
              <AlertCircle className="w-4 h-4" />
              <span>3D modeli statik rejimda ko&apos;rsatilmoqda</span>
            </div>
          ) : (
            <p className="mt-4 text-xs font-medium text-teal-800 tracking-wider uppercase">
              {t.common.loading}
            </p>
          )}
        </div>
      )}

      {/* Interactive Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-full h-full cursor-grab active:cursor-grabbing touch-pan-y transition-opacity duration-700 ${
          isLoading || hasError ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-label="3D Tish modeli - interaktiv aylantirish imkoniyati bilan"
      />

      {/* Floating 3D Controls Bar */}
      {!isLoading && !hasError && (
        <div className="absolute bottom-3 right-4 flex items-center gap-2 z-10 bg-white/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-teal-100 shadow-sm text-xs text-teal-900">
          <Rotate3d className="w-3.5 h-3.5 text-teal-600 animate-spin-slow" />
          <span className="hidden sm:inline font-medium text-[11px] text-teal-700">
            {t.hero.rotateHint}
          </span>
          <button
            type="button"
            onClick={() => setIsPaused(!isPaused)}
            aria-label={isPaused ? t.hero.resume3d : t.hero.pause3d}
            className="ml-1 p-1 hover:bg-teal-50 rounded-full text-teal-700 transition-colors"
            title={isPaused ? t.hero.resume3d : t.hero.pause3d}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
};
