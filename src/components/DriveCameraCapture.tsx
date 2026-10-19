import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, FlipHorizontal, Grid3X3, Lightbulb, Loader2, Maximize2, X } from 'lucide-react';
import type { DriveMediaFile } from '../services/googleDriveService';
import { googleDriveService } from '../services/googleDriveService';

interface ImageCaptureLike {
  takePhoto: () => Promise<Blob>;
}

interface Props {
  accessToken: string;
  onUploaded: (file: DriveMediaFile) => void;
  onClose: () => void;
}

interface DriveFolderChoice {
  id: string;
  name: string;
}

const CAMERA_FILTERS = {
  natural: { label: 'Natural', css: 'none' },
  vivid: { label: 'Vivid', css: 'saturate(1.3) contrast(1.08) brightness(1.03)' },
  warm: { label: 'Warm', css: 'sepia(.14) saturate(1.25) contrast(1.04) brightness(1.03)' },
  cool: { label: 'Cool', css: 'saturate(.92) hue-rotate(12deg) contrast(1.05) brightness(1.04)' },
  film: { label: 'Film', css: 'sepia(.22) contrast(1.12) saturate(.92) brightness(.98)' },
  mono: { label: 'Mono', css: 'grayscale(1) contrast(1.08)' },
} as const;

type CameraFilter = keyof typeof CAMERA_FILTERS;

const DriveCameraCapture: React.FC<Props> = ({ accessToken, onUploaded, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const imageCaptureRef = useRef<ImageCaptureLike | null>(null);
  const previewUrlRef = useRef('');
  const pendingUploadsRef = useRef(0);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [filter, setFilter] = useState<CameraFilter>('natural');
  const [previewUrl, setPreviewUrl] = useState('');
  const [showLastShot, setShowLastShot] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState('Starting camera…');
  const [error, setError] = useState('');
  const [folderId, setFolderId] = useState('drive-root');
  const [folders, setFolders] = useState<DriveFolderChoice[]>([]);
  const [pendingUploads, setPendingUploads] = useState(0);

  useEffect(() => {
    void googleDriveService.listFolders(accessToken)
      .then(setFolders)
      .catch(() => setFolders([]));
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not provide camera access. Open Memoriya in Chrome or Safari on the phone.');
        return;
      }
      setCameraReady(false);
      setError('');
      streamRef.current?.getTracks().forEach(track => track.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 2560 },
            height: { ideal: 1440 },
            frameRate: { ideal: 30, max: 60 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
          zoom?: { min?: number; max?: number; step?: number };
          torch?: boolean;
        };
        if (capabilities.zoom) {
          const range = {
            min: capabilities.zoom.min ?? 1,
            max: capabilities.zoom.max ?? 1,
            step: capabilities.zoom.step ?? 0.1,
          };
          setZoomRange(range);
          setZoom(range.min);
        } else {
          setZoomRange(null);
        }
        setTorchAvailable(Boolean(capabilities.torch));
        const ImageCaptureConstructor = (window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
        imageCaptureRef.current = ImageCaptureConstructor ? new ImageCaptureConstructor(track) : null;
        setCameraReady(true);
        setStatus('Ready — tap capture to upload to Drive');
      } catch (captureError) {
        if (!cancelled) setError(captureError instanceof Error ? captureError.message : 'Camera permission was denied.');
      }
    };
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      trackRef.current = null;
      setTorchEnabled(false);
      setZoomRange(null);
    };
  }, [facingMode]);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const captureFromVideo = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) throw new Error('Camera is still preparing.');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the photo canvas.');
    context.filter = CAMERA_FILTERS[filter].css;
    if (facingMode === 'user') {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the photo.')), 'image/jpeg', 0.96);
    });
  };

  const applyFilterToBlob = async (blob: Blob) => {
    if (filter === 'natural') return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = canvasRef.current;
    if (!canvas) return blob;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return blob;
    context.filter = CAMERA_FILTERS[filter].css;
    context.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(nextBlob => nextBlob ? resolve(nextBlob) : reject(new Error('Could not apply the camera look.')), 'image/jpeg', 0.96);
    });
  };

  const capturePhoto = async () => {
    if (!cameraReady || capturing) return;
    setCapturing(true);
    setError('');
    setStatus('Capturing high-quality photo…');
    try {
      const rawBlob = imageCaptureRef.current
        ? await imageCaptureRef.current.takePhoto().catch(() => captureFromVideo())
        : await captureFromVideo();
      const blob = await applyFilterToBlob(rawBlob);
      const localPreviewUrl = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = localPreviewUrl;
      setPreviewUrl(localPreviewUrl);
      setShowLastShot(true);
      setStatus('Uploading securely to Drive…');
      const file = new File([blob], `memoriya-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`, { type: 'image/jpeg' });
      setCapturing(false);
      pendingUploadsRef.current += 1;
      setPendingUploads(pendingUploadsRef.current);
      void googleDriveService.uploadMedia(accessToken, file, folderId)
        .then(uploaded => {
          onUploaded(uploaded);
          setError('');
          setStatus('Photo saved locally and added to your live Drive story.');
        })
        .catch(uploadError => {
          setError(uploadError instanceof Error ? `Photo is safe locally, but Drive upload failed: ${uploadError.message}` : 'Photo is safe locally, but Drive upload failed.');
          setStatus('Ready for another photo.');
        })
        .finally(() => {
          pendingUploadsRef.current = Math.max(0, pendingUploadsRef.current - 1);
          setPendingUploads(pendingUploadsRef.current);
        });
      setStatus('Saved to Drive — the live story will add it automatically.');
      setStatus('Saved locally - upload is running in the background.');
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Photo capture failed.');
      setStatus('Ready to try again.');
    } finally {
      setCapturing(false);
    }
  };

  const changeZoom = (value: number) => {
    setZoom(value);
    const track = trackRef.current;
    if (track) void track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
  };

  const toggleTorch = () => {
    const next = !torchEnabled;
    setTorchEnabled(next);
    const track = trackRef.current;
    if (track) void track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
  };

  return (
    <div className="memoriya-camera-overlay" role="dialog" aria-modal="true" aria-label="Drive camera">
      <section className="memoriya-camera-panel">
        <header>
          <div><span className="memoriya-kicker"><Camera size={15} /> Drive camera</span><h2>Capture a new memory</h2></div>
          <button type="button" onClick={onClose} aria-label="Close camera"><X size={20} /></button>
        </header>
        <div className="memoriya-camera-viewfinder">
          <video ref={videoRef} muted playsInline autoPlay style={{ filter: CAMERA_FILTERS[filter].css, transform: facingMode === 'user' ? 'scaleX(-1)' : undefined }} />
          {!cameraReady && <div className="memoriya-camera-status"><Loader2 className="memoriya-spin-icon" size={28} /><span>{error || status}</span></div>}
          {previewUrl && showLastShot && <img className="memoriya-camera-last-shot" src={previewUrl} alt="Last captured memory" />}
          {gridEnabled && <div className="memoriya-camera-grid" aria-hidden="true" />}
          <div className="memoriya-camera-viewfinder-tools">
            {previewUrl && <button type="button" onClick={() => setShowLastShot(value => !value)}>{showLastShot ? 'Live' : 'Last photo'}</button>}
            <button type="button" onClick={() => setGridEnabled(value => !value)} className={gridEnabled ? 'is-active' : ''} aria-label="Toggle camera grid"><Grid3X3 size={16} /></button>
          </div>
        </div>
        <div className="memoriya-camera-controls">
          <button type="button" onClick={() => setFacingMode(value => value === 'environment' ? 'user' : 'environment')}><FlipHorizontal size={17} /> Flip</button>
          <button type="button" className="memoriya-camera-shutter" onClick={() => void capturePhoto()} disabled={!cameraReady || capturing} aria-label="Capture and upload photo">
            {capturing ? <Loader2 className="memoriya-spin-icon" size={22} /> : <Camera size={22} />}
          </button>
          <label className="memoriya-camera-filter">Look
            <select value={filter} onChange={event => setFilter(event.target.value as CameraFilter)}>
              {Object.entries(CAMERA_FILTERS).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <div className="memoriya-camera-settings">
          {zoomRange && <label><Maximize2 size={15} /> Zoom <input type="range" min={zoomRange.min} max={zoomRange.max} step={zoomRange.step} value={zoom} onChange={event => changeZoom(Number(event.target.value))} /><output>{zoom.toFixed(1)}x</output></label>}
          {torchAvailable && <button type="button" onClick={toggleTorch} className={torchEnabled ? 'is-active' : ''}><Lightbulb size={15} /> {torchEnabled ? 'Flash on' : 'Flash off'}</button>}
        </div>
        <label className="memoriya-camera-destination">Save to Drive folder
          <select value={folderId} onChange={event => setFolderId(event.target.value)}>
            <option value="drive-root">My Drive root</option>
            {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </label>
        <p className={`memoriya-camera-message ${error ? 'is-error' : ''}`}>{error || status}</p>
        {pendingUploads > 0 && <p className="memoriya-camera-saved"><Loader2 size={15} className="memoriya-spin-icon" /> {pendingUploads} upload{pendingUploads === 1 ? '' : 's'} running in background</p>}
        {previewUrl && !capturing && !error && pendingUploads === 0 && <p className="memoriya-camera-saved"><Check size={15} /> Latest photo is saved locally and in your connected Drive.</p>}
        <canvas ref={canvasRef} className="hidden" />
      </section>
    </div>
  );
};

export default DriveCameraCapture;
