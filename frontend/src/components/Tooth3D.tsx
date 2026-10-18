'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
  const [reducedMotion, setReducedMotion] = useState(false);

  // References for live rendering state without triggering effect re-binds
  const isPausedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isIntersectingRef = useRef(true);
  const isTabVisibleRef = useRef(true);
  const prefersReducedMotionRef = useRef(false);
  const modelLoadedRef = useRef(false);
  const animationFrameIdRef = useRef<number | null>(null);

  // Synchronize state to refs
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  // Three.js instances ref
  const engineRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    toothGroup: THREE.Group;
    clock: THREE.Clock;
    targetRotationY: number;
    targetRotationX: number;
    currentRotationY: number;
    currentRotationX: number;
    gltfScene?: THREE.Group;
  } | null>(null);

  const prevPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Helper: check if continuous 60fps loop should be running
  const shouldAnimateContinuous = useCallback(() => {
    return (
      !isPausedRef.current &&
      isIntersectingRef.current &&
      isTabVisibleRef.current &&
      !prefersReducedMotionRef.current &&
      modelLoadedRef.current
    );
  }, []);

  // On-demand single frame render
  const renderSingleFrame = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    // Apply damping
    engine.currentRotationY += (engine.targetRotationY - engine.currentRotationY) * 0.2;
    engine.currentRotationX += (engine.targetRotationX - engine.currentRotationX) * 0.2;

    engine.toothGroup.rotation.y = engine.currentRotationY;
    engine.toothGroup.rotation.x = engine.currentRotationX;

    engine.renderer.render(engine.scene, engine.camera);
    if (typeof window !== 'undefined') {
      (window as any).__toothRenderCount = ((window as any).__toothRenderCount || 0) + 1;
    }
  }, []);

  // Stop loop cleanly
  const stopAnimationLoop = useCallback(() => {
    if (animationFrameIdRef.current !== null) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }
  }, []);

  // Start loop cleanly (idempotent: never spawns duplicate loops)
  const startAnimationLoop = useCallback(() => {
    if (animationFrameIdRef.current !== null) return; // already running
    if (!shouldAnimateContinuous()) {
      renderSingleFrame();
      return;
    }

    const engine = engineRef.current;
    if (engine) {
      // Flush clock delta before starting loop to eliminate rotation jumps after long pauses
      engine.clock.getDelta();
    }

    const TARGET_FPS = 60;
    const FRAME_INTERVAL_MS = 1000 / TARGET_FPS; // ~16.6ms
    let lastFrameTimestamp = performance.now();

    const loop = (timestamp: number) => {
      const currentEngine = engineRef.current;
      if (!currentEngine) {
        animationFrameIdRef.current = null;
        return;
      }

      if (!shouldAnimateContinuous()) {
        renderSingleFrame();
        animationFrameIdRef.current = null;
        return;
      }

      // Frame budget cap: throttle to target 60 FPS on 120Hz/144Hz monitors
      const elapsedSinceLast = timestamp - lastFrameTimestamp;
      if (elapsedSinceLast < FRAME_INTERVAL_MS) {
        animationFrameIdRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameTimestamp = timestamp - (elapsedSinceLast % FRAME_INTERVAL_MS);

      // Clamp delta to at most 0.05s (20 FPS equivalent) to prevent large jumps on resume
      const rawDelta = currentEngine.clock.getDelta();
      const delta = Math.min(rawDelta, 0.05);
      const elapsedTime = currentEngine.clock.getElapsedTime();

      // Idle rotation and gentle floating when not dragged
      if (!isDraggingRef.current) {
        currentEngine.targetRotationY += delta * 0.35;
        currentEngine.toothGroup.position.y = 0.08 + Math.sin(elapsedTime * 1.5) * 0.06;
      }

      // Smooth damping interpolation
      currentEngine.currentRotationY += (currentEngine.targetRotationY - currentEngine.currentRotationY) * 0.08;
      currentEngine.currentRotationX += (currentEngine.targetRotationX - currentEngine.currentRotationX) * 0.08;

      currentEngine.toothGroup.rotation.y = currentEngine.currentRotationY;
      currentEngine.toothGroup.rotation.x = currentEngine.currentRotationX;

      currentEngine.renderer.render(currentEngine.scene, currentEngine.camera);

      if (typeof window !== 'undefined') {
        (window as any).__toothFrameCount = ((window as any).__toothFrameCount || 0) + 1;
      }

      animationFrameIdRef.current = requestAnimationFrame(loop);
    };

    animationFrameIdRef.current = requestAnimationFrame(loop);
  }, [shouldAnimateContinuous, renderSingleFrame]);

  // Handle pause toggle button
  const togglePause = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    isPausedRef.current = nextPaused;

    if (nextPaused) {
      stopAnimationLoop();
      renderSingleFrame();
    } else {
      startAnimationLoop();
    }
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;

    // 1. Detect WebGL support
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

    // 2. Scene
    const scene = new THREE.Scene();

    // 3. Camera with comfortable anatomical dental framing
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 0.1, 5.8);

    // 4. Renderer with evaluated powerPreference:
    // 'default' delivers smooth 60fps without forcing high-drain dedicated GPUs on laptops
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'default',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
    } catch {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    // 5. Realistic Dental Studio Lighting Setup (Organic Warm Ivory Enamel, no artificial green tints)
    // Key Light (warm soft overhead clinical spotlight)
    const keyLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);

    // Fill Light (soft diffused daylight)
    const fillLight = new THREE.DirectionalLight(0xf1f5f9, 1.2);
    fillLight.position.set(-3, 2, 3);
    scene.add(fillLight);

    // Top Rim Light (accents anatomical crown fissures and enamel translucency)
    const topRimLight = new THREE.DirectionalLight(0xfffef7, 1.1);
    topRimLight.position.set(0, 4, -3);
    scene.add(topRimLight);

    // Ambient Illumination (soft balanced foundation)
    const ambientLight = new THREE.AmbientLight(0xf8fafc, 0.85);
    scene.add(ambientLight);

    // 6. Tooth Group for rotation & centering
    const toothGroup = new THREE.Group();
    toothGroup.position.set(0, 0.08, 0);
    toothGroup.rotation.x = 0.18;
    toothGroup.rotation.y = -0.3;
    scene.add(toothGroup);

    const clock = new THREE.Clock();

    engineRef.current = {
      scene,
      camera,
      renderer,
      toothGroup,
      clock,
      targetRotationY: -0.3,
      targetRotationX: 0.18,
      currentRotationY: -0.3,
      currentRotationX: 0.18,
    };

    // 7. Load Authentic 3D Anatomical Tooth Model
    const loader = new GLTFLoader();
    loader.load(
      '/models/tooth.glb',
      (gltf) => {
        if (isDisposed) {
          // Dispose late-loaded GLTF immediately if component already unmounted
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const m = child as THREE.Mesh;
              m.geometry?.dispose();
              if (Array.isArray(m.material)) {
                m.material.forEach((mat) => mat.dispose());
              } else {
                m.material?.dispose();
              }
            }
          });
          return;
        }

        const root = gltf.scene;

        // Auto-center model at origin (0, 0, 0)
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        root.position.sub(center);

        // Realistic Dental Enamel Material (Physical PBR shader with biological refractive index)
        const enamelMaterial = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(0xfcfbf7), // Natural organic warm ivory
          roughness: 0.22,                  // Natural tooth surface micro-texture
          metalness: 0.0,                   // 0% metallic (biological tissue)
          clearcoat: 0.6,                   // Subtle moist enamel sheen
          clearcoatRoughness: 0.18,
          ior: 1.62,                        // Anatomical human tooth enamel IOR
        });

        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            // Dispose default material from GLTF file before replacing
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((mat) => mat.dispose());
            } else {
              mesh.material?.dispose();
            }
            mesh.material = enamelMaterial;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
          }
        });

        toothGroup.add(root);
        if (engineRef.current) {
          engineRef.current.gltfScene = root;
        }

        modelLoadedRef.current = true;
        setIsLoading(false);

        // Render first frame immediately
        renderSingleFrame();

        // Start continuous loop only if allowed
        if (shouldAnimateContinuous()) {
          startAnimationLoop();
        }
      },
      undefined,
      (err) => {
        if (isDisposed) return;
        console.error('Failed to load 3D tooth model, falling back to static visual', err);
        setHasError(true);
        setIsLoading(false);
      }
    );

    // 8. Resize Observer with on-demand render
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0 && engineRef.current) {
          engineRef.current.camera.aspect = newW / newH;
          engineRef.current.camera.updateProjectionMatrix();
          engineRef.current.renderer.setSize(newW, newH);
          renderSingleFrame();
        }
      }
    });
    resizeObserver.observe(container);

    // 9. Intersection Observer (stops animation when offscreen)
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (!entries[0]) return;
        const intersecting = entries[0].isIntersecting;
        isIntersectingRef.current = intersecting;

        if (intersecting) {
          if (shouldAnimateContinuous()) {
            startAnimationLoop();
          } else {
            renderSingleFrame();
          }
        } else {
          stopAnimationLoop();
        }
      },
      { threshold: 0.05 }
    );
    intersectionObserver.observe(container);

    // 10. Tab visibility (stops animation when tab is hidden)
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      isTabVisibleRef.current = visible;

      if (visible) {
        if (shouldAnimateContinuous()) {
          startAnimationLoop();
        } else {
          renderSingleFrame();
        }
      } else {
        stopAnimationLoop();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 11. Reduced-motion preference: responds dynamically to live preference changes
    const motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const prefersReduced = e.matches;
      prefersReducedMotionRef.current = prefersReduced;
      setReducedMotion(prefersReduced);

      if (prefersReduced) {
        setIsPaused(true);
        isPausedRef.current = true;
        stopAnimationLoop();
        renderSingleFrame();
      }
    };

    handleMotionChange(motionMediaQuery);

    if (motionMediaQuery.addEventListener) {
      motionMediaQuery.addEventListener('change', handleMotionChange);
    } else if ((motionMediaQuery as any).addListener) {
      (motionMediaQuery as any).addListener(handleMotionChange);
    }

    // 12. Cleanup on unmount
    return () => {
      isDisposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (motionMediaQuery.removeEventListener) {
        motionMediaQuery.removeEventListener('change', handleMotionChange);
      } else if ((motionMediaQuery as any).removeListener) {
        (motionMediaQuery as any).removeListener(handleMotionChange);
      }

      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      stopAnimationLoop();

      // Deep disposal of Three.js objects
      try {
        toothGroup.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = obj as THREE.Mesh;
            m.geometry?.dispose();
            if (Array.isArray(m.material)) {
              m.material.forEach((mat) => mat.dispose());
            } else {
              m.material?.dispose();
            }
          }
        });
      } catch {}

      try {
        renderer.dispose();
      } catch {}

      engineRef.current = null;
      modelLoadedRef.current = false;
    };
  }, []);

  // Pointer interaction:
  // Designed so mobile vertical page scrolling remains completely smooth (touch-action: pan-y)
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only capture primary button / touch
    if (e.button !== 0) return;
    setIsDragging(true);
    isDraggingRef.current = true;
    prevPointerRef.current = { x: e.clientX, y: e.clientY };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !prevPointerRef.current || !engineRef.current) return;

    const dx = e.clientX - prevPointerRef.current.x;
    const dy = e.clientY - prevPointerRef.current.y;

    // Apply rotation
    engineRef.current.targetRotationY += dx * 0.008;
    engineRef.current.targetRotationX = THREE.MathUtils.clamp(
      engineRef.current.targetRotationX + dy * 0.005,
      -0.35,
      0.45
    );

    prevPointerRef.current = { x: e.clientX, y: e.clientY };

    // On-demand render while dragging
    renderSingleFrame();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    isDraggingRef.current = false;
    prevPointerRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    // Resume loop if continuous animation is enabled
    if (shouldAnimateContinuous()) {
      startAnimationLoop();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[360px] sm:h-[420px] md:h-[500px] flex items-center justify-center select-none overflow-hidden ${className}`}
    >
      {/* Fallback & Loading Poster */}
      {(isLoading || hasError) && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-teal-50/40 via-white to-slate-50/30 rounded-3xl p-6 text-center"
          role="img"
          aria-label={t.hero.toothAriaLabel || 'Anatomik inson tishi 3D modeli'}
        >
          <svg
            className={`w-36 h-44 text-teal-800/80 drop-shadow-md ${
              reducedMotion ? '' : 'motion-safe:animate-pulse'
            }`}
            viewBox="0 0 120 150"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Anatomical Molar Crown & Root Silhouette */}
            <path
              d="M 25 35 C 20 18, 40 10, 50 18 C 55 22, 65 22, 70 18 C 80 10, 100 18, 95 35 C 92 48, 94 65, 88 78 C 82 92, 85 110, 80 140 C 76 142, 68 135, 68 120 C 68 100, 66 85, 60 85 C 54 85, 52 100, 52 120 C 52 135, 44 142, 40 140 C 35 110, 38 92, 32 78 C 26 65, 28 48, 25 35 Z"
              fill="url(#toothGrad)"
              stroke="#0f766e"
              strokeWidth="2"
            />
            <defs>
              <linearGradient id="toothGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#fbfbfa" />
                <stop offset="100%" stopColor="#e2e8f0" />
              </linearGradient>
            </defs>
          </svg>
          {hasError ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-700 bg-slate-100/90 px-3.5 py-1.5 rounded-full border border-slate-200">
              <AlertCircle className="w-4 h-4 text-teal-700" />
              <span>{t.hero.toothStaticFallback || "3D modeli statik rejimda ko'rsatilmoqda"}</span>
            </div>
          ) : (
            <p className="mt-4 text-xs font-semibold text-teal-800 tracking-wider uppercase">
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
        style={{ touchAction: 'pan-y' }}
        className={`w-full h-full cursor-grab active:cursor-grabbing transition-opacity duration-700 ${
          isLoading || hasError ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        aria-label={t.hero.toothAriaLabel || 'Anatomik inson tishi 3D modeli'}
      />

      {/* Floating 3D Controls Bar */}
      {!isLoading && !hasError && (
        <div className="absolute bottom-3 right-4 flex items-center gap-2 z-10 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-200/80 shadow-sm text-xs text-slate-800">
          <Rotate3d
            className={`w-3.5 h-3.5 text-teal-700 ${
              isPaused || reducedMotion ? '' : 'animate-spin-slow'
            }`}
          />
          <span className="hidden sm:inline font-medium text-[11px] text-slate-700">
            {t.hero.rotateHint}
          </span>
          <button
            type="button"
            onClick={togglePause}
            aria-label={isPaused ? t.hero.resume3d : t.hero.pause3d}
            className="ml-1 p-1 hover:bg-slate-100 rounded-full text-teal-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
            title={isPaused ? t.hero.resume3d : t.hero.pause3d}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
          </button>
        </div>
      )}
    </div>
  );
};
