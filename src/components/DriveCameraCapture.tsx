import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Edit3,
  FlipHorizontal,
  Grid3X3,
  Lightbulb,
  Loader2,
  Maximize2,
  RotateCcw,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import type { DriveMediaFile } from '../services/googleDriveService';
import { googleDriveService } from '../services/googleDriveService';

interface ImageCaptureLike {
  takePhoto: () => Promise<Blob>;
}

interface Props {
  accessToken: string;
  onUploaded: (file: DriveMediaFile) => void;
  onDeleted?: (fileId: string) => void;
  onClose: () => void;
}

interface DriveFolderChoice {
  id: string;
  name: string;
}

interface CapturedPhoto {
  sourceBlob: Blob;
  file: File;
  url: string;
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

const fileName = () => `memoriya-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;

const blobToFile = (blob: Blob) => new File([blob], fileName(), { type: 'image/jpeg' });

const DriveCameraCapture: React.FC<Props> = ({ accessToken, onUploaded, onDeleted, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const imageCaptureRef = useRef<ImageCaptureLike | null>(null);
  const previewUrlRef = useRef('');
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadInFlightRef = useRef(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [filter, setFilter] = useState<CameraFilter>('natural');
  const [previewUrl, setPreviewUrl] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);
  const [uploadedFile, setUploadedFile] = useState<DriveMediaFile | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editFilter, setEditFilter] = useState<CameraFilter>('natural');
  const [editRotation, setEditRotation] = useState(0);
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
    document.body.classList.add('memoriya-camera-active');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('memoriya-camera-active');
      document.body.style.overflow = previousOverflow;
    };
  }, []);

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
        setStatus('Ready — tap the shutter to save a photo');
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
    uploadAbortRef.current?.abort();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const renderPhotoBlob = async (blob: Blob, nextFilter: CameraFilter, rotation = 0) => {
    if (nextFilter === 'natural' && rotation % 360 === 0) return blob;
    const bitmap = await createImageBitmap(blob);
    const canvas = canvasRef.current;
    if (!canvas) return blob;
    const quarterTurn = Math.abs(rotation % 180) === 90;
    canvas.width = quarterTurn ? bitmap.height : bitmap.width;
    canvas.height = quarterTurn ? bitmap.width : bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return blob;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.filter = CAMERA_FILTERS[nextFilter].css;
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2, bitmap.width, bitmap.height);
    context.restore();
    bitmap.close();
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(nextBlob => nextBlob ? resolve(nextBlob) : reject(new Error('Could not prepare the photo.')), 'image/jpeg', 0.96);
    });
  };

  const captureFromVideo = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) throw new Error('Camera is still preparing.');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the photo canvas.');
    context.filter = 'none';
    if (facingMode === 'user') {
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the photo.')), 'image/jpeg', 0.96);
    });
  };

  const startUpload = async (file: File) => {
    if (uploadInFlightRef.current) return;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    uploadInFlightRef.current = true;
    setPendingUploads(1);
    setError('');
    setStatus('Uploading securely to Drive…');
    try {
      const uploaded = await googleDriveService.uploadMedia(accessToken, file, folderId, controller.signal);
      if (controller.signal.aborted) return;
      setUploadedFile(uploaded);
      onUploaded(uploaded);
      setStatus('Photo saved to Drive and added to your live story.');
    } catch (uploadError) {
      if (controller.signal.aborted) {
        setStatus('Upload paused while you review the photo.');
      } else {
        setError(uploadError instanceof Error ? `Drive upload failed: ${uploadError.message}` : 'Drive upload failed.');
        setStatus('Upload paused. Review the photo, then resume.');
      }
    } finally {
      uploadInFlightRef.current = false;
      uploadAbortRef.current = null;
      setPendingUploads(0);
    }
  };

  const resumeUpload = (file: File, attempt = 0) => {
    if (!uploadInFlightRef.current) {
      void startUpload(file);
      return;
    }
    if (attempt < 40) window.setTimeout(() => resumeUpload(file, attempt + 1), 50);
  };

  const pauseUpload = () => {
    if (uploadAbortRef.current) uploadAbortRef.current.abort();
    if (!uploadedFile) setStatus('Upload paused while you review the photo.');
  };

  const openReview = () => {
    pauseUpload();
    setReviewOpen(true);
    setShowLastShot(true);
  };

  const closeReview = () => {
    setReviewOpen(false);
    setEditMode(false);
    if (capturedPhoto && !uploadedFile) {
      resumeUpload(capturedPhoto.file);
    }
  };

  const capturePhoto = async () => {
    if (!cameraReady || capturing || uploadInFlightRef.current) return;
    setCapturing(true);
    setError('');
    setStatus('Capturing high-quality photo…');
    try {
      const rawBlob = imageCaptureRef.current
        ? await imageCaptureRef.current.takePhoto().catch(() => captureFromVideo())
        : await captureFromVideo();
      const blob = await renderPhotoBlob(rawBlob, filter);
      const localPreviewUrl = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = localPreviewUrl;
      const photo = { sourceBlob: rawBlob, file: blobToFile(blob), url: localPreviewUrl };
      setCapturedPhoto(photo);
      setUploadedFile(null);
      setPreviewUrl(localPreviewUrl);
      setEditFilter(filter);
      setEditRotation(0);
      setShowLastShot(true);
      setReviewOpen(false);
      void startUpload(photo.file);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Photo capture failed.');
      setStatus('Ready to try again.');
    } finally {
      setCapturing(false);
    }
  };

  const deletePhoto = async () => {
    if (!capturedPhoto) return;
    pauseUpload();
    try {
      if (uploadedFile) {
        await googleDriveService.deleteMedia(accessToken, uploadedFile.id);
        onDeleted?.(uploadedFile.id);
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
      setPreviewUrl('');
      setCapturedPhoto(null);
      setUploadedFile(null);
      setReviewOpen(false);
      setEditMode(false);
      setStatus('Photo deleted. Ready for another memory.');
      setError('');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the photo from Drive.');
    }
  };

  const saveEdit = async () => {
    if (!capturedPhoto || capturing) return;
    setCapturing(true);
    setError('');
    pauseUpload();
    try {
      if (uploadedFile) {
        await googleDriveService.deleteMedia(accessToken, uploadedFile.id);
        onDeleted?.(uploadedFile.id);
      }
      const blob = await renderPhotoBlob(capturedPhoto.sourceBlob, editFilter, editRotation);
      const localPreviewUrl = URL.createObjectURL(blob);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = localPreviewUrl;
      const photo = { sourceBlob: capturedPhoto.sourceBlob, file: blobToFile(blob), url: localPreviewUrl };
      setCapturedPhoto(photo);
      setUploadedFile(null);
      setPreviewUrl(localPreviewUrl);
      setFilter(editFilter);
      setEditMode(false);
      setStatus('Edited photo ready. Uploading the new version…');
      resumeUpload(photo.file);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : 'Could not save the edit.');
    } finally {
      setCapturing(false);
    }
  };

  const sharePhoto = async () => {
    if (!capturedPhoto || !navigator.share) {
      setStatus('Sharing is not available in this browser.');
      return;
    }
    try {
      const shareData: ShareData = {
        files: [capturedPhoto.file],
        title: 'Memoriya memory',
        text: 'A new memory from Memoriya',
      };
      if (navigator.canShare && !navigator.canShare(shareData)) throw new Error('This browser cannot share photos.');
      await navigator.share(shareData);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      setStatus(shareError instanceof Error ? shareError.message : 'Could not share this photo.');
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
          <div><span className="memoriya-kicker"><Camera size={15} /> Mobile camera</span><h2>Capture a new memory</h2></div>
          <button type="button" onClick={onClose} aria-label="Close camera"><X size={20} /></button>
        </header>
        <div className="memoriya-camera-viewfinder">
          <video ref={videoRef} muted playsInline autoPlay style={{ filter: CAMERA_FILTERS[filter].css, transform: facingMode === 'user' ? 'scaleX(-1)' : undefined }} />
          {!cameraReady && <div className="memoriya-camera-status"><Loader2 className="memoriya-spin-icon" size={28} /><span>{error || status}</span></div>}
          {previewUrl && showLastShot && (
            <button type="button" className="memoriya-camera-last-shot-button" onClick={openReview} aria-label="Review last captured photo">
              <img src={previewUrl} alt="Last captured memory" />
              <span>Review</span>
            </button>
          )}
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
        {pendingUploads > 0 && <p className="memoriya-camera-saved"><Loader2 size={15} className="memoriya-spin-icon" /> Uploading securely in the background</p>}
        {uploadedFile && !reviewOpen && <p className="memoriya-camera-saved"><Check size={15} /> Latest photo is saved to Drive and your live story.</p>}
        {reviewOpen && capturedPhoto && (
          <div className="memoriya-camera-review" role="dialog" aria-label="Review captured photo">
            <div className="memoriya-camera-review-header">
              <div><span className="memoriya-kicker">Memory review</span><strong>Keep this moment?</strong></div>
              <button type="button" onClick={closeReview} aria-label="Close photo review"><X size={19} /></button>
            </div>
            <div className="memoriya-camera-review-preview">
              <img src={capturedPhoto.url} alt="Captured memory preview" style={{ filter: CAMERA_FILTERS[editMode ? editFilter : 'natural'].css, transform: `rotate(${editRotation}deg)` }} />
            </div>
            <div className="memoriya-camera-review-actions">
              <button type="button" onClick={() => void deletePhoto()} disabled={capturing}><Trash2 size={17} /> Delete</button>
              <button type="button" onClick={() => setEditMode(value => !value)} disabled={capturing}><Edit3 size={17} /> Edit</button>
              <button type="button" onClick={() => void sharePhoto()} disabled={capturing}><Share2 size={17} /> Share</button>
            </div>
            {editMode && (
              <div className="memoriya-camera-edit-tools">
                <label>Look
                  <select value={editFilter} onChange={event => setEditFilter(event.target.value as CameraFilter)}>
                    {Object.entries(CAMERA_FILTERS).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => setEditRotation(value => (value + 90) % 360)}><RotateCcw size={16} /> Rotate</button>
                <button type="button" className="memoriya-camera-save-edit" onClick={() => void saveEdit()} disabled={capturing}><Check size={16} /> Save edit</button>
              </div>
            )}
            <p>{uploadedFile ? 'Saved to Drive. Your story is up to date.' : 'Upload is paused while you review this photo.'}</p>
            <button type="button" className="memoriya-camera-review-done" onClick={closeReview}>{uploadedFile ? 'Done' : 'Resume upload'}</button>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </section>
    </div>
  );
};

export default DriveCameraCapture;
