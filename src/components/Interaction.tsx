import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Delete, HelpCircle, LockKeyhole, Radio, Volume2, X } from 'lucide-react';
import { audio } from '../game/audio';
import { DOCUMENTS } from '../game/content';
import { MN_DOCUMENTS } from '../game/i18n';
import { has } from '../game/model';
import { NIGHT_SECONDS } from '../game/world';
import type { HospitalEngine } from '../game/engine';
import type { GameState, Settings, WorldObject } from '../game/types';
import { Dialog, PrimaryButton } from './UI';

export function Interaction({ object, state, settings, engine, onClose }: { object: WorldObject; state: GameState; settings: Settings; engine: HospitalEngine; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [hint, setHint] = useState(false);
  const [error, setError] = useState('');
  const [names, setNames] = useState(has(state, 'patient-file') && !has(state, 'protected-names') && !has(state, 'shared-names'));
  const [feed, setFeed] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const id = object.id;
  const doc = DOCUMENTS[id];
  const localizedDoc = settings.language === 'mn' ? MN_DOCUMENTS[id] : null;

  useEffect(() => {
    if (id === 'monitor' && has(state, 'power')) engine.setFeed(0);
    return () => { engine.setFeed(null); audio.stopSpeech(); };
  }, [engine, id]);

  function action(actionId: string, value = '', close = true) {
    const result = engine.perform(actionId, value);
    if (!result.ok) { setError(result.message); return; }
    setError('');
    if (close) onClose();
  }
  function unlock() {
    const result = engine.perform(id, code);
    if (result.ok) {
      if (id === 'records') { setNames(true); setError(''); }
      else onClose();
    } else { setError(result.message); setCode(''); }
  }

  if (id === 'monitor' && has(state, 'power')) {
    const feeds = ['NORTH CORRIDOR', 'WARD C', 'PATIENT RECORDS', 'ISOLATION'];
    const canBroadcast = has(state, 'witness-tape');
    return <div className="surveillance-interface" role="dialog" aria-modal="true" aria-label="Security surveillance" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="camera-scanlines"/>
      <header className="camera-header"><div><Radio size={19}/><span>ST. MERCY <b>SECURITY NETWORK</b></span></div><button className="icon-button" aria-label="Leave surveillance" onClick={onClose}><X size={22}/></button></header>
      <div className="camera-feed-label"><span className="record-dot"/> REC <i/> CAM 0{feed + 1}<h2>{feeds[feed]}</h2><span className="camera-signal">SIGNAL STRENGTH ||||</span></div>
      <div className="camera-controls"><span className="eyebrow">LIVE SURVEILLANCE</span><h3>{canBroadcast ? 'Let them hear the truth.' : 'Find what should not be here.'}</h3><p>{canBroadcast ? 'The transmitter is working. The voice asks you to introduce yourself first. Nora told you not to.' : 'Check the feeds. Nora reported movement in Ward C. The cameras can see things the dark keeps hidden.'}</p>
        <div className="camera-buttons">{feeds.map((name, i) => <button key={name} className={feed === i ? 'selected' : ''} onClick={() => { setFeed(i); engine.setFeed(i); audio.click(); setError(''); }}><span>0{i + 1}</span>{name}<ChevronRight size={13}/></button>)}</div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {canBroadcast ? <div className="interaction-actions"><PrimaryButton onClick={() => action('broadcast', 'truth')}>{has(state, 'broadcast') ? 'TESTIMONY IS ON AIR' : 'BROADCAST THE TESTIMONY'}</PrimaryButton>{!has(state, 'gave-name') && !has(state, 'broadcast') && <button className="danger-choice text-button" onClick={() => action('broadcast', 'name', false)}>Introduce yourself to the voice <ArrowRight size={14}/></button>}</div> : <PrimaryButton onClick={() => action('camera', feed === 1 ? 'ward' : 'other')}>{has(state, 'camera-checked') ? 'REVIEW WARD MOVEMENT' : 'MARK THE MOVEMENT'}</PrimaryButton>}
        <button className="camera-exit text-button" onClick={onClose}><ArrowLeft size={14}/> LEAVE THE TERMINAL</button>
      </div><div className="camera-corner tl"/><div className="camera-corner bl"/><div className="camera-corner br"/>
    </div>;
  }

  if (id === 'monitor') return <Dialog eyebrow="SECURITY TERMINAL" title="No signal." onClose={onClose}><p className="document-body">The screens are cold. Restore auxiliary power in Maintenance, on the right side of the north corridor.</p><PrimaryButton onClick={onClose}>BACK TO THE CORRIDOR</PrimaryButton></Dialog>;

  if (id === 'exit') return <Dialog eyebrow={state.elapsed >= NIGHT_SECONDS ? '6:00 AM / END OF SHIFT' : 'NORTH ENTRANCE / MAGNETIC LOCK'} title={state.elapsed >= NIGHT_SECONDS ? 'The doors are open.' : 'Not until morning.'} onClose={onClose} className="interaction-dialog">
    <div className="document-body"><p>{state.elapsed >= NIGHT_SECONDS ? 'Dawn presses against the frosted glass. The front doors click open.' : 'The emergency lock is programmed to release at 6:00 AM. The night is still yours to survive.'}</p><p>The radio crackles. A voice that sounds almost like your own says, "There is another way out. Follow me down the stairs."</p><p className="document-emphasis">Nora warned you. Do not follow the voice.</p></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <div className="interaction-actions"><PrimaryButton onClick={() => action('exit', 'front')}>OPEN THE FRONT DOORS</PrimaryButton><button className="choice-button dangerous" onClick={() => action('exit', 'follow')}><span><b>Follow the voice downstairs</b><small>Trust the voice. Leave through the lower stairwell.</small></span><ArrowRight size={17}/></button></div>
  </Dialog>;

  const solved = id === 'generator' ? has(state, 'power') : id === 'ward' ? has(state, 'records-key') : id === 'records' ? has(state, 'protected-names') || has(state, 'shared-names') : id === 'isolation' ? has(state, 'patient-saved') || has(state, 'patient-abandoned') : id === 'secret' ? has(state, 'original-ledger') : false;
  const numeric = (id === 'generator' || id === 'records') && !solved && !names;
  const choice = (id === 'ward' || id === 'isolation') && !solved || id === 'records' && names && !solved;

  return <Dialog eyebrow={localizedDoc?.label ?? doc?.label ?? object.room} title={names && id === 'records' && !solved ? settings.language === 'mn' ? 'Нэр ямар үнэтэй вэ?' : 'What is a name worth?' : localizedDoc?.title ?? doc?.title ?? object.label} onClose={onClose} className={`interaction-dialog ${numeric ? 'keypad-dialog' : ''}`} footer={<><LockKeyhole size={13}/><span>{settings.language === 'mn' ? 'УНШИЖ БАЙХАД ШӨНӨ ЗОГСОНО.' : 'THE NIGHT IS PAUSED WHILE YOU READ.'}</span></>}>
    <div className={numeric ? 'keypad-layout' : ''}>
      <div className="document-column">
        <div className="document-body">{names && id === 'records' && !solved ? settings.language === 'mn' ? 'Радио асав. “Өвчтөнүүдийн нэрийг надад унш. Би Тусгаарлах өрөөг нээнэ.”\n\nГэвч архив хаалгыг аль хэдийн нээсэн. Энэ дуу өөрт хэрэггүй зүйлийг асууж байна.\n\nНэрсийг нууц нотолгоо болгон хадгалах эсвэл радионд өгч болно.' : 'The radio comes alive. "Read me the patient names, and I will unlock Isolation."\n\nBut the archive has already released the door. The voice is asking for something it does not need.\n\nYou can keep a private copy as evidence, or offer the names in exchange for its help.' : localizedDoc?.body ?? doc?.body[settings.difficulty]}</div>
        {id === 'ward' && !solved && <button className="listen-button" onClick={() => {
          const text = settings.difficulty === 'beginner' ? 'Take the key from beneath the empty bed. Leave the red cabinet shut.' : settings.difficulty === 'advanced' ? 'Retrieve the key beneath the unoccupied cot. Refrain from disturbing the crimson cabinet.' : 'The records key is beneath the unoccupied bed. Leave the red cabinet undisturbed.';
          const available = audio.speak(text); setSpeaking(true); if (!available) setError('Voice playback is unavailable or muted. The full transmission is written above.');
        }}><Volume2 size={16}/>{speaking ? 'REPLAY THE TRANSMISSION' : 'LISTEN TO THE TRANSMISSION'}</button>}
        {id === 'tape' && <button className="listen-button" onClick={() => { audio.speak('This is Nora Bell. Vale ordered the alarms disconnected. I stayed because Mara was still in Isolation. Broadcast this recording through Security. Let the names of the dead out. Keep your own name to yourself.'); setSpeaking(true); }}><Volume2 size={16}/>{speaking ? 'REPLAY NORA\'S RECORDING' : 'PLAY NORA\'S RECORDING'}</button>}
        {doc && <div className="language-help"><button onClick={() => setHint(!hint)} aria-expanded={hint}><HelpCircle size={14}/> {settings.language === 'mn' ? 'ХЭЛНИЙ ТУСЛАМЖ' : 'LANGUAGE HELP'} <span>{hint ? '-' : '+'}</span></button>{hint && <p>{localizedDoc?.hint ?? doc.hint}</p>}</div>}
      </div>
      {numeric && <form className="keypad" onSubmit={e => { e.preventDefault(); unlock(); }}>
        <label className="field-label" htmlFor="access-code">FOUR-DIGIT ACCESS CODE</label><input autoFocus id="access-code" aria-label="Access code" value={code} maxLength={4} inputMode="numeric" autoComplete="off" placeholder="- - - -" onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }}/>
        <div className="keypad-grid">{['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'del'].map(n => <button type="button" key={n} aria-label={n === 'del' ? 'Delete digit' : n === 'C' ? 'Clear code' : n} onClick={() => { audio.click(); setCode(c => n === 'C' ? '' : n === 'del' ? c.slice(0, -1) : (c + n).slice(0, 4)); setError(''); }}>{n === 'del' ? <Delete size={16}/> : n}</button>)}</div>
        <PrimaryButton type="submit" disabled={code.length !== 4}>{id === 'generator' ? 'RESTORE POWER' : 'UNSEAL THE FILE'}</PrimaryButton>
      </form>}
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {choice && <div className="interaction-actions choice-list">
      {id === 'ward' && <><button className="choice-button" onClick={() => action('ward', 'bed')}><span><b>Search beneath the empty bed</b><small>Move quietly. Check under the mattress and frame.</small></span><ArrowRight size={17}/></button><button className="choice-button" onClick={() => action('ward', 'cabinet', false)}><span><b>Open the red cabinet</b><small>There could be useful supplies inside.</small></span><ArrowRight size={17}/></button></>}
      {id === 'records' && <><button className="choice-button" onClick={() => action('names', 'protect')}><span><b>Keep a private copy</b><small>Protect the patient names. Take the evidence with you.</small></span><ArrowRight size={17}/></button><button className="choice-button" onClick={() => action('names', 'share')}><span><b>Read the names to the voice</b><small>Perhaps it can help you get out.</small></span><ArrowRight size={17}/></button></>}
      {id === 'isolation' && <><button className="choice-button" onClick={() => action('isolation', 'save')}><span><b>Restore the patient's oxygen</b><small>Use the spare fuse and 12% flashlight battery.</small></span><ArrowRight size={17}/></button><button className="choice-button" onClick={() => action('isolation', 'cut')}><span><b>Disconnect the oxygen supply</b><small>Make this wing quieter. Protect yourself.</small></span><ArrowRight size={17}/></button></>}
    </div>}
    {id === 'secret' && !solved && <form className="word-lock" onSubmit={e => { e.preventDefault(); unlock(); }}><label className="field-label" htmlFor="safe-word">ONE WORD. NO SOUND.</label><div><input autoFocus id="safe-word" aria-label="Memorial safe answer" placeholder="Type your answer" value={code} onChange={e => { setCode(e.target.value.slice(0, 20)); setError(''); }} autoComplete="off"/><button type="submit" aria-label="Unlock memorial safe"><ArrowRight size={20}/></button></div></form>}
    {!numeric && !choice && id !== 'secret' && <div className="interaction-actions"><PrimaryButton onClick={() => id === 'shift' ? action('shift') : id === 'tape' ? action('tape') : onClose()}>{id === 'shift' && !has(state, 'staff-key') ? 'TAKE THE KEY & CLOCK IN' : id === 'tape' && !has(state, 'witness-tape') ? 'TAKE THE WITNESS TAPE' : 'BACK TO THE CORRIDOR'}</PrimaryButton></div>}
    {id === 'secret' && solved && <PrimaryButton onClick={onClose}>THE TRUTH IS IN YOUR HANDS</PrimaryButton>}
    {doc && <p className="vocabulary-note">FIELD NOTES <span>{doc.words.join(' / ')}</span></p>}
  </Dialog>;
}