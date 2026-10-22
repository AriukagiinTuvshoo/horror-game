import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowRight, Award, BriefcaseMedical, ChevronRight, Clock3, Headphones, HeartPulse, HelpCircle, Play, RotateCcw, Search, Settings2, ShieldCheck, UserRound, Volume2, VolumeX } from 'lucide-react';
import { audio } from './game/audio';
import { ENDINGS } from './game/content';
import { clearSave, evidenceCount, formatTime, isVictoryEnding, loadGame, loadScores, loadSettings, newGame, recordScore, SETTINGS_KEY, writeStorage } from './game/model';
import { ui } from './game/i18n';
import type { GameState, ScoreEntry, Settings } from './game/types';
import { ControlsPanel, Dialog, HospitalMark, LoadingScreen, PrimaryButton, SettingsPanel } from './components/UI';

const GameView = lazy(() => import('./components/GameView'));
type MenuDialog = 'settings' | 'controls' | 'credits' | 'scores' | 'new-game' | 'avatar' | null;

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'game' | 'ending'>('menu');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [dialog, setDialog] = useState<MenuDialog>(null);
  const [checkpoint, setCheckpoint] = useState<GameState | null>(loadGame);
  const [run, setRun] = useState<GameState | null>(null);
  const [ending, setEnding] = useState<GameState | null>(null);
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [previousVolume, setPreviousVolume] = useState(65);

  useEffect(() => { writeStorage(SETTINGS_KEY, settings); audio.setVolume(settings.volume); }, [settings]);
  useEffect(() => () => audio.dispose(), []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (screen === 'menu' && !dialog && e.code === 'Enter' && e.target === document.body) begin();
      if (screen === 'ending' && e.code === 'KeyR') start(false);
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [screen, dialog, checkpoint]);

  function start(continuing: boolean) {
    audio.start(); audio.setVolume(settings.volume); audio.stopSpeech();
    const state = continuing ? loadGame() : newGame();
    if (!state) { setCheckpoint(null); return; }
    setRun(state); setDialog(null); setEnding(null); setScreen('game');
  }
  function begin() { if (checkpoint) setDialog('new-game'); else start(false); }
  function returnToMenu() { setCheckpoint(loadGame()); setDialog(null); setScreen('menu'); setRun(null); }
  function endGame(state: GameState) {
    // Victory endings (escape/truth/secret) clear the checkpoint so Continue is disabled;
    // defeat/trapped intentionally preserves the last checkpoint for RETRY FROM CHECKPOINT.
    if (state.ending && isVictoryEnding(state.ending)) {
      clearSave();
      setCheckpoint(null);
    }
    setEnding(state); setScores(recordScore(state)); setScreen('ending');
  }
  function toggleSound() {
    audio.start();
    if (settings.volume === 0) setSettings({ ...settings, volume: previousVolume || 65 });
    else { setPreviousVolume(settings.volume); setSettings({ ...settings, volume: 0 }); }
  }

  if (screen === 'game' && run) return <Suspense fallback={<LoadingScreen/>}><GameView key={run.runId} initialState={run} settings={settings} onSettings={setSettings} onMenu={returnToMenu} onEnd={endGame}/></Suspense>;

  if (screen === 'ending' && ending?.ending) {
    const story = ENDINGS[ending.ending];
    return <main className={`ending-screen ${ending.ending === 'trapped' ? 'bad-ending' : ''} ${settings.reducedMotion ? 'reduced-motion' : ''}`}><div className="cinematic-background"/><div className="ending-shade"/><div className="film-grain"/><header className="menu-header"><HospitalMark/><span className="archive-label">SHIFT COMPLETE / FILE {story.number.padStart(2, '0')}</span></header><div className="ending-content"><span className="ending-kicker"><span/> ENDING {story.number} / {story.label}</span><h1>{story.title}</h1><p>{story.body}</p><div className="ending-stats"><div><span>FINAL SCORE</span><strong>{Math.round(ending.score + ending.elapsed * 2).toLocaleString()}</strong></div><div><span>EVIDENCE</span><strong>{evidenceCount(ending)}<small> / 4</small></strong></div><div><span>WORDS LEARNED</span><strong>{ending.words.length}</strong></div></div><div className="ending-buttons"><PrimaryButton onClick={() => start(ending.ending === 'trapped' && !!loadGame())}>{ending.ending === 'trapped' && loadGame() ? 'RETRY FROM CHECKPOINT' : 'WORK ANOTHER SHIFT'}</PrimaryButton><button className="text-button" onClick={returnToMenu}>MAIN MENU <ArrowRight size={15}/></button></div><button className="ending-records text-button" onClick={() => setDialog('scores')}><Award size={15}/> VIEW SHIFT RECORDS <ChevronRight size={13}/></button><span className="restart-hint"><kbd>R</kbd> INSTANT NEW SHIFT</span></div><footer className="menu-footer"><span>NOT EVERYONE LEAVES THE SAME WAY.</span><span>{ending.player.health <= 0 ? 'CAUGHT BY THE PATIENT' : formatTime(ending.elapsed)}</span></footer>{dialog === 'scores' && <Scores scores={scores} onClose={() => setDialog(null)}/>}</main>;
  }

  return <main className={`title-screen ${settings.reducedMotion ? 'reduced-motion' : ''}`}>
    <div className="cinematic-background" role="img" aria-label="An abandoned hospital corridor, lit by cold fluorescent lights. An empty wheelchair waits in the darkness."/>
    <div className="cinematic-shade"/>
    <div className="atmospheric-haze"/>
    <div className="film-grain"/>
    <div className="screen-frame"/>
    <header className="menu-header"><HospitalMark/><div className="menu-header-right"><span className="facility-status"><i/> FACILITY OFFLINE</span><button className="sound-toggle" onClick={toggleSound} aria-label={settings.volume === 0 ? 'Enable sound' : 'Mute sound'}>{settings.volume === 0 ? <VolumeX size={17}/> : <Volume2 size={17}/>}<span>SOUND {settings.volume === 0 ? 'OFF' : 'ON'}</span></button></div></header>
    <section className="title-composition" aria-label="The Last Night Shift main menu">
      <div className="title-eyebrow"><span/> AN IMMERSIVE HORROR EXPERIENCE</div>
      <h1 className="game-title"><span>THE LAST</span><span>NIGHT SHIFT<span className="title-period">.</span></span></h1>
      <span className="patient-zero-title">PATIENT ZERO / 1999</span>
      <p className="title-description">{ui(settings.language, 'tagline')}</p>
      <div className="main-menu-actions"><button className="begin-shift" onClick={begin}><Play size={16} fill="currentColor" strokeWidth={0}/><span>{ui(settings.language, 'newShift')}</span><ArrowRight size={20} strokeWidth={1.5}/></button><button className={`continue-button ${!checkpoint ? 'no-save' : ''}`} onClick={() => start(true)} disabled={!checkpoint}><RotateCcw size={16}/><span>{ui(settings.language, 'continue')}</span>{checkpoint ? <span className="continue-time">{formatTime(checkpoint.elapsed)} <ChevronRight size={13}/></span> : <span className="no-checkpoint">NO SAVED SHIFT</span>}</button></div>
      <nav className="secondary-menu" aria-label="Game information"><button onClick={() => setDialog('avatar')}><UserRound size={15}/> {settings.language === 'mn' ? 'ДҮР' : 'AVATAR'}</button><span/><button onClick={() => setDialog('settings')}><Settings2 size={15}/> {ui(settings.language, 'settings')}</button><span/><button onClick={() => setDialog('controls')}><HelpCircle size={15}/> {ui(settings.language, 'how')}</button><span/><button onClick={() => setDialog('credits')}>{ui(settings.language, 'credits')} <ArrowRight size={12}/></button></nav>
    </section>
    <aside className="night-caption"><span className="caption-line"/><div><span>YOUR SHIFT ENDS AT 6:00 AM.</span><p>Make sure you do, too.</p></div></aside>
    <footer className="menu-footer"><div className="experience-label"><span className="tiny-cross">+</span><span>READ CAREFULLY. LISTEN CLOSELY. SURVIVE.</span></div><div className="footer-right"><button onClick={() => setDialog('scores')}><Award size={14}/> SHIFT RECORDS</button><span className="footer-divider"/><span className="headphones-note"><Headphones size={15}/> HEADPHONES RECOMMENDED</span><span className="version-label">V. 1.0</span></div></footer>
    {dialog === 'settings' && <SettingsPanel settings={settings} onChange={setSettings} onClose={() => setDialog(null)}/>}
    {dialog === 'controls' && <ControlsPanel onClose={() => setDialog(null)}/>}
    {dialog === 'scores' && <Scores scores={scores} onClose={() => setDialog(null)}/>}
    {dialog === 'avatar' && <AvatarSelect settings={settings} onChange={setSettings} onClose={() => setDialog(null)}/>}
    {dialog === 'credits' && <Dialog eyebrow="THE PEOPLE BEHIND THE SILENCE" title="Credits & field notes" onClose={() => setDialog(null)} className="credits-dialog"><div className="credit-entry"><span>THE EXPERIENCE</span><h3>The Last Night Shift</h3><p>An original browser survival game about the things we choose to hear, and the truths we choose to tell.</p></div><div className="credit-entry"><span>BUILT FOR THE BROWSER</span><p>React, TypeScript, and Three.js. Hospital geometry, worn materials, environmental effects, enemy animation, and audio are generated locally. No paid services or external APIs are required.</p></div><div className="credit-entry"><span>ART & TYPOGRAPHY</span><p>Original AI-generated title artwork. Barlow Condensed, Manrope, and IBM Plex Mono, distributed under the SIL Open Font License. Interface icons by Lucide, ISC license.</p></div><div className="content-notice"><HeartPulse size={19}/><div><b>Before you start</b><p>Contains suspense, sudden sounds, flashing lights, and themes of medical malpractice. No graphic violence. Enable Reduced Motion and lower audio in Settings if preferred.</p></div></div><p className="small-note">Progress and shift records are stored only in this browser. Clearing site data removes them. Voice playback uses your browser's optional English speech engine; every transmission is also available in writing.</p></Dialog>}
    {dialog === 'new-game' && <Dialog eyebrow="A SHIFT IS ALREADY IN PROGRESS" title="Start again?" onClose={() => setDialog(null)}><p className="document-body">Your current checkpoint is at {formatTime(checkpoint?.elapsed ?? 0)}. A new shift will replace it when you reach your first checkpoint.</p><PrimaryButton onClick={() => start(false)}>BEGIN A NEW SHIFT</PrimaryButton><button className="new-game-continue text-button" onClick={() => start(true)}>CONTINUE THE CURRENT SHIFT <ArrowRight size={14}/></button></Dialog>}
  </main>;
}

function AvatarSelect({ settings, onChange, onClose }: { settings: Settings; onChange: (settings: Settings) => void; onClose: () => void }) {
  const avatars = [
    { id: 'guard' as const, icon: ShieldCheck, name: settings.language === 'mn' ? 'Шөнийн хамгаалагч' : 'Night Guard', detail: settings.language === 'mn' ? 'Тогтвортой, анхны дүр. Хуучин ажилтны тэмдэгтэй.' : 'The canonical survivor. Wears the old hospital security badge.' },
    { id: 'paramedic' as const, icon: BriefcaseMedical, name: settings.language === 'mn' ? 'Яаралтай тусламжийн ажилтан' : 'Paramedic', detail: settings.language === 'mn' ? '1999 оны түргэн тусламжийн хувцас, эмнэлгийн таних тэмдэгтэй.' : 'A 1999 emergency uniform with reflective medical markings.' },
    { id: 'investigator' as const, icon: Search, name: settings.language === 'mn' ? 'Хувийн мөрдөгч' : 'Investigator', detail: settings.language === 'mn' ? 'Бараан хүрэмтэй, Patient Zero хэргийг мөрдөхөөр ирсэн.' : 'A worn coat and red case band, here to investigate Patient Zero.' },
  ];
  return <Dialog eyebrow="PATIENT ZERO / PERSONNEL" title={settings.language === 'mn' ? 'Өөрийн дүрээ сонго.' : 'Choose who enters.'} onClose={onClose} className="avatar-dialog"><div className="avatar-list">{avatars.map(a => <button key={a.id} className={`avatar-choice ${settings.avatar === a.id ? 'selected' : ''}`} onClick={() => onChange({ ...settings, avatar: a.id })}><span className={`avatar-silhouette ${a.id}`}><a.icon size={28}/></span><span><b>{a.name}</b><small>{a.detail}</small></span>{settings.avatar === a.id && <span className="avatar-selected">SELECTED</span>}</button>)}</div><p className="small-note">{settings.language === 'mn' ? 'Дүр бүр бодит 3D биетэй. Тоглоомын тэнцвэр ижил бөгөөд сонголт зөвхөн харагдах байдал, дүрийн өнгө төрхийг өөрчилнө.' : 'Every avatar has a real animated 3D body. Their gameplay balance is identical; the choice changes silhouette, uniform, and atmosphere.'}</p><PrimaryButton onClick={onClose}>{settings.language === 'mn' ? 'ЭЭЛЖИНД БЭЛЭН' : 'READY FOR THE SHIFT'}</PrimaryButton></Dialog>;
}

function Scores({ scores, onClose }: { scores: ScoreEntry[]; onClose: () => void }) {
  return <Dialog eyebrow="ST. MERCY / PERSONNEL ARCHIVE" title="Shift records" onClose={onClose} className="scores-dialog" footer={<><ShieldCheck size={14}/><span>STORED LOCALLY. YOUR NIGHTS STAY YOURS.</span></>}>
    {scores.length === 0 ? <div className="scores-empty"><Clock3 size={30} strokeWidth={1}/><h3>No one has clocked out. Yet.</h3><p>Complete a shift to leave your mark. Survive, gather evidence, learn new words, and make your choices count.</p><button className="text-button" onClick={onClose}>YOUR NIGHT IS WAITING <ArrowRight size={14}/></button></div> : <><div className="score-table-heading"><span>GUARD / OUTCOME</span><span>SHIFT SCORE</span></div>{scores.map((entry, i) => <div className="score-row" key={entry.id}><span className={`score-rank ${i === 0 ? 'first' : ''}`}>{String(i + 1).padStart(2, '0')}</span><div><strong>{ENDINGS[entry.ending]?.label ?? 'SHIFT COMPLETE'}</strong><span>{entry.date} / {entry.missions} objectives / {entry.words} words</span></div><b>{entry.score.toLocaleString()}</b></div>)}<p className="small-note">Earn points for surviving, completing objectives, collecting evidence, and building your vocabulary. Only your seven highest-scoring shifts are kept.</p></>}
  </Dialog>;
}
