import React, { useEffect, useMemo, useRef, useState } from 'react';

type CastSignal = {
  type: string;
  room?: string;
  label?: string;
  message?: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type LocalCastControllerProps = {
  open: boolean;
  onClose: () => void;
};

const castSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/__memoriya-cast`;
};

const makeRoomCode = () => String(Math.floor(100000 + Math.random() * 900000));

const sendSignal = (socket: WebSocket | null, message: CastSignal) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
};

type LocalWakeLock = {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

const requestLocalWakeLock = async () => {
  const wakeLock = (navigator as Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<LocalWakeLock> };
  }).wakeLock;
  if (!wakeLock || document.visibilityState !== 'visible') return null;
  try {
    return await wakeLock.request('screen');
  } catch {
    return null;
  }
};

export const LocalCastController: React.FC<LocalCastControllerProps> = ({ open, onClose }) => {
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const wakeLockRef = useRef<LocalWakeLock | null>(null);
  const roomRef = useRef('');
  const disconnectTimerRef = useRef<number | null>(null);
  const [socketReady, setSocketReady] = useState(false);
  const [receivers, setReceivers] = useState<Array<{ room: string; label: string }>>([]);
  const [room, setRoom] = useState('');
  const [casting, setCasting] = useState(false);
  const [status, setStatus] = useState('Looking for TVs on this Wi-Fi…');
  const [error, setError] = useState('');

  const stopCasting = () => {
    if (disconnectTimerRef.current !== null) {
      window.clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
    sendSignal(socketRef.current, { type: 'cast:stop', room: roomRef.current || room.trim() });
    const peer = peerRef.current;
    peerRef.current = null;
    peer?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    pendingCandidatesRef.current = [];
    void wakeLockRef.current?.release().catch(() => undefined);
    wakeLockRef.current = null;
    setCasting(false);
    setStatus(socketReady ? 'Looking for TVs on this Wi-Fi…' : 'Starting local cast service…');
  };

  useEffect(() => {
    if (!open) return undefined;
    const socket = new WebSocket(castSocketUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      setSocketReady(true);
      setStatus('Looking for TVs on this Wi-Fi…');
      sendSignal(socket, { type: 'cast:register', label: 'Phone controller' });
    };
    socket.onmessage = event => {
      let message: CastSignal;
      try {
        message = JSON.parse(String(event.data)) as CastSignal;
      } catch {
        return;
      }
      if (message.type === 'cast:receiver-online' && message.room) {
        setReceivers(current => current.some(item => item.room === message.room)
          ? current
          : [...current, { room: message.room!, label: message.label || 'Memoriya TV' }]);
      }
      if (message.type === 'cast:receiver-offline' && message.room) {
        setReceivers(current => current.filter(item => item.room !== message.room));
        if (roomRef.current === message.room && (peerRef.current || streamRef.current)) {
          setError('The TV went offline. Reconnect the TV and start casting again.');
          stopCasting();
        }
      }
      if (message.type === 'cast:error') setError(message.message || 'The local cast service rejected this connection.');
      if (message.type === 'cast:answer' && message.description && peerRef.current) {
        const peer = peerRef.current;
        void peer.setRemoteDescription(message.description).then(async () => {
          for (const candidate of pendingCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate).catch(() => undefined);
        }).catch(() => {
          setError('The TV could not accept this cast. Reconnect the TV and try again.');
        });
      }
      if (message.type === 'cast:ice' && message.candidate && peerRef.current) {
        if (peerRef.current.remoteDescription) void peerRef.current.addIceCandidate(message.candidate).catch(() => undefined);
        else pendingCandidatesRef.current.push(message.candidate);
      }
      if (message.type === 'cast:receiver-ready') setStatus('Connecting to TV…');
    };
    socket.onerror = () => {
      setSocketReady(false);
      setError('Local cast service is not running. Start “npm run realtime” on the PC.');
    };
    socket.onclose = () => {
      setSocketReady(false);
      if (peerRef.current || streamRef.current) stopCasting();
    };
    return () => {
      stopCasting();
      socket.close();
      socketRef.current = null;
      setSocketReady(false);
    };
    // The cast panel owns the socket lifecycle; stopCasting is intentionally
    // kept stable for cleanup rather than recreated on every status change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!casting) return undefined;
    const reacquireWakeLock = () => {
      if (document.visibilityState !== 'visible' || wakeLockRef.current) return;
      void requestLocalWakeLock().then(lock => {
        if (!lock || !casting) {
          void lock?.release().catch(() => undefined);
          return;
        }
        wakeLockRef.current = lock;
      });
    };
    reacquireWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        wakeLockRef.current = null;
        reacquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [casting]);

  const startCasting = async () => {
    setError('');
    const targetRoom = room.trim();
    if (!/^\d{6}$/.test(targetRoom)) {
      setError('Enter the six-digit TV code shown on the TV first.');
      return;
    }
    if (!socketReady) {
      setError('The local cast service is not connected. Start “npm run realtime” on the PC.');
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError('This phone browser does not support local screen sharing. Use a recent Chrome browser.');
      return;
    }
    if (peerRef.current || streamRef.current) {
      setError('A cast is already starting. Stop it before starting another cast.');
      return;
    }
    try {
      // The browser permission prompt is required by the platform. Choose the
      // Story Mode tab/window and enable Share audio when the browser offers it.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 } },
        audio: true,
      });
      streamRef.current = stream;
      roomRef.current = targetRoom;
      pendingCandidatesRef.current = [];
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getTracks().forEach(track => peer.addTrack(track, stream));
      peer.onicecandidate = event => {
        if (event.candidate) sendSignal(socketRef.current, { type: 'cast:ice', room: targetRoom, candidate: event.candidate.toJSON() });
      };
      peer.onconnectionstatechange = () => {
        if (peerRef.current !== peer) return;
        if (peer.connectionState === 'connected') {
          if (disconnectTimerRef.current !== null) {
            window.clearTimeout(disconnectTimerRef.current);
            disconnectTimerRef.current = null;
          }
          setStatus('Casting Story Mode to TV');
        }
        if (peer.connectionState === 'disconnected') {
          setStatus('TV connection interrupted. Reconnecting…');
          if (disconnectTimerRef.current !== null) window.clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = window.setTimeout(() => {
            disconnectTimerRef.current = null;
            if (peerRef.current === peer && peer.connectionState !== 'connected') stopCasting();
          }, 8000);
        }
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') stopCasting();
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', stopCasting, { once: true });
      sendSignal(socketRef.current, { type: 'cast:join', room: targetRoom, label: 'Phone controller' });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal(socketRef.current, { type: 'cast:offer', room: targetRoom, description: offer });
      setCasting(true);
      setStatus('Connecting to TV…');
      wakeLockRef.current = await requestLocalWakeLock();
    } catch (castError) {
      stopCasting();
      if (castError instanceof DOMException && castError.name === 'NotAllowedError') setError('Screen sharing was cancelled. Tap Cast again and allow it.');
      else setError('Could not start local screen sharing on this phone.');
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Cast Story Mode locally">
      <section className="w-full max-w-md rounded-2xl border border-cyan-300/30 bg-slate-950 p-5 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Cast to TV</h2>
            <p className="mt-1 text-xs text-white/60">Offline local screen sharing over this Wi‑Fi</p>
          </div>
          <button type="button" className="rounded-xl border border-white/15 px-3 py-2" onClick={() => { stopCasting(); onClose(); }} aria-label="Close cast panel">×</button>
        </div>
        <label className="mt-5 block text-xs font-bold uppercase tracking-[0.14em] text-white/60">
          Available TVs / TV code
          <select className="mt-2 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm normal-case tracking-normal text-white" value={room} onChange={event => setRoom(event.target.value)}>
            <option value="" className="bg-slate-900">Choose a TV…</option>
            {receivers.map(receiver => <option key={receiver.room} value={receiver.room} className="bg-slate-900">{receiver.label} · {receiver.room}</option>)}
          </select>
        </label>
        <input className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm" inputMode="numeric" maxLength={6} placeholder="Or enter TV code" value={room} onChange={event => setRoom(event.target.value.replace(/\D/g, '').slice(0, 6))} />
        <p className="mt-3 text-xs leading-5 text-white/60">Open <code>?cast=receiver</code> on the TV first. When the browser asks, select the Story Mode tab/window and enable audio sharing.</p>
        {error && <p className="mt-3 rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">{error}</p>}
        <p className="mt-3 text-xs text-cyan-200" aria-live="polite">{status}</p>
        <div className="mt-5 flex gap-3">
          {!casting
            ? <button type="button" className="flex-1 rounded-xl bg-cyan-300 px-4 py-3 font-black text-slate-950 disabled:opacity-50" disabled={!socketReady} onClick={() => void startCasting()}>Start casting</button>
            : <button type="button" className="flex-1 rounded-xl bg-rose-400 px-4 py-3 font-black text-slate-950" onClick={stopCasting}>Stop casting</button>}
          <button type="button" className="rounded-xl border border-white/15 px-4 py-3 disabled:opacity-40" disabled={casting} onClick={onClose}>{casting ? 'Stop first' : 'Done'}</button>
        </div>
      </section>
    </div>
  );
};

export const LocalCastReceiver: React.FC = () => {
  const code = useMemo(makeRoomCode, []);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('Waiting for phone…');
  const [error, setError] = useState('');
  const [hasStream, setHasStream] = useState(false);
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);

  useEffect(() => {
    const socket = new WebSocket(castSocketUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      setConnected(true);
      sendSignal(socket, { type: 'cast:register', role: 'receiver', room: code, label: 'Memoriya TV' });
    };
    socket.onmessage = event => {
      let message: CastSignal;
      try {
        message = JSON.parse(String(event.data)) as CastSignal;
      } catch {
        return;
      }
      if (message.type === 'cast:offer' && message.description) {
        pendingCandidatesRef.current = [];
        const peer = new RTCPeerConnection();
        peerRef.current?.close();
        peerRef.current = peer;
        peer.onicecandidate = iceEvent => {
          if (iceEvent.candidate) sendSignal(socketRef.current, { type: 'cast:ice', room: code, candidate: iceEvent.candidate.toJSON() });
        };
        peer.ontrack = trackEvent => {
          const stream = trackEvent.streams[0] || new MediaStream([trackEvent.track]);
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            setHasStream(true);
            if (armedRef.current) void videoRef.current.play().catch(() => undefined);
          }
        };
        peer.onconnectionstatechange = () => {
          if (peerRef.current !== peer) return;
          if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) {
            peerRef.current = null;
            peer.close();
            pendingCandidatesRef.current = [];
            if (videoRef.current) videoRef.current.srcObject = null;
            setHasStream(false);
            setArmed(false);
            armedRef.current = false;
          }
          if (peer.connectionState === 'connected') setStatus('Connected — Story Mode is playing here');
          if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) setStatus('Phone disconnected. Waiting…');
        };
        void peer.setRemoteDescription(message.description)
          .then(async () => {
            for (const candidate of pendingCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate).catch(() => undefined);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            sendSignal(socket, { type: 'cast:answer', room: code, description: answer });
          })
          .catch(() => setError('The TV could not open the phone stream. Try casting again.'));
      }
      if (message.type === 'cast:ice' && message.candidate) {
        if (peerRef.current?.remoteDescription) void peerRef.current.addIceCandidate(message.candidate).catch(() => undefined);
        else pendingCandidatesRef.current.push(message.candidate);
      }
      if (message.type === 'cast:stop') {
        peerRef.current?.close();
        peerRef.current = null;
        pendingCandidatesRef.current = [];
        if (videoRef.current) videoRef.current.srcObject = null;
        setHasStream(false);
        setArmed(false);
        armedRef.current = false;
        setStatus('Phone stopped casting. Waiting…');
      }
    };
    socket.onerror = () => setError('Start “npm run realtime” on the PC, then reload this TV page.');
    return () => {
      peerRef.current?.close();
      socket.close();
      socketRef.current = null;
    };
  }, [code]);

  return (
    <main className="grid min-h-screen place-items-center bg-black p-6 text-white">
      <section className="relative flex min-h-[70vh] w-full max-w-6xl items-center justify-center overflow-hidden rounded-3xl border border-cyan-300/20 bg-slate-950">
        <video ref={videoRef} className="h-full max-h-[88vh] w-full object-contain" autoPlay playsInline controls={false} />
        {(!hasStream || !armed) && (
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.3em] text-cyan-200">Memoriya local TV</div>
              <div className="mt-5 text-7xl font-black tracking-[0.18em]">{code}</div>
              <p className="mt-4 text-white/60">Open Story Mode on your phone and choose this TV.</p>
              <button type="button" className="mt-6 rounded-xl bg-cyan-300 px-5 py-3 font-black text-slate-950" onClick={() => { armedRef.current = true; setArmed(true); void videoRef.current?.play(); }}>{connected ? (hasStream ? 'Play cast' : 'Ready for phone') : 'Connect to local service'}</button>
            </div>
          </div>
        )}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-xs text-cyan-100">{status}</div>
        {error && <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-xl bg-rose-500/80 px-4 py-2 text-xs">{error}</div>}
      </section>
    </main>
  );
};
