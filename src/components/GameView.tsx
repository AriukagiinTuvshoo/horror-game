import { useCallback, useEffect, useRef, useState } from 'react';
import { Battery, BookOpen, Brain, Camera, ChevronRight, CircleHelp, Crosshair, Footprints, HeartPulse, Lightbulb, Map, Menu, Mouse, Package, Pause, Radio, Save, Shield, Target, Volume2, Zap } from 'lucide-react';
import { HospitalEngine } from '../game/engine';
import { audio } from '../game/audio';
import { MISSIONS } from '../game/content';
import { MN_MISSIONS, ui } from '../game/i18n';
import { formatTime, has } from '../game/model';
import type { GameState, Settings, Snapshot, WorldObject } from '../game/types';
import { ControlsPanel, Dialog, HospitalMark, LoadingScreen, PrimaryButton, SettingsPanel } from './UI';
import { Interaction } from './Interaction';
import { Inventory } from './Inventory';
import type { InventoryTab } from './Inventory';

type Overlay = 'pause' | 'settings' | 'controls' | 'inventory' | 'interaction' | null;

export default function GameView({ initialState, settings, onSettings, onMenu, onEnd }: { initialState: GameState; settings: Settings; onSettings: (s: Settings) => void; onMenu: () => void; onEnd: (s: GameState) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const engineRef = useRef<HospitalEngine | null>(null);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [overlay, setOverlayState] = useState<Overlay>(null);
  const overlayRef = useRef<Overlay>(null);
  const [object, setObject] = useState<WorldObject | null>(null);
  const [journalTab, setJournalTab] = useState<InventoryTab>('inventory');
  const [message, setMessage] = useState('');
  const [locked, setLocked] = useState(false);
  const [intro, setIntro] = useState(true);
  const [saved, setSaved] = useState(false);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setOverlay = useCallback((value: Overlay) => {
    overlayRef.current = value; setOverlayState(value);
    engineRef.current?.setPaused(value !== null);
    if (value && document.pointerLockElement) document.exitPointerLock();
    if (value) audio.stopSpeech();
  }, []);

  const lockPointer = useCallback(() => {
    if (matchMedia('(pointer: coarse)').matches) return;
    try { const result = engineRef.current?.canvas.requestPointerLock(); if (result) void result.catch(() => {}); } catch { /* Arrow keys remain available if pointer lock is blocked. */ }
  }, []);

  const resume = useCallback(() => { setOverlay(null); lockPointer(); }, [setOverlay, lockPointer]);

  useEffect(() => {
    let readyTimer: ReturnType<typeof setTimeout>;
    let introTimer: ReturnType<typeof setTimeout>;
    try {
      const engine = new HospitalEngine(container.current!, structuredClone(initialState), settingsRef.current, {
        onSnapshot: setSnapshot,
        onInteract: target => { setObject(target); setOverlay('interaction'); },
        onMessage: text => {
          setMessage(text);
          if (messageTimer.current) clearTimeout(messageTimer.current);
          messageTimer.current = setTimeout(() => setMessage(''), 6500);
        },
        onEnd: state => { if (document.pointerLockElement) document.exitPointerLock(); onEnd(state); },
        onReady: () => { readyTimer = setTimeout(() => { setReady(true); engineRef.current?.setPaused(overlayRef.current !== null); }, 650); introTimer = setTimeout(() => setIntro(false), 5000); },
        onError: setError,
        onCameraMode: mode => onSettings({ ...settingsRef.current, cameraMode: mode }),
      });
      engineRef.current = engine;
      if (import.meta.env.DEV) window.__nightshift = engine;
    } catch (e) { setError(e instanceof Error ? `Unable to initialize 3D graphics: ${e.message}` : 'Your browser could not initialize WebGL 2. Try a current browser with hardware acceleration enabled.'); }
    return () => {
      clearTimeout(readyTimer); clearTimeout(introTimer); if (messageTimer.current) clearTimeout(messageTimer.current);
      engineRef.current?.dispose(); engineRef.current = null; delete window.__nightshift; audio.stopSpeech();
    };
  }, [initialState.runId]);

  useEffect(() => { engineRef.current?.updateSettings(settings); }, [settings]);

  useEffect(() => {
    let wasLocked = false;
    let lastEscape = 0;
    const pointerChange = () => {
      const isLocked = document.pointerLockElement === engineRef.current?.canvas;
      if (isLocked && overlayRef.current) { document.exitPointerLock(); return; }
      setLocked(isLocked);
      if (wasLocked && !isLocked && !overlayRef.current) { lastEscape = performance.now(); setOverlay('pause'); }
      wasLocked = isLocked;
    };
    const mouseMove = (e: MouseEvent) => { if (document.pointerLockElement === engineRef.current?.canvas) engineRef.current?.look(e.movementX, e.movementY); };
    const keyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        if (e.repeat || performance.now() - lastEscape < 250) return;
        e.preventDefault(); lastEscape = performance.now();
        if (overlayRef.current) setOverlay(null); else setOverlay('pause');
        return;
      }
      if (overlayRef.current || !engineRef.current) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      engineRef.current.setKey(e.code, true);
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyE': engineRef.current.interact(); break;
        case 'KeyF': engineRef.current.toggleFlashlight(); break;
        case 'KeyC': engineRef.current.toggleCrouch(); break;
        case 'KeyH': engineRef.current.toggleHide(); break;
        case 'KeyQ': engineRef.current.distract(); break;
        case 'KeyB': engineRef.current.perform('battery'); break;
        case 'KeyV': engineRef.current.cycleCamera(); break;
        case 'KeyI': setJournalTab('inventory'); setOverlay('inventory'); break;
        case 'KeyJ': setJournalTab('vocabulary'); setOverlay('inventory'); break;
        case 'KeyM': setJournalTab('map'); setOverlay('inventory'); break;
        case 'Tab': setJournalTab('objectives'); setOverlay('inventory'); break;
      }
    };
    const keyUp = (e: KeyboardEvent) => engineRef.current?.setKey(e.code, false);
    const visibility = () => { if (document.hidden && !overlayRef.current) setOverlay('pause'); };
    const blur = () => { if (!overlayRef.current) setOverlay('pause'); };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('mousemove', mouseMove); window.addEventListener('blur', blur);
    document.addEventListener('pointerlockchange', pointerChange); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('mousemove', mouseMove); window.removeEventListener('blur', blur); document.removeEventListener('pointerlockchange', pointerChange); document.removeEventListener('visibilitychange', visibility); };
  }, [setOverlay]);

  const engine = engineRef.current;
  const state = snapshot?.state ?? initialState;
  const baseMission = MISSIONS[Math.min(7, state.mission)];
  const mission = settings.language === 'mn' ? { ...baseMission, ...MN_MISSIONS[Math.min(7, state.mission)] } : baseMission;
  const openJournal = (tab: InventoryTab) => { setJournalTab(tab); setOverlay('inventory'); };
  const leave = () => { engine?.save(); onMenu(); };

  return <main className={`game-screen ${settings.reducedMotion ? 'reduced-motion' : ''} ${state.player.hidden ? 'is-hidden' : ''}`}>
    <div ref={container} className="game-canvas" onPointerDown={e => { if (e.pointerType === 'mouse' && !overlayRef.current) lockPointer(); }}/>
    <div className="game-vignette"/>
    <div className="damage-vignette" style={{ opacity: state.player.health < 40 ? .55 : (snapshot?.danger ?? 0) * .35 }}/>
    <div className="sanity-distortion" style={{ opacity: snapshot?.hallucination ?? 0 }}/>
    <div className={`cinematic-bars ${snapshot?.cameraMode === 'fixed' ? 'active' : ''}`}><span/><span/></div>
    <div className="film-grain"/>
    {ready && !overlay && !error && <>
      <div className="game-hud">
        <header className="hud-header"><div><HospitalMark small/><span className="hud-location">{snapshot?.location ?? 'North corridor'} <i/> FLOOR 01</span></div><div className="hud-clock"><span>{ui(settings.language, 'shiftEnds')}</span><strong>{formatTime(state.elapsed)}</strong><div className="clock-track"><span style={{ width: `${Math.min(100, state.elapsed / 480 * 100)}%` }}/></div></div><button className="hud-pause hud-action" onClick={() => setOverlay('pause')} aria-label="Pause game"><Pause size={17}/><span>{ui(settings.language, 'pause')}</span><kbd>ESC</kbd></button></header>
        <button className="hud-objective hud-action" onClick={() => openJournal('objectives')}><span className="objective-kicker"><i/> {ui(settings.language, 'objective')} {String(Math.min(8, state.mission + 1)).padStart(2, '0')} / 08</span><strong>{state.mission === 6 && has(state, 'witness-tape') ? settings.language === 'mn' ? 'Үнэнийг сонсго.' : 'Let them hear the truth.' : mission.title}</strong><span className="objective-room">{state.mission === 6 && has(state, 'witness-tape') ? settings.language === 'mn' ? 'Хамгаалалтын өрөө рүү буц' : 'Return to Security' : mission.room}<ChevronRight size={12}/></span></button>
        <div className={`crosshair ${snapshot?.target ? 'has-target' : ''}`}><span/><span/></div>
        {snapshot?.watched && <div className="watch-warning"><span/> {ui(settings.language, 'keepWatching')} <span/></div>}
        {state.player.hidden && <div className="hidden-caption"><Shield size={16}/> {ui(settings.language, 'hidden')} <small>{settings.language === 'mn' ? 'Чимээгүй бай. E дарж гарна.' : 'Keep quiet. Press E to leave.'}</small></div>}
        {intro && state.mission === 0 && <div className="opening-time"><span>{ui(settings.language, 'firstNight')}</span><strong>12:00 AM</strong><p>{settings.language === 'mn' ? '1999 оны бүртгэл дээр өөрийн нэрийг ол.' : 'Find your name in a register dated 1999.'}</p></div>}
        <div className="hud-bottom">
          <div className="survival-meters"><div className="meter-row"><HeartPulse size={17}/><span>{ui(settings.language, 'vitals')}</span><div className="meter-track"><i style={{ width: `${state.player.health}%` }} className={state.player.health < 40 ? 'critical' : ''}/></div><b>{Math.ceil(state.player.health)}</b></div><button className="meter-row hud-action" aria-label={`Battery ${Math.ceil(state.player.battery)} percent. Replace battery.`} onClick={() => engine?.perform('battery')}><Battery size={18}/><span>{ui(settings.language, 'battery')}</span><div className="meter-track"><i className={state.player.battery < 20 ? 'critical' : 'battery-level'} style={{ width: `${state.player.battery}%` }}/></div><b>{Math.ceil(state.player.battery)}<small>%</small></b></button><div className="meter-row sanity-meter"><Brain size={16}/><span>{ui(settings.language, 'sanity')}</span><div className="meter-track"><i style={{ width: `${state.player.sanity}%` }} className={state.player.sanity < 35 ? 'critical' : ''}/></div><b>{Math.ceil(state.player.sanity)}</b></div><div className="stamina-track"><span style={{ width: `${state.player.stamina}%` }}/></div><span className="stealth-status"><Footprints size={12}/>{state.player.hidden ? 'HIDDEN' : state.player.crouched ? 'MOVING QUIETLY' : (snapshot?.noise ?? 0) > .6 ? 'MAKING NOISE' : 'STAY QUIET'}<span>{state.distractions} DISTRACTIONS</span></span></div>
          <div className="interaction-prompt">{state.player.hidden ? <><kbd>E</kbd><div><span>STAY STILL. STAY SILENT.</span><strong>Leave the locker</strong></div></> : snapshot?.target ? <><kbd>E</kbd><div><span>{snapshot.target.kind === 'locker' ? 'HIDE' : 'INTERACT'}</span><strong>{snapshot.target.label}</strong></div></> : !locked ? <div className="look-prompt"><Mouse size={17}/><span>CLICK TO LOOK AROUND</span></div> : <span className="ambient-reminder">LISTEN. SOMETHING IS LISTENING BACK.</span>}</div>
          <div className="hud-tools"><span className="camera-readout"><Camera size={12}/>{snapshot?.cameraMode.toUpperCase()} / V</span><span className="hud-score">SHIFT SCORE <b>{Math.round(state.score + state.elapsed * 2).toLocaleString().padStart(4, '0')}</b></span><div><button className="hud-action" aria-label="Change camera" onClick={() => engine?.cycleCamera()}><Camera size={18}/><kbd>V</kbd></button><button className="hud-action" aria-label="Open inventory" onClick={() => openJournal('inventory')}><Package size={18}/><kbd>I</kbd></button><button className="hud-action" aria-label="Open map" onClick={() => openJournal('map')}><Map size={18}/><kbd>M</kbd></button><button className="hud-action" aria-label="Open vocabulary notebook" onClick={() => openJournal('vocabulary')}><BookOpen size={18}/><kbd>J</kbd></button></div></div>
        </div>
        {message && <div className="game-message" role="status"><Radio size={14}/><div>{message.includes(' / ') ? <><strong>{message.split(' / ')[0]}</strong><span>{message.split(' / ').slice(1).join(' / ')}</span></> : <span>{message}</span>}</div></div>}
        {state.mission === 0 && <div className="first-controls"><span><kbd>W A S D</kbd> MOVE</span><span><kbd>E</kbd> INTERACT</span><span><kbd>F</kbd> FLASHLIGHT</span></div>}
      </div>
      {engine && <TouchControls engine={engine}/>}
    </>}
    {overlay === 'pause' && <Dialog eyebrow={`SHIFT PAUSED / ${formatTime(state.elapsed)}`} title="Take a breath." onClose={resume} className="pause-dialog" footer={<><span>THE CLOCK IS WAITING FOR YOU.</span><span>{Math.min(8, state.mission)} / 8</span></>}><p className="pause-description">The hospital can wait. Just not forever.</p><PrimaryButton onClick={resume}>RESUME YOUR SHIFT</PrimaryButton><div className="pause-options"><button onClick={() => { setSaved(engine?.save() ?? false); }}><Save size={16}/>{saved ? 'Checkpoint saved' : 'Save checkpoint'}<ChevronRight size={15}/></button><button onClick={() => setOverlay('settings')}><Volume2 size={16}/>Settings<ChevronRight size={15}/></button><button onClick={() => setOverlay('controls')}><CircleHelp size={16}/>How to survive<ChevronRight size={15}/></button><button onClick={leave}><Menu size={16}/>Save & return to menu<ChevronRight size={15}/></button></div></Dialog>}
    {overlay === 'settings' && <SettingsPanel settings={settings} onChange={onSettings} onClose={() => setOverlay('pause')}/>}
    {overlay === 'controls' && <ControlsPanel onClose={() => setOverlay('pause')}/>}
    {overlay === 'inventory' && engine && <Inventory state={state} settings={settings} engine={engine} initialTab={journalTab} onClose={resume}/>}
    {overlay === 'interaction' && object && engine && <Interaction key={object.id} object={object} state={state} settings={settings} engine={engine} onClose={resume}/>}
    {!ready && !error && <LoadingScreen/>}
    {error && <Dialog eyebrow="SIGNAL LOST" title="The connection broke." onClose={onMenu}><p className="document-body">{error}</p><p className="small-note">Your last checkpoint has not been overwritten. Try Performance graphics in Settings before continuing.</p><PrimaryButton onClick={onMenu}>RETURN TO MAIN MENU</PrimaryButton></Dialog>}
  </main>;
}

function TouchControls({ engine }: { engine: HospitalEngine }) {
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });
  const look = useRef({ x: 0, y: 0 });
  return <div className="touch-controls">
    <div className="touch-look-area" onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); look.current = { x: e.clientX, y: e.clientY }; }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; engine.look((e.clientX - look.current.x) * 1.7, (e.clientY - look.current.y) * 1.7); look.current = { x: e.clientX, y: e.clientY }; }}/>
    <div className="touch-joystick" aria-label="Movement joystick" onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); origin.current = { x: e.clientX, y: e.clientY }; }} onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const dx = e.clientX - origin.current.x, dy = e.clientY - origin.current.y, d = Math.max(38, Math.hypot(dx, dy)); const x = dx / d, y = dy / d; setStick({ x: x * 30, y: y * 30 }); engine.setTouchMove(x, y); }} onPointerUp={() => { setStick({ x: 0, y: 0 }); engine.setTouchMove(0, 0); }} onPointerCancel={() => { setStick({ x: 0, y: 0 }); engine.setTouchMove(0, 0); }}><div className="joystick-cross"/><span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }}/></div>
    <div className="touch-action-buttons"><button className="touch-interact" aria-label="Interact" onPointerDown={e => { e.preventDefault(); engine.interact(); }}><Crosshair size={23}/><span>USE</span></button><button aria-label="Flashlight" onPointerDown={e => { e.preventDefault(); engine.toggleFlashlight(); }}><Lightbulb size={20}/></button><button aria-label="Sprint" onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); engine.setKey('TouchSprint', true); }} onPointerUp={() => engine.setKey('TouchSprint', false)} onPointerCancel={() => engine.setKey('TouchSprint', false)}><Zap size={20}/></button><button aria-label="Crouch" onPointerDown={e => { e.preventDefault(); engine.toggleCrouch(); }}><Footprints size={19}/></button><button aria-label="Throw distraction" onPointerDown={e => { e.preventDefault(); engine.distract(); }}><Target size={19}/></button></div>
  </div>;
}