import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Crop,
  Edit3,
  Grid3X3,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { DriveMediaFile } from '../services/googleDriveService';
import { googleDriveService, isDriveAuthorizationError } from '../services/googleDriveService';
import { saveDriveAccessToken } from '../services/driveLibrary';
import { deleteCachedStoryMedia, readCachedStoryMedia, writeCachedStoryMedia } from '../services/storyMediaCache';
import { markCameraUploadCompleted, readCompletedCameraUploads, readPendingCameraUploads, writePendingCameraUploads } from '../services/cameraUploadQueue';

interface ImageCaptureLike {
  takePhoto: () => Promise<Blob>;
}

interface Props {
  accessToken: string;
  initialFolderId?: string;
  onUploaded: (file: DriveMediaFile, accessToken?: string, localFile?: File) => void;
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
  queueId: string;
  uploadedFile?: DriveMediaFile | null;
}

interface UploadJob {
  id: string;
  file: File;
  folderId: string;
}

type CameraCrop = 'original' | 'square' | 'portrait' | 'landscape';

const CAMERA_FILTERS = {
  natural: { label: 'Natural', css: 'none' },
  vivid: { label: 'Vivid', css: 'saturate(1.3) contrast(1.08) brightness(1.03)' },
  warm: { label: 'Warm', css: 'sepia(.14) saturate(1.25) contrast(1.04) brightness(1.03)' },
  cool: { label: 'Cool', css: 'saturate(.92) hue-rotate(12deg) contrast(1.05) brightness(1.04)' },
  film: { label: 'Film', css: 'sepia(.22) contrast(1.12) saturate(.92) brightness(.98)' },
  mono: { label: 'Mono', css: 'grayscale(1) contrast(1.08)' },
  enhance: { label: 'Enhance', css: 'saturate(1.14) contrast(1.12) brightness(1.05)' },
} as const;

type CameraFilter = keyof typeof CAMERA_FILTERS;

const CAMERA_QUALITY = {
  standard: { label: 'Standard', css: 'none' },
  auto: { label: 'Auto light', css: 'brightness(1.12) contrast(1.04) saturate(1.04)' },
  bright: { label: 'Bright', css: 'brightness(1.2) contrast(1.05) saturate(1.06)' },
  crisp: { label: 'Crisp', css: 'brightness(1.06) contrast(1.12) saturate(1.08)' },
} as const;

type CameraQuality = keyof typeof CAMERA_QUALITY;

const fileName = () => `memoriya-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;

const blobToFile = (blob: Blob) => new File([blob], fileName(), { type: 'image/jpeg' });

const canvasToJpegBlob = (canvas: HTMLCanvasElement) => {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.96);
  const [header, encoded] = dataUrl.split(',');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: header.match(/data:([^;]+)/)?.[1] || 'image/jpeg' });
};

const DriveCameraCapture: React.FC<Props> = ({ accessToken, initialFolderId, onUploaded, onDeleted, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const imageCaptureRef = useRef<ImageCaptureLike | null>(null);
  const hardwareZoomRef = useRef(false);
  const zoomRef = useRef(1);
  const zoomRangeRef = useRef({ min: 1, max: 4, step: 0.1 });
  const zoomApplyFrameRef = useRef<number | null>(null);
  const pinchStartDistanceRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const previewUrlRef = useRef('');
  const originalPreviewUrlRef = useRef('');
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadQueueRef = useRef<UploadJob[]>([]);
  const uploadWorkerRunningRef = useRef(false);
  const uploadInFlightRef = useRef(false);
  const latestQueueIdRef = useRef('');
  const processUploadQueueRef = useRef<(() => void) | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [filter, setFilter] = useState<CameraFilter>('natural');
  const [quality, setQuality] = useState<CameraQuality>('auto');
  const [autoEnhance, setAutoEnhance] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);
  const [capturedGallery, setCapturedGallery] = useState<CapturedPhoto[]>([]);
  const [uploadedFile, setUploadedFile] = useState<DriveMediaFile | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editFilter, setEditFilter] = useState<CameraFilter>('natural');
  const [editRotation, setEditRotation] = useState(0);
  const [editCrop, setEditCrop] = useState<CameraCrop>('original');
  const [showLastShot, setShowLastShot] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState('Starting camera…');
  const [error, setError] = useState('');
  const [folderId, setFolderId] = useState(initialFolderId || 'drive-root');
  const [folders, setFolders] = useState<DriveFolderChoice[]>([]);
  const [pendingUploads, setPendingUploads] = useState(0);
  const capturedGalleryRef = useRef<CapturedPhoto[]>([]);
  capturedGalleryRef.current = capturedGallery;

  const persistUploadQueue = () => {
    writePendingCameraUploads(uploadQueueRef.current.map(job => ({
      id: job.id,
      name: job.file.name,
      type: job.file.type,
      folderId: job.folderId,
      createdAt: Date.now(),
    })));
  };

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
    const restorePendingPhotos = async () => {
      const completedIds = new Set(readCompletedCameraUploads().map(item => item.id));
      const savedJobs = readPendingCameraUploads().filter(job => !completedIds.has(job.id));
      const restored = await Promise.all(savedJobs.map(async savedJob => {
        const blob = await readCachedStoryMedia(savedJob.id);
        if (!blob) return null;
        const file = new File([blob], savedJob.name, { type: savedJob.type || blob.type || 'image/jpeg' });
        return {
          job: { id: savedJob.id, file, folderId: savedJob.folderId || 'drive-root' },
          photo: {
            sourceBlob: blob,
            file,
            url: URL.createObjectURL(blob),
            queueId: savedJob.id,
            uploadedFile: null,
          } as CapturedPhoto,
        };
      }));
      if (cancelled) {
        restored.forEach(item => { if (item) URL.revokeObjectURL(item.photo.url); });
        return;
      }
      const validItems = restored.filter((item): item is NonNullable<typeof item> => Boolean(item));
      const currentIds = new Set(uploadQueueRef.current.map(job => job.id));
      const recoveredJobs = validItems.map(item => item.job).filter(job => !currentIds.has(job.id));
      uploadQueueRef.current = [...recoveredJobs, ...uploadQueueRef.current];
      if (validItems.length) {
        setCapturedGallery(current => [...validItems.map(item => item.photo), ...current]);
        setCapturedPhoto(current => current || validItems[validItems.length - 1].photo);
        setPreviewUrl(current => current || validItems[validItems.length - 1].photo.url);
        setShowLastShot(true);
      }
      persistUploadQueue();
      updatePendingCount();
      if (navigator.onLine) processUploadQueueRef.current?.();
    };
    void restorePendingPhotos();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not provide camera access. Open Memoriya in Chrome or Safari on the phone.');
        return;
      }
      setCameraReady(false);
      setError('');
      setStatus(facingMode === 'user' ? 'Starting selfie camera...' : 'Starting rear camera...');
      const previousStream = streamRef.current;
      let nextStream: MediaStream | null = null;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30, max: 60 },
          },
        });
        nextStream = stream;
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        previousStream?.getTracks().forEach(track => track.stop());
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
          zoom?: { min?: number; max?: number; step?: number };
          torch?: boolean;
        };
        const range = capabilities.zoom
          ? {
            min: capabilities.zoom.min ?? 1,
            max: Math.max(capabilities.zoom.max ?? 1, 1),
            step: capabilities.zoom.step ?? 0.1,
          }
          : { min: 1, max: 4, step: 0.1 };
        hardwareZoomRef.current = Boolean(capabilities.zoom && range.max > range.min);
        zoomRangeRef.current = range.max > range.min ? range : { min: 1, max: 4, step: 0.1 };
        zoomRef.current = range.min;
        setZoom(range.min);
        setTorchAvailable(Boolean(capabilities.torch));
        const ImageCaptureConstructor = (window as unknown as { ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
        imageCaptureRef.current = ImageCaptureConstructor ? new ImageCaptureConstructor(track) : null;
        setCameraReady(true);
        setStatus('Ready — tap the shutter to save a photo');
      } catch (captureError) {
        if (cancelled) {
          if (nextStream && nextStream !== previousStream) nextStream.getTracks().forEach(track => track.stop());
          return;
        }
        if (!cancelled) {
          if (nextStream && nextStream !== previousStream) nextStream.getTracks().forEach(track => track.stop());
          if (previousStream && videoRef.current) {
            streamRef.current = previousStream;
            videoRef.current.srcObject = previousStream;
            await videoRef.current.play().catch(() => undefined);
            setCameraReady(true);
            setError('Could not switch camera. The current camera is still active.');
          } else {
            setError(captureError instanceof Error ? captureError.message : 'Camera permission was denied.');
          }
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (zoomApplyFrameRef.current !== null) cancelAnimationFrame(zoomApplyFrameRef.current);
      zoomApplyFrameRef.current = null;
    };
  }, [facingMode]);

  useEffect(() => () => {
    // Do not abort a pending upload when the camera panel closes. The queue is
    // persisted and the upload can finish in the background without blocking
    // the camera or losing a locally captured photo.
    capturedGalleryRef.current.forEach(photo => URL.revokeObjectURL(photo.url));
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (originalPreviewUrlRef.current) URL.revokeObjectURL(originalPreviewUrlRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  useEffect(() => {
    const resumeWhenOnline = () => {
      if (navigator.onLine) processUploadQueueRef.current?.();
    };
    const pauseWhenOffline = () => uploadAbortRef.current?.abort();
    window.addEventListener('online', resumeWhenOnline);
    window.addEventListener('offline', pauseWhenOffline);
    const retryTimer = window.setInterval(resumeWhenOnline, 5000);
    return () => {
      window.removeEventListener('online', resumeWhenOnline);
      window.removeEventListener('offline', pauseWhenOffline);
      window.clearInterval(retryTimer);
    };
  }, []);

  const renderPhotoBlob = async (blob: Blob, nextFilter: CameraFilter, rotation = 0, crop: CameraCrop = 'original') => {
    if (nextFilter === 'natural' && rotation % 360 === 0 && crop === 'original') return blob;
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
    if (crop === 'original') {
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(nextBlob => nextBlob ? resolve(nextBlob) : reject(new Error('Could not prepare the photo.')), 'image/jpeg', 0.96);
      });
    }
    const aspect = crop === 'square' ? 1 : crop === 'portrait' ? 4 / 5 : 16 / 9;
    let cropWidth = canvas.width;
    let cropHeight = Math.round(cropWidth / aspect);
    if (cropHeight > canvas.height) {
      cropHeight = canvas.height;
      cropWidth = Math.round(cropHeight * aspect);
    }
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    cropCanvas.getContext('2d')?.drawImage(
      canvas,
      Math.round((canvas.width - cropWidth) / 2),
      Math.round((canvas.height - cropHeight) / 2),
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );
    return await new Promise<Blob>((resolve, reject) => {
      cropCanvas.toBlob(nextBlob => nextBlob ? resolve(nextBlob) : reject(new Error('Could not prepare the cropped photo.')), 'image/jpeg', 0.96);
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
    // Mirror only the live selfie preview. Saved files stay in normal
    // orientation so faces and text are not reversed.
    context.filter = [CAMERA_FILTERS[filter].css, CAMERA_QUALITY[quality].css, autoEnhance ? 'brightness(1.08) contrast(1.06) saturate(1.08)' : 'none']
      .filter(value => value !== 'none')
      .join(' ') || 'none';
    const captureZoom = zoomRef.current;
    const sourceWidth = video.videoWidth / (hardwareZoomRef.current ? 1 : captureZoom);
    const sourceHeight = video.videoHeight / (hardwareZoomRef.current ? 1 : captureZoom);
    const sourceX = (video.videoWidth - sourceWidth) / 2;
    const sourceY = (video.videoHeight - sourceHeight) / 2;
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    return canvasToJpegBlob(canvas);
  };

  const updatePendingCount = () => {
    setPendingUploads(uploadQueueRef.current.length);
  };

  const startUpload = async (file: File, queueId = '', targetFolderId = folderId): Promise<boolean> => {
    if (uploadInFlightRef.current) return false;
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    uploadInFlightRef.current = true;
    setError('');
    setStatus('Uploading securely to Drive…');
    try {
      let token = accessToken;
      let uploaded: DriveMediaFile;
      try {
        uploaded = await googleDriveService.uploadMedia(token, file, targetFolderId, controller.signal);
      } catch (uploadError) {
        if (!isDriveAuthorizationError(uploadError)) throw uploadError;
        token = await googleDriveService.refreshAccessToken();
        saveDriveAccessToken(token);
        uploaded = await googleDriveService.uploadMedia(token, file, targetFolderId, controller.signal);
      }
      if (controller.signal.aborted) return false;
      if (latestQueueIdRef.current === queueId) setUploadedFile(uploaded);
      setCapturedGallery(current => current.map(photo => photo.queueId === queueId ? { ...photo, uploadedFile: uploaded } : photo));
      setCapturedPhoto(current => current?.queueId === queueId ? { ...current, uploadedFile: uploaded } : current);
      if (queueId) {
        markCameraUploadCompleted({
          id: queueId,
          driveFileId: uploaded.id,
          folderId: targetFolderId,
          completedAt: Date.now(),
        });
        // Cleanup is deliberately non-blocking. Drive has already confirmed
        // the upload, so the live story must be notified before IndexedDB
        // maintenance can delay the new frame.
        void deleteCachedStoryMedia(queueId);
        writePendingCameraUploads(readPendingCameraUploads().filter(job => job.id !== queueId));
      }
      onUploaded(uploaded, token, file);
      // Keep the original locally for the sharp live preview and offline
      // replay, but never make the UI wait for this cache transaction.
      void writeCachedStoryMedia(uploaded.id, file, uploaded.mimeType || file.type);
      setStatus('Photo saved locally and synced to Drive.');
      return true;
    } catch (uploadError) {
      if (controller.signal.aborted) {
        setStatus(navigator.onLine ? 'Upload paused. The photo remains safe locally.' : 'Offline — upload queued safely until internet returns.');
      } else if (!navigator.onLine || uploadError instanceof TypeError || /network|offline|taking too long|failed to fetch/i.test(uploadError instanceof Error ? uploadError.message : '')) {
        setStatus('Offline — upload queued safely until internet returns.');
      } else {
        setError(uploadError instanceof Error ? `Drive upload failed: ${uploadError.message}` : 'Drive upload failed.');
        setStatus('Photo is safe locally. Upload will retry automatically.');
      }
      return false;
    } finally {
      uploadInFlightRef.current = false;
      uploadAbortRef.current = null;
      updatePendingCount();
    }
  };

  const processUploadQueue = async () => {
    if (uploadWorkerRunningRef.current) return;
    uploadWorkerRunningRef.current = true;
    updatePendingCount();
    try {
      while (uploadQueueRef.current.length) {
        const job = uploadQueueRef.current[0];
        if (!job) break;
        if (readCompletedCameraUploads().some(upload => upload.id === job.id)) {
          // The Drive request already succeeded before a previous tab close or
          // callback interruption. Drop the stale local retry without sending
          // the file again; the normal Drive sync will publish its file.
          uploadQueueRef.current.shift();
          await deleteCachedStoryMedia(job.id);
          persistUploadQueue();
          updatePendingCount();
          continue;
        }
        updatePendingCount();
        const uploaded = await startUpload(job.file, job.id, job.folderId);
        if (!uploaded) break;
        uploadQueueRef.current.shift();
        persistUploadQueue();
        updatePendingCount();
      }
    } finally {
      uploadWorkerRunningRef.current = false;
      updatePendingCount();
    }
  };

  const resumeUpload = (file: File) => {
    const id = `camera-pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    latestQueueIdRef.current = id;
    uploadQueueRef.current.push({ id, file, folderId });
    persistUploadQueue();
    updatePendingCount();
    // Finish the local IndexedDB write before starting Drive. A sudden
    // disconnect or tab close can therefore never outrun the local copy.
    void writeCachedStoryMedia(id, file, file.type).then(() => processUploadQueue());
    return id;
  };

  processUploadQueueRef.current = () => { void processUploadQueue(); };

  const removeQueuedUpload = async (queueId: string) => {
    uploadQueueRef.current = uploadQueueRef.current.filter(job => job.id !== queueId);
    persistUploadQueue();
    await deleteCachedStoryMedia(queueId);
    if (latestQueueIdRef.current === queueId && uploadAbortRef.current) uploadAbortRef.current.abort();
    updatePendingCount();
  };

  const pauseUpload = () => {
    // Reviewing a photo never blocks the background upload queue.
  };

  const openReview = () => {
    setReviewOpen(true);
    setShowLastShot(true);
  };

  const selectGalleryPhoto = (photo: CapturedPhoto) => {
    previewUrlRef.current = photo.url;
    originalPreviewUrlRef.current = '';
    setCapturedPhoto(photo);
    setUploadedFile(photo.uploadedFile || null);
    setPreviewUrl(photo.url);
    setEditMode(false);
    setEditRotation(0);
    setEditCrop('original');
    setShowLastShot(true);
    setReviewOpen(true);
  };

  const closeReview = () => {
    setReviewOpen(false);
    setEditMode(false);
  };

  const restoreOriginalPreview = () => {
    if (!capturedPhoto) return;
    if (!originalPreviewUrlRef.current) originalPreviewUrlRef.current = URL.createObjectURL(capturedPhoto.sourceBlob);
    if (previewUrlRef.current && previewUrlRef.current !== originalPreviewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = originalPreviewUrlRef.current;
    const restoredUrl = originalPreviewUrlRef.current;
    setCapturedPhoto(current => current ? { ...current, url: restoredUrl } : current);
    setCapturedGallery(current => current.map(photo => photo.queueId === capturedPhoto.queueId ? { ...photo, url: restoredUrl } : photo));
    setPreviewUrl(originalPreviewUrlRef.current);
    setEditFilter('natural');
    setEditRotation(0);
    setEditCrop('original');
    setStatus('Original preview restored. Save edit to update Drive.');
  };

  const capturePhoto = async () => {
    if (!cameraReady || capturing) return;
    setCapturing(true);
    setError('');
    setStatus('');
    try {
      // Capture the current preview frame first. It is the same negotiated
      // camera resolution shown on the phone and avoids the slow ImageCapture
      // still-photo path used by some TV/WebView browsers. ImageCapture stays
      // as a fallback for browsers that cannot expose a video frame yet.
      let rawBlob: Blob;
      try {
        rawBlob = await captureFromVideo();
      } catch (frameError) {
        if (!imageCaptureRef.current) throw frameError;
        rawBlob = await imageCaptureRef.current.takePhoto();
      }
      // Keep the original camera frame for immediate local saving. Looks and
      // edits remain available in review, while Drive upload runs separately.
      const blob = rawBlob;
      const localPreviewUrl = URL.createObjectURL(blob);
      // Keep earlier captures alive in the camera gallery. Only the active
      // preview URL is replaced here; gallery thumbnails remain usable.
      previewUrlRef.current = localPreviewUrl;
      originalPreviewUrlRef.current = '';
      const localFile = blobToFile(blob);
      const queueId = resumeUpload(localFile);
      const photo = { sourceBlob: rawBlob, file: localFile, url: localPreviewUrl, queueId, uploadedFile: null };
      setCapturedPhoto(photo);
      setCapturedGallery(current => [...current, photo]);
      setUploadedFile(null);
      setPreviewUrl(localPreviewUrl);
      setEditFilter('natural');
      setEditRotation(0);
      setEditCrop('original');
      setShowLastShot(true);
      setReviewOpen(false);
      setCapturing(false);
      setStatus('Captured locally. Uploading to Drive in the background.');
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
        let token = accessToken;
        try {
          await googleDriveService.deleteMedia(token, uploadedFile.id);
        } catch (deleteError) {
          if (!isDriveAuthorizationError(deleteError)) throw deleteError;
          token = await googleDriveService.refreshAccessToken();
          saveDriveAccessToken(token);
          await googleDriveService.deleteMedia(token, uploadedFile.id);
        }
        onDeleted?.(uploadedFile.id);
      } else {
        await removeQueuedUpload(capturedPhoto.queueId);
      }
      if (previewUrlRef.current && previewUrlRef.current !== originalPreviewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (originalPreviewUrlRef.current) URL.revokeObjectURL(originalPreviewUrlRef.current);
      previewUrlRef.current = '';
      originalPreviewUrlRef.current = '';
      setPreviewUrl('');
      setCapturedPhoto(null);
      const remaining = capturedGallery.filter(photo => photo.queueId !== capturedPhoto.queueId);
      setCapturedGallery(remaining);
      const nextPhoto = remaining[remaining.length - 1];
      if (nextPhoto) {
        previewUrlRef.current = nextPhoto.url;
        setCapturedPhoto(nextPhoto);
        setUploadedFile(nextPhoto.uploadedFile || null);
        setPreviewUrl(nextPhoto.url);
      }
      setReviewOpen(Boolean(nextPhoto));
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
      const blob = await renderPhotoBlob(capturedPhoto.sourceBlob, editFilter, editRotation, editCrop);
      const localPreviewUrl = URL.createObjectURL(blob);
      if (previewUrlRef.current && previewUrlRef.current !== originalPreviewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = localPreviewUrl;
      const localFile = blobToFile(blob);
      let nextUploadedFile: DriveMediaFile | null = null;
      let nextQueueId = capturedPhoto.queueId;
      if (uploadedFile) {
        let token = accessToken;
        try {
          const updated = await googleDriveService.updateMedia(token, uploadedFile.id, localFile);
          nextUploadedFile = { ...updated, thumbnailUrl: updated.thumbnailUrl || uploadedFile.thumbnailUrl };
        } catch (updateError) {
          if (!isDriveAuthorizationError(updateError)) throw updateError;
          token = await googleDriveService.refreshAccessToken();
          saveDriveAccessToken(token);
          const updated = await googleDriveService.updateMedia(token, uploadedFile.id, localFile);
          nextUploadedFile = { ...updated, thumbnailUrl: updated.thumbnailUrl || uploadedFile.thumbnailUrl };
        }
        onUploaded(nextUploadedFile, token, localFile);
        void writeCachedStoryMedia(uploadedFile.id, localFile, nextUploadedFile.mimeType || localFile.type);
      } else {
        await removeQueuedUpload(capturedPhoto.queueId);
        nextQueueId = resumeUpload(localFile);
      }
      const photo = {
        sourceBlob: capturedPhoto.sourceBlob,
        file: localFile,
        url: localPreviewUrl,
        queueId: nextQueueId,
        uploadedFile: nextUploadedFile,
      };
      setCapturedPhoto(photo);
      setCapturedGallery(current => current.map(item => item.queueId === capturedPhoto.queueId ? photo : item));
      setUploadedFile(nextUploadedFile);
      setPreviewUrl(localPreviewUrl);
      setFilter(editFilter);
      setEditMode(false);
      setStatus(nextUploadedFile ? 'Enhanced photo updated on Drive.' : 'Enhanced photo saved locally and uploading to Drive.');
      setStatus('Edited photo ready. Uploading the new version…');
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
    const range = zoomRangeRef.current;
    const next = Math.min(range.max, Math.max(range.min, value));
    zoomRef.current = next;
    setZoom(next);
    const track = trackRef.current;
    if (track && hardwareZoomRef.current) {
      if (zoomApplyFrameRef.current !== null) cancelAnimationFrame(zoomApplyFrameRef.current);
      zoomApplyFrameRef.current = requestAnimationFrame(() => {
        zoomApplyFrameRef.current = null;
        void track.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet] }).catch(() => undefined);
      });
    }
  };

  const pinchDistance = (touches: React.TouchList) => {
    const [first, second] = [touches[0], touches[1]];
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  };

  const handlePinchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) return;
    event.preventDefault();
    pinchStartDistanceRef.current = pinchDistance(event.touches);
    pinchStartZoomRef.current = zoomRef.current;
  };

  const handlePinchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2 || !pinchStartDistanceRef.current) return;
    event.preventDefault();
    const next = pinchStartZoomRef.current * (pinchDistance(event.touches) / pinchStartDistanceRef.current);
    changeZoom(next);
  };

  const handlePinchEnd = () => {
    pinchStartDistanceRef.current = 0;
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
        <div className="memoriya-camera-viewfinder" onTouchStart={handlePinchStart} onTouchMove={handlePinchMove} onTouchEnd={handlePinchEnd} onTouchCancel={handlePinchEnd}>
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            style={{
              filter: [CAMERA_FILTERS[filter].css, CAMERA_QUALITY[quality].css, autoEnhance ? 'brightness(1.08) contrast(1.06) saturate(1.08)' : 'none'].filter(value => value !== 'none').join(' ') || 'none',
              transform: [facingMode === 'user' ? 'scaleX(-1)' : '', !hardwareZoomRef.current ? `scale(${zoom})` : ''].filter(Boolean).join(' ') || undefined,
            }}
          />
          {!cameraReady && <div className="memoriya-camera-status"><Loader2 className="memoriya-spin-icon" size={28} /><span>{error || status}</span></div>}
          {previewUrl && showLastShot && (
            <button type="button" className="memoriya-camera-last-shot-button" onClick={openReview} aria-label="Review last captured photo">
              <img src={previewUrl} alt="Last captured memory" />
              <span>Review</span>
            </button>
          )}
          {gridEnabled && <div className="memoriya-camera-grid" aria-hidden="true" />}
          <div className="memoriya-camera-corner-tools">
            <button
              type="button"
              className="memoriya-camera-switch-button"
              onClick={() => setFacingMode(value => value === 'environment' ? 'user' : 'environment')}
              aria-label={facingMode === 'user' ? 'Switch to rear camera' : 'Switch to selfie camera'}
              aria-pressed={facingMode === 'user'}
              title={facingMode === 'user' ? 'Switch to rear camera' : 'Switch to selfie camera'}
            >
              <RefreshCw size={18} />
              <span aria-hidden="true">{facingMode === 'user' ? 'Rear' : 'Selfie'}</span>
            </button>
            {previewUrl && <button type="button" onClick={() => setShowLastShot(value => !value)} aria-label={showLastShot ? 'Show live camera' : 'Show captured preview'}>
              <ImageIcon size={17} />
            </button>}
            {previewUrl && <button type="button" onClick={() => { setEditMode(true); setEditFilter('natural'); setEditCrop('original'); setEditRotation(value => (value + 90) % 360); setReviewOpen(true); }} aria-label="Rotate captured photo">
              <RotateCw size={17} />
            </button>}
          </div>
          <div className="memoriya-camera-viewfinder-tools">
            <button type="button" onClick={() => setGridEnabled(value => !value)} className={gridEnabled ? 'is-active' : ''} aria-label="Toggle camera grid"><Grid3X3 size={16} /></button>
            {torchAvailable && <button type="button" onClick={toggleTorch} className={torchEnabled ? 'is-active' : ''} aria-label={torchEnabled ? 'Turn flash off' : 'Turn flash on'}><Lightbulb size={16} /></button>}
          </div>
        </div>
        {capturedGallery.length > 0 && (
          <div className="memoriya-camera-gallery" aria-label="Captured photo gallery">
            {capturedGallery.map((photo, index) => (
              <button
                type="button"
                key={photo.queueId}
                className={`memoriya-camera-gallery-item${capturedPhoto?.queueId === photo.queueId ? ' is-active' : ''}`}
                onClick={() => selectGalleryPhoto(photo)}
                aria-label={`Review captured photo ${index + 1}`}
              >
                <img src={photo.url} alt={`Captured memory ${index + 1}`} />
                <span>{index + 1}</span>
              </button>
            ))}
          </div>
        )}
        <div className="memoriya-camera-controls">
          <button
            type="button"
            className="memoriya-camera-switch-control"
            onClick={() => setFacingMode(value => value === 'environment' ? 'user' : 'environment')}
            aria-label={facingMode === 'user' ? 'Switch to rear camera' : 'Switch to selfie camera'}
            aria-pressed={facingMode === 'user'}
          >
            <RefreshCw size={18} />
            <span>{facingMode === 'user' ? 'Rear camera' : 'Selfie camera'}</span>
          </button>
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
          <button type="button" onClick={() => setAutoEnhance(value => !value)} className={autoEnhance ? 'is-active' : ''} aria-pressed={autoEnhance}><Sparkles size={15} /> {autoEnhance ? 'Enhance on' : 'Enhance off'}</button>
          <label className="memoriya-camera-quality">Quality
            <select value={quality} onChange={event => setQuality(event.target.value as CameraQuality)}>
              {Object.entries(CAMERA_QUALITY).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}
            </select>
          </label>
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
              <div className="memoriya-camera-review-back-row">
                <button type="button" className="memoriya-camera-review-back" onClick={closeReview} aria-label="Back to camera preview"><ArrowLeft size={17} /> Back</button>
                <div><span className="memoriya-kicker">Memory review</span><strong>Keep this moment?</strong></div>
              </div>
              <button type="button" onClick={closeReview} aria-label="Close photo review"><X size={19} /></button>
            </div>
            <div className={`memoriya-camera-review-preview is-crop-${editMode ? editCrop : 'original'}`}>
              <img src={capturedPhoto.url} alt="Captured memory preview" style={{ filter: CAMERA_FILTERS[editMode ? editFilter : 'natural'].css, transform: `rotate(${editRotation}deg)` }} />
            </div>
            {capturedGallery.length > 1 && (
              <div className="memoriya-camera-review-gallery" aria-label="All captured photos">
                {capturedGallery.map((photo, index) => (
                  <button
                    type="button"
                    key={photo.queueId}
                    className={capturedPhoto.queueId === photo.queueId ? 'is-active' : ''}
                    onClick={() => selectGalleryPhoto(photo)}
                    aria-label={`Open captured photo ${index + 1}`}
                  >
                    <img src={photo.url} alt={`Captured memory ${index + 1}`} />
                  </button>
                ))}
              </div>
            )}
            <div className="memoriya-camera-review-actions">
              <button type="button" onClick={() => void deletePhoto()} disabled={capturing}><Trash2 size={17} /> Delete</button>
              <button type="button" onClick={() => { setEditMode(true); setEditFilter('natural'); setEditCrop('original'); setEditRotation(value => (value + 90) % 360); }} disabled={capturing}><RotateCcw size={17} /> Rotate</button>
              <button type="button" onClick={() => { setEditMode(true); setEditFilter('enhance'); setEditRotation(0); setEditCrop('original'); }} disabled={capturing}><Sparkles size={17} /> Enhance</button>
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
                <label><Crop size={16} /> Crop
                  <select value={editCrop} onChange={event => setEditCrop(event.target.value as CameraCrop)}>
                    <option value="original">Original</option>
                    <option value="square">Square 1:1</option>
                    <option value="portrait">Portrait 4:5</option>
                    <option value="landscape">Landscape 16:9</option>
                  </select>
                </label>
                <button type="button" onClick={() => setEditRotation(value => (value + 90) % 360)}><RotateCcw size={16} /> Rotate</button>
                <button type="button" onClick={restoreOriginalPreview}><Sparkles size={16} /> Restore original</button>
                <button type="button" onClick={() => setEditMode(false)}>Cancel edit</button>
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
