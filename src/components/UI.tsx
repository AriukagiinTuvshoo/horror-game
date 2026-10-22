import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, Check, ChevronRight, Headphones, Monitor, Mouse, Volume2, X } from 'lucide-react';
import { audio } from '../game/audio';
import type { Settings } from '../game/types';

export function HospitalMark({ small = false }: { small?: boolean }) {
  return <div className={`hospital-brand ${small ? 'small' : ''}`}>
    <svg className="hospital-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M15 3h10v12h12v10H25v12H15V25H3V15h12V3Z" stroke="currentColor" strokeWidth="1.4"/><path d="M20 11v18M11 20h18" stroke="currentColor" strokeWidth="1.4"/></svg>
    <span>ST. MERCY<span className="brand-subtitle">MEMORIAL HOSPITAL</span></span>
  </div>;
}

export function PrimaryButton({ children, onClick, className = '', disabled = false, type = 'button' }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; type?: 'button' | 'submit' }) {
  return <button type={type} className={`primary-button ${className}`} onClick={() => { audio.click(); onClick?.(); }} disabled={disabled}><span>{children}</span><ArrowRight size={19} strokeWidth={1.6}/></button>;
}

export function Dialog({ eyebrow, title, onClose, children, className = '', footer }: { eyebrow: string; title: string; onClose: () => void; children: ReactNode; className?: string; footer?: ReactNode }) {
  const id = useId(), ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus?.();
  }, []);
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} className={`dialog ${className}`} onKeyDown={e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const items = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"], a[href]');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }}>
      <header className="dialog-header"><div><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2></div><button className="icon-button close-button" onClick={onClose} aria-label="Close dialog"><X size={21}/></button></header>
      <div className="dialog-content">{children}</div>
      {footer && <footer className="dialog-footer">{footer}</footer>}
    </div>
  </div>;
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description: string }) {
  return <div className="setting-toggle"><div><span>{label}</span><p>{description}</p></div><button type="button" className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span>{checked && <Check size={11}/>}</span></button></div>;
}

export function SettingsPanel({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  const change = <K extends keyof Settings,>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  const mn = settings.language === 'mn';
  return <Dialog eyebrow={mn ? 'ӨӨРТӨӨ ТОХИРУУЛ' : 'MAKE YOURSELF COMFORTABLE'} title={mn ? 'Тохиргоо' : 'Settings'} onClose={onClose} className="settings-dialog" footer={<><span>{mn ? 'Өөрчлөлт автоматаар хадгалагдана.' : 'Changes are saved automatically.'}</span><button className="text-button" onClick={onClose}>{mn ? 'ШӨНӨ РҮҮ БУЦАХ' : 'BACK TO THE NIGHT'} <ChevronRight size={14}/></button></>}>
    <div className="setting-group"><span className="field-label">{mn ? 'ХЭЛ / LANGUAGE' : 'LANGUAGE / ХЭЛ'}</span><div className="segmented"><button className={settings.language === 'en' ? 'selected' : ''} onClick={() => change('language', 'en')}>English</button><button className={settings.language === 'mn' ? 'selected' : ''} onClick={() => change('language', 'mn')}>Монгол</button></div></div>
    <div className="settings-sliders">
      <label className="setting-range"><span><Volume2 size={16}/> Master audio <output>{settings.volume}%</output></span><input aria-label="Master audio" type="range" min="0" max="100" value={settings.volume} onChange={e => change('volume', +e.target.value)}/></label>
      <label className="setting-range"><span><Monitor size={16}/> Brightness <output>{Math.round(settings.brightness * 100)}%</output></span><input aria-label="Brightness" type="range" min="0.65" max="1.6" step="0.05" value={settings.brightness} onChange={e => change('brightness', +e.target.value)}/><small>The corridor should be dark, but its doors should remain visible.</small></label>
      <label className="setting-range"><span><Mouse size={16}/> Look sensitivity <output>{settings.sensitivity.toFixed(1)}x</output></span><input aria-label="Look sensitivity" type="range" min="0.3" max="2" step="0.1" value={settings.sensitivity} onChange={e => change('sensitivity', +e.target.value)}/></label>
    </div>
    <div className="setting-group"><span className="field-label">GRAPHICS QUALITY</span><div className="segmented"><button className={settings.graphics === 'low' ? 'selected' : ''} onClick={() => change('graphics', 'low')}>Performance</button><button className={settings.graphics === 'high' ? 'selected' : ''} onClick={() => change('graphics', 'high')}>Cinematic</button></div></div>
    <div className="setting-group"><span className="field-label">{mn ? 'ҮНДСЭН КАМЕР' : 'PRIMARY CAMERA'}</span><div className="segmented camera-options">{(['third', 'shoulder', 'first'] as const).map(mode => <button key={mode} className={settings.cameraMode === mode ? 'selected' : ''} onClick={() => change('cameraMode', mode)}>{mode === 'third' ? mn ? '3-р бие' : 'Third person' : mode === 'shoulder' ? mn ? 'Мөрний' : 'Shoulder' : mn ? '1-р бие' : 'First person'}</button>)}</div><small>{mn ? 'Тоглож байхдаа V товчоор камерыг шууд сольж болно.' : 'Press V during gameplay to cycle camera views.'}</small></div>
    <div className="setting-group"><span className="field-label">ENGLISH DIFFICULTY</span><div className="segmented difficulty-options">{(['beginner', 'intermediate', 'advanced'] as const).map(d => <button key={d} className={settings.difficulty === d ? 'selected' : ''} onClick={() => change('difficulty', d)}>{d}</button>)}</div><small>Only the language changes. Every difficulty has the same clues and solutions.</small></div>
    <Toggle checked={settings.subtitles} onChange={() => change('subtitles', !settings.subtitles)} label="Subtitles" description="Show radio transmissions and environmental captions."/>
    <Toggle checked={settings.reducedMotion} onChange={() => change('reducedMotion', !settings.reducedMotion)} label="Reduced motion" description="Remove camera bob, screen shake, and menu movement."/>
    <Toggle checked={settings.cinematicCameras} onChange={() => change('cinematicCameras', !settings.cinematicCameras)} label={mn ? 'Өрөөний cinematic камер' : 'Cinematic room cameras'} description={mn ? 'Шинэ өрөөнд ороход богино тогтсон өнцөг харуулна.' : 'Show a brief fixed-camera composition when entering major rooms.'}/>
  </Dialog>;
}

const CONTROLS = [
  ['W A S D', 'Move'], ['MOUSE', 'Look around'], ['V', 'Cycle third / shoulder / first-person cameras'], ['SHIFT', 'Sprint / makes noise'], ['C', 'Crouch / move quietly'], ['E', 'Interact / leave hiding'], ['F', 'Toggle flashlight'], ['B', 'Replace battery'], ['Q', 'Throw a distraction'], ['H', 'Hide in a nearby locker'], ['I', 'Inventory & documents'], ['M', 'Hospital map'], ['J', 'Vocabulary notebook'], ['TAB', 'Mission objectives'], ['ESC', 'Pause the shift'],
];

export function ControlsPanel({ onClose }: { onClose: () => void }) {
  return <Dialog eyebrow="READ THIS BEFORE MIDNIGHT" title="How to survive" onClose={onClose} className="controls-dialog" footer={<span><Headphones size={15}/> Headphones recommended. Fear is better in stereo.</span>}>
    <p className="intro-text">Your shift lasts eight real minutes. Survive until 6:00 AM, uncover what happened, and find the north exit.</p>
    <div className="survival-rule"><span className="rule-number">01</span><p><strong>Keep the light on it.</strong>The patient cannot move while you watch it with your flashlight. Look away only when you have a way out.</p></div>
    <div className="controls-grid">{CONTROLS.map(([key, label]) => <div className="control-row" key={key}><kbd>{key}</kbd><span>{label}</span></div>)}</div>
    <div className="touch-instructions"><span className="field-label">PLAYING ON TOUCH?</span><p>Use the left joystick to move. Drag the right side to look. The on-screen buttons control interaction, sprinting, crouching, your flashlight, and distractions.</p></div>
    <p className="small-note">Break line of sight before hiding. Running and opening the wrong cabinet attract attention. Read carefully: your choices have consequences. Language hints never reveal an answer outright.</p>
  </Dialog>;
}

export function LoadingScreen() {
  return <div className="loading-screen"><HospitalMark/><div className="loading-center"><div className="loading-cross"/><span className="eyebrow">PREPARING YOUR SHIFT</span><p>Some places remember.</p><div className="loading-line"><span/></div></div><span className="loading-footer">BUILDING THE HOSPITAL / NO EXTERNAL ASSETS REQUIRED</span></div>;
}