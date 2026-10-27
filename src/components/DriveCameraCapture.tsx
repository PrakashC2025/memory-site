import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Grid3X3,
  Images,
  Lightbulb,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
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

type CameraUploadStatus = 'queued' | 'uploading' | 'paused' | 'failed' | 'cancelled' | 'uploaded';

const fileName = () => `memoriya-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;

const blobToFile = (blob: Blob) => new File([blob], fileName(), { type: 'image/jpeg' });

const canvasToJpegBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob(blob => {
    if (blob?.size) resolve(blob);
    else reject(new Error('The phone could not prepare the captured image.'));
  }, 'image/jpeg', 0.98);
});

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
  const physicalGammaRef = useRef<number | null>(null);
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
  const [landscape, setLandscape] = useState(() => typeof window !== 'undefined' && window.innerWidth > window.innerHeight);
  const [deviceLandscape, setDeviceLandscape] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editFilter, setEditFilter] = useState<CameraFilter>('natural');
  const [editRotation, setEditRotation] = useState(0);
  const [editCrop, setEditCrop] = useState<CameraCrop>('original');
  const [showLastShot, setShowLastShot] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameraFullscreen, setCameraFullscreen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [status, setStatus] = useState('Starting camera…');
  const [error, setError] = useState('');
  const [folderId, setFolderId] = useState(initialFolderId || 'drive-root');
  const [folders, setFolders] = useState<DriveFolderChoice[]>([]);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [uploadStatuses, setUploadStatuses] = useState<Record<string, CameraUploadStatus>>({});
  const [uploadingQueueId, setUploadingQueueId] = useState('');
  const capturedGalleryRef = useRef<CapturedPhoto[]>([]);
  const cancelledUploadIdsRef = useRef(new Set<string>());
  const previewRecoveryRef = useRef(new Set<string>());
  capturedGalleryRef.current = capturedGallery;

  const updateUploadStatus = (queueId: string, status: CameraUploadStatus) => {
    if (!queueId) return;
    setUploadStatuses(current => ({ ...current, [queueId]: status }));
  };

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
    // Android Chrome can hide its address bar when fullscreen is requested
    // from the camera-open gesture. Browsers that reject the automatic
    // request keep the visible fullscreen button as the fallback.
    if (!document.fullscreenElement) {
      const request = document.documentElement.requestFullscreen?.();
      if (request) void request.catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const updateOrientation = () => setLandscape(window.innerWidth > window.innerHeight);
    const updatePhysicalOrientation = (event?: DeviceOrientationEvent) => {
      if (typeof event?.gamma === 'number') physicalGammaRef.current = event.gamma;
      if (typeof event?.gamma === 'number' && Math.abs(event.gamma) > 45) setDeviceLandscape(true);
      else if (typeof event?.gamma === 'number' && Math.abs(event.gamma) < 35) setDeviceLandscape(false);
      else {
        const windowAngle = Number((window as Window & { orientation?: number }).orientation);
        setDeviceLandscape(Number.isFinite(windowAngle) && Math.abs(windowAngle) === 90);
      }
    };
    updateOrientation();
    updatePhysicalOrientation();
    window.addEventListener('resize', updateOrientation, { passive: true });
    window.addEventListener('orientationchange', updateOrientation, { passive: true });
    window.addEventListener('deviceorientation', updatePhysicalOrientation, { passive: true });
    window.visualViewport?.addEventListener('resize', updateOrientation, { passive: true });
    window.screen?.orientation?.addEventListener?.('change', updateOrientation);
    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
      window.removeEventListener('deviceorientation', updatePhysicalOrientation);
      window.visualViewport?.removeEventListener('resize', updateOrientation);
      window.screen?.orientation?.removeEventListener?.('change', updateOrientation);
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
      // Only restore the recent camera gallery. The complete Drive library is
      // already shown by Memoriya; reading hundreds of blobs here would make
      // a phone camera overlay feel slow.
      const completedUploads = readCompletedCameraUploads().slice(-24);
      const completedIds = new Set(completedUploads.map(item => item.id));
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
      // A Drive upload can finish just before the camera is closed. Restore
      // that completed capture from the Drive-keyed cache so the camera still
      // has a real preview when it is opened again (instead of only showing a
      // temporary object URL from the previous component instance).
      const restoredCompleted = await Promise.all(completedUploads.map(async completed => {
        const blob = await readCachedStoryMedia(completed.driveFileId);
        if (!blob) return null;
        const mimeType = completed.mimeType || blob.type || 'image/jpeg';
        const file = new File([blob], completed.name || `memoriya-${completed.driveFileId}.jpg`, { type: mimeType });
        const uploadedFile: DriveMediaFile = {
          id: completed.driveFileId,
          name: file.name,
          mimeType,
          thumbnailUrl: '',
          parents: completed.folderId ? [completed.folderId] : undefined,
        };
        return {
          sourceBlob: blob,
          file,
          url: URL.createObjectURL(blob),
          queueId: completed.id,
          uploadedFile,
        } as CapturedPhoto;
      }));
      if (cancelled) {
        restored.forEach(item => { if (item) URL.revokeObjectURL(item.photo.url); });
        restoredCompleted.forEach(photo => { if (photo) URL.revokeObjectURL(photo.url); });
        return;
      }
      const validPendingItems = restored.filter((item): item is NonNullable<typeof item> => Boolean(item));
      const validCompletedItems = restoredCompleted.filter((photo): photo is CapturedPhoto => Boolean(photo));
      const validItems = [...validPendingItems.map(item => item.photo), ...validCompletedItems];
      const currentIds = new Set(uploadQueueRef.current.map(job => job.id));
      const recoveredJobs = validPendingItems.map(item => item.job).filter(job => !currentIds.has(job.id));
      uploadQueueRef.current = [...recoveredJobs, ...uploadQueueRef.current];
      recoveredJobs.forEach(job => updateUploadStatus(job.id, 'queued'));
      if (validItems.length) {
        const latestPhoto = validItems[validItems.length - 1];
        setCapturedGallery(current => [...validItems, ...current]);
        setCapturedPhoto(current => current || latestPhoto);
        setUploadedFile(current => current || latestPhoto.uploadedFile || null);
        setPreviewUrl(current => current || latestPhoto.url);
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
      if (!cameraEnabled) {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        trackRef.current = null;
        imageCaptureRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraReady(false);
        setTorchAvailable(false);
        setStatus('Camera is off. Tap Camera on when you are ready.');
        return;
      }
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
            width: { ideal: landscape ? 2560 : 1920, min: 720 },
            height: { ideal: landscape ? 1440 : 2560, min: 720 },
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
  }, [cameraEnabled, facingMode]);

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
    const pauseWhenOffline = () => {
      if (uploadingQueueId) updateUploadStatus(uploadingQueueId, 'paused');
      setStatus('Offline — current upload paused safely. It will resume when internet returns.');
      uploadAbortRef.current?.abort();
    };
    window.addEventListener('online', resumeWhenOnline);
    window.addEventListener('offline', pauseWhenOffline);
    const retryTimer = window.setInterval(resumeWhenOnline, 5000);
    return () => {
      window.removeEventListener('online', resumeWhenOnline);
      window.removeEventListener('offline', pauseWhenOffline);
      window.clearInterval(retryTimer);
    };
  }, [uploadingQueueId]);

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
    if (!video || !canvas) throw new Error('Camera is still preparing.');
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      await new Promise<void>((resolve, reject) => {
        let finished = false;
        const finish = (error?: Error) => {
          if (finished) return;
          finished = true;
          window.clearTimeout(timeout);
          video.removeEventListener('loadeddata', check);
          video.removeEventListener('canplay', check);
          if (error) reject(error);
          else resolve();
        };
        const check = () => {
          if (video.videoWidth > 0 && video.videoHeight > 0) finish();
        };
        const timeout = window.setTimeout(() => finish(new Error('Camera is still preparing. Please try again.')), 1500);
        video.addEventListener('loadeddata', check);
        video.addEventListener('canplay', check);
        check();
      });
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) throw new Error('Camera is still preparing. Please try again.');
    const viewfinder = video.closest('.memoriya-camera-viewfinder');
    const viewfinderAspect = viewfinder && viewfinder.clientHeight > 0
      ? viewfinder.clientWidth / viewfinder.clientHeight
      : video.videoWidth / video.videoHeight;
    const captureAspect = deviceLandscape && !landscape
      ? Math.max(viewfinderAspect, 16 / 9)
      : viewfinderAspect;
    const zoomFactor = hardwareZoomRef.current ? 1 : Math.max(1, zoomRef.current);
    let sourceWidth = video.videoWidth / zoomFactor;
    let sourceHeight = video.videoHeight / zoomFactor;
    const sourceAspect = sourceWidth / sourceHeight;
    if (sourceAspect > captureAspect) sourceWidth = sourceHeight * captureAspect;
    else sourceHeight = sourceWidth / captureAspect;
    const sourceX = (video.videoWidth - sourceWidth) / 2;
    const sourceY = (video.videoHeight - sourceHeight) / 2;
    canvas.width = Math.max(1, Math.round(sourceWidth));
    canvas.height = Math.max(1, Math.round(sourceHeight));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the photo canvas.');
    // Mirror only the live selfie preview. Saved files stay in normal
    // orientation so faces and text are not reversed.
    context.filter = [CAMERA_FILTERS[filter].css, CAMERA_QUALITY[quality].css, autoEnhance ? 'brightness(1.08) contrast(1.06) saturate(1.08)' : 'none']
      .filter(value => value !== 'none')
      .join(' ') || 'none';
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    return canvasToJpegBlob(canvas);
  };

  const normalizeHorizontalCapture = async (blob: Blob) => {
    const windowAngle = Number((window as Window & { orientation?: number }).orientation);
    const heldSideways = !landscape && (deviceLandscape
      || Math.abs(physicalGammaRef.current || 0) > 45
      || (Number.isFinite(windowAngle) && Math.abs(windowAngle) === 90));
    if (!heldSideways || typeof createImageBitmap !== 'function') return blob;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      return blob;
    }
    if (bitmap.width >= bitmap.height) {
      bitmap.close();
      return blob;
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return blob;
    }
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI / 2);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    bitmap.close();
    return canvasToJpegBlob(canvas);
  };

  const applyCaptureLook = async (blob: Blob) => {
    if (filter === 'natural' && quality === 'standard' && !autoEnhance) return blob;
    if (typeof createImageBitmap !== 'function') return blob;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      return blob;
    }
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return blob;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.filter = [
      CAMERA_FILTERS[filter].css,
      CAMERA_QUALITY[quality].css,
      autoEnhance ? 'brightness(1.08) contrast(1.06) saturate(1.08)' : 'none',
    ].filter(value => value !== 'none').join(' ') || 'none';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
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
    if (queueId) {
      setUploadingQueueId(queueId);
      updateUploadStatus(queueId, 'uploading');
    }
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
      if (queueId) {
        cancelledUploadIdsRef.current.delete(queueId);
        updateUploadStatus(queueId, 'uploaded');
      }
      if (latestQueueIdRef.current === queueId) setUploadedFile(uploaded);
      setCapturedGallery(current => current.map(photo => photo.queueId === queueId ? { ...photo, uploadedFile: uploaded } : photo));
      setCapturedPhoto(current => current?.queueId === queueId ? { ...current, uploadedFile: uploaded } : current);
      if (queueId) {
        markCameraUploadCompleted({
          id: queueId,
          driveFileId: uploaded.id,
          folderId: targetFolderId,
          completedAt: Date.now(),
          name: uploaded.name || file.name,
          mimeType: uploaded.mimeType || file.type,
        });
        // Cleanup is deliberately non-blocking. Drive has already confirmed
        // the upload, so the live story must be notified before IndexedDB
        // maintenance can delay the new frame.
        void deleteCachedStoryMedia(queueId);
        writePendingCameraUploads(readPendingCameraUploads().filter(job => job.id !== queueId));
      }
      // Finish the Drive-keyed cache write before reporting success. This
      // makes a close/reopen immediately safe, even on a slow phone.
      await writeCachedStoryMedia(uploaded.id, file, uploaded.mimeType || file.type);
      try {
        onUploaded(uploaded, token, file);
      } catch {
        // Drive has succeeded and the local copy is safe. A parent-page
        // refresh must never turn a successful camera capture into an error.
      }
      setStatus('Photo saved locally and synced to Drive.');
      return true;
    } catch (uploadError) {
      const wasCancelled = Boolean(queueId && cancelledUploadIdsRef.current.has(queueId));
      if (wasCancelled) {
        updateUploadStatus(queueId, 'cancelled');
        setStatus('Upload canceled. The photo is still safe on this device. Tap Retry to upload it again.');
      } else if (controller.signal.aborted) {
        if (queueId) updateUploadStatus(queueId, 'paused');
        setStatus('Upload paused. The photo remains safe locally.');
      } else if (!navigator.onLine || uploadError instanceof TypeError || /network|offline|taking too long|failed to fetch/i.test(uploadError instanceof Error ? uploadError.message : '')) {
        if (queueId) updateUploadStatus(queueId, 'paused');
        setStatus('Offline — upload queued safely until internet returns.');
      } else {
        if (queueId) updateUploadStatus(queueId, 'failed');
        setError('');
        setStatus('Saved locally. Drive upload will retry from this camera.');
      }
      return false;
      /*
      if (controller.signal.aborted) {
        setStatus(navigator.onLine ? 'Upload paused. The photo remains safe locally.' : 'Offline — upload queued safely until internet returns.');
      } else if (!navigator.onLine || uploadError instanceof TypeError || /network|offline|taking too long|failed to fetch/i.test(uploadError instanceof Error ? uploadError.message : '')) {
        setStatus('Offline — upload queued safely until internet returns.');
      } else {
        setError(uploadError instanceof Error ? `Drive upload failed: ${uploadError.message}` : 'Drive upload failed.');
        setStatus('Photo is safe locally. Upload will retry automatically.');
      }
      return false;
      */
    } finally {
      uploadInFlightRef.current = false;
      uploadAbortRef.current = null;
      if (uploadingQueueId === queueId) setUploadingQueueId('');
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
    updateUploadStatus(id, 'queued');
    persistUploadQueue();
    updatePendingCount();
    // Finish the local IndexedDB write before starting Drive. A sudden
    // disconnect or tab close can therefore never outrun the local copy.
    void writeCachedStoryMedia(id, file, file.type)
      .then(() => processUploadQueue())
      .catch(() => setStatus('Saved in the current camera session. Drive upload will retry when storage is available.'));
    return id;
  };

  processUploadQueueRef.current = () => { void processUploadQueue(); };

  const removeQueuedUpload = async (queueId: string) => {
    uploadQueueRef.current = uploadQueueRef.current.filter(job => job.id !== queueId);
    persistUploadQueue();
    await deleteCachedStoryMedia(queueId);
    if (latestQueueIdRef.current === queueId && uploadAbortRef.current) uploadAbortRef.current.abort();
    setUploadStatuses(current => {
      const next = { ...current };
      delete next[queueId];
      return next;
    });
    updatePendingCount();
  };

  const cancelUpload = (photo: CapturedPhoto) => {
    if (photo.uploadedFile) return;
    cancelledUploadIdsRef.current.add(photo.queueId);
    if (uploadingQueueId === photo.queueId) uploadAbortRef.current?.abort();
    uploadQueueRef.current = uploadQueueRef.current.filter(job => job.id !== photo.queueId);
    persistUploadQueue();
    updateUploadStatus(photo.queueId, 'cancelled');
    setStatus('Upload canceled. The photo is still safe on this device. Tap Retry to upload it again.');
    updatePendingCount();
  };

  const retryUpload = (photo: CapturedPhoto) => {
    if (photo.uploadedFile || uploadingQueueId === photo.queueId) return;
    cancelledUploadIdsRef.current.delete(photo.queueId);
    if (!uploadQueueRef.current.some(job => job.id === photo.queueId)) {
      uploadQueueRef.current.push({ id: photo.queueId, file: photo.file, folderId });
    }
    persistUploadQueue();
    updateUploadStatus(photo.queueId, 'queued');
    setStatus('Upload queued again. The camera stays ready while it retries.');
    updatePendingCount();
    void processUploadQueue();
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
      // Capture the already-running video frame first. It is immediate and
      // already contains the selected look, quality, and auto-enhancement.
      // Native ImageCapture is kept as a fallback for browsers whose video
      // frame is not ready, rather than making every shutter press wait for a
      // slow phone still-capture pipeline.
      let blob: Blob;
      try {
        blob = await captureFromVideo();
      } catch (frameError) {
        try {
          if (!imageCaptureRef.current) throw frameError;
          const nativeBlob = await imageCaptureRef.current.takePhoto();
          if (!nativeBlob?.size) throw new Error('The camera returned an empty image.');
          blob = await normalizeHorizontalCapture(nativeBlob);
          blob = await applyCaptureLook(blob);
        } catch (nativeError) {
          throw new Error(nativeError instanceof Error ? nativeError.message : frameError instanceof Error ? frameError.message : 'The phone could not capture this image.');
        }
      }
      // Keep the physical horizontal/vertical correction for both capture
      // paths. A second pass is harmless because an already-horizontal blob
      // is returned unchanged.
      blob = await normalizeHorizontalCapture(blob);
      if (!blob?.size) throw new Error('The phone returned an empty photo. Please try the shutter again.');
      const localPreviewUrl = URL.createObjectURL(blob);
      // Keep earlier captures alive in the camera gallery. Only the active
      // preview URL is replaced here; gallery thumbnails remain usable.
      previewUrlRef.current = localPreviewUrl;
      originalPreviewUrlRef.current = '';
      const localFile = blobToFile(blob);
      const queueId = resumeUpload(localFile);
      const photo = { sourceBlob: blob, file: localFile, url: localPreviewUrl, queueId, uploadedFile: null };
      setCapturedPhoto(photo);
      setCapturedGallery(current => [...current, photo]);
      setUploadedFile(null);
      setPreviewUrl(localPreviewUrl);
      setEditFilter('natural');
      setEditRotation(0);
      setEditCrop('original');
      setShowLastShot(true);
      // Keep the live camera visible after capture. The local preview remains
      // available in the thumbnail and opens the review only when tapped.
      setReviewOpen(false);
      setCapturing(false);
      setStatus('Captured locally. Uploading to Drive in the background.');
    } catch {
      // Keep the camera surface usable. Capture failures should not replace it
      // with a blocking error view; the next shutter press can retry safely.
      setError('');
      setStatus('Camera is ready. Tap the shutter to try again.');
    } finally {
      setCapturing(false);
    }
  };

  const importGalleryPhotos = (files: FileList | File[]) => {
    const selected = Array.from(files || []).filter(file => file.type.startsWith('image/') && file.size > 0);
    if (!selected.length) return;
    const photos = selected.map(file => {
      // Queue the local copy first. resumeUpload persists the original in
      // IndexedDB before it starts Drive, so a slow connection or app close
      // cannot lose a gallery photo.
      const queueId = resumeUpload(file);
      return {
        sourceBlob: file,
        file,
        url: URL.createObjectURL(file),
        queueId,
        uploadedFile: null,
      } satisfies CapturedPhoto;
    });
    const latest = photos[photos.length - 1];
    if (!latest) return;
    previewUrlRef.current = latest.url;
    originalPreviewUrlRef.current = '';
    setCapturedGallery(current => [...current, ...photos]);
    setCapturedPhoto(latest);
    setUploadedFile(null);
    setPreviewUrl(latest.url);
    setShowLastShot(true);
    setReviewOpen(false);
    setError('');
    setStatus(`${photos.length} gallery photo${photos.length === 1 ? '' : 's'} saved locally. Uploading to Drive in the background.`);
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
        // Keep the edited/enhanced pixels as the new source so the preview,
        // local restore, and any later upload all use the same image.
        sourceBlob: blob,
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

  const recoverPreview = (photo: CapturedPhoto) => {
    if (previewRecoveryRef.current.has(photo.queueId)) return;
    previewRecoveryRef.current.add(photo.queueId);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setCapturedPhoto(current => current?.queueId === photo.queueId ? { ...current, url: dataUrl } : current);
      setCapturedGallery(current => current.map(item => item.queueId === photo.queueId ? { ...item, url: dataUrl } : item));
      setPreviewUrl(current => current === photo.url || !current ? dataUrl : current);
      setError('');
    };
    reader.onerror = () => setError('The captured photo is saved locally, but this browser could not display its preview.');
    reader.readAsDataURL(photo.sourceBlob);
  };

  const toggleCameraFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen?.();
    } catch {
      setStatus('Fullscreen is not available in this browser. Rotate the phone for the wider camera view.');
    }
  };

  const closeCamera = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    onClose();
  };

  useEffect(() => {
    const updateFullscreen = () => setCameraFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreen);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  const toggleTorch = () => {
    const next = !torchEnabled;
    setTorchEnabled(next);
    const track = trackRef.current;
    if (track) void track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
  };

  const recentGallery = capturedGallery.slice(-5);
  const olderGalleryCount = Math.max(0, capturedGallery.length - recentGallery.length);

  return (
    <div className={`memoriya-camera-overlay${landscape ? ' is-landscape' : ' is-portrait'}`} role="dialog" aria-modal="true" aria-label="Drive camera">
      <section className="memoriya-camera-panel">
        <header>
          <div className="memoriya-camera-header-copy">
            <button type="button" className="memoriya-camera-back" onClick={closeCamera} aria-label="Back from camera"><ArrowLeft size={18} /> <span>Back</span></button>
            <div><span className="memoriya-kicker"><Camera size={15} /> Mobile camera</span><h2>Capture a new memory</h2></div>
          </div>
          <div className="memoriya-camera-header-actions">
            <button type="button" onClick={() => void toggleCameraFullscreen()} aria-label={cameraFullscreen ? 'Exit camera fullscreen' : 'Open camera fullscreen'} title={cameraFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{cameraFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
            <button type="button" onClick={closeCamera} aria-label="Close camera"><X size={20} /></button>
          </div>
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
              <img src={previewUrl} alt="Last captured memory" onError={() => capturedPhoto && recoverPreview(capturedPhoto)} />
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
          </div>
          <div className="memoriya-camera-viewfinder-tools">
            <button type="button" onClick={() => setGridEnabled(value => !value)} className={gridEnabled ? 'is-active' : ''} aria-label="Toggle camera grid"><Grid3X3 size={16} /></button>
            {torchAvailable && <button type="button" onClick={toggleTorch} className={torchEnabled ? 'is-active' : ''} aria-label={torchEnabled ? 'Turn flash off' : 'Turn flash on'}><Lightbulb size={16} /></button>}
          </div>
        </div>
        <div className="memoriya-camera-bottom-deck">
          {recentGallery.length > 0 && (
            <div className="memoriya-camera-gallery" aria-label="Captured photo gallery">
              {recentGallery.map((photo, index) => (
                <button
                  type="button"
                  key={photo.queueId}
                  className={`memoriya-camera-gallery-item${capturedPhoto?.queueId === photo.queueId ? ' is-active' : ''}`}
                  onClick={() => selectGalleryPhoto(photo)}
                  aria-label={`Review captured photo ${index + 1 + olderGalleryCount}`}
                >
                  <img src={photo.url} alt={`Captured memory ${index + 1 + olderGalleryCount}`} onError={() => recoverPreview(photo)} />
                  <span>{index + 1 + olderGalleryCount}</span>
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
            <button type="button" className={`memoriya-camera-shutter${deviceLandscape && !landscape ? ' is-device-landscape' : ''}`} onClick={() => void capturePhoto()} disabled={!cameraReady || capturing} aria-label={deviceLandscape && !landscape ? 'Capture horizontal photo' : 'Capture and upload photo'}>
              {capturing ? <Loader2 className="memoriya-spin-icon" size={22} /> : <Camera size={22} />}
            </button>
            <label className="memoriya-camera-filter">Look
              <select value={filter} onChange={event => setFilter(event.target.value as CameraFilter)}>
                {Object.entries(CAMERA_FILTERS).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <label className="memoriya-camera-gallery-picker">
            <Images size={16} /> Add from mobile gallery
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={event => {
                importGalleryPhotos(event.currentTarget.files || []);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <div className="memoriya-camera-settings">
            <button type="button" onClick={() => setCameraEnabled(value => !value)} className={cameraEnabled ? 'is-active' : ''} aria-pressed={cameraEnabled}><Camera size={15} /> {cameraEnabled ? 'Camera on' : 'Camera off'}</button>
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
          {capturedGallery.length > 0 && (
            <div className="memoriya-camera-upload-list" aria-label="Camera upload status" aria-live="polite">
              {recentGallery.map((photo, index) => {
                const status = photo.uploadedFile
                  ? 'uploaded'
                  : uploadStatuses[photo.queueId] || (uploadQueueRef.current.some(job => job.id === photo.queueId) ? 'queued' : 'paused');
                const statusLabel = status === 'uploaded' ? 'Uploaded' : status === 'uploading' ? 'Uploading' : status === 'paused' ? 'Paused' : status === 'cancelled' ? 'Canceled' : status === 'failed' ? 'Failed' : 'Waiting';
                return (
                  <div className={`memoriya-camera-upload-item is-${status}`} key={photo.queueId}>
                    <span><b>Photo {index + 1 + olderGalleryCount}</b><small>{statusLabel}</small></span>
                    {status === 'uploaded' && <Check size={14} aria-label="Uploaded" />}
                    {(status === 'queued' || status === 'uploading') && <button type="button" onClick={() => cancelUpload(photo)}>{status === 'uploading' ? 'Cancel' : 'Cancel'}</button>}
                    {(status === 'paused' || status === 'failed' || status === 'cancelled') && <button type="button" onClick={() => retryUpload(photo)}><RefreshCw size={13} /> Retry</button>}
                  </div>
                );
              })}
              {olderGalleryCount > 0 && <small className="memoriya-camera-upload-more">+{olderGalleryCount} older photos are safely stored in Drive.</small>}
            </div>
          )}
        </div>
        {reviewOpen && capturedPhoto && (
          <div className="memoriya-camera-review" role="dialog" aria-label="Review captured photo">
            <div className="memoriya-camera-review-header">
              <div className="memoriya-camera-review-back-row">
                <button type="button" className="memoriya-camera-review-back" onClick={closeReview} aria-label="Back to camera preview"><ArrowLeft size={17} /> Back</button>
                <div><span className="memoriya-kicker">Memory review</span><strong>Keep this moment?</strong></div>
              </div>
              <button type="button" onClick={closeReview} aria-label="Close photo review"><X size={19} /></button>
            </div>
            <div className="memoriya-camera-review-body">
              <div className={`memoriya-camera-review-preview is-crop-${editMode ? editCrop : 'original'}`}>
                <img src={capturedPhoto.url} alt="Captured memory preview" onError={() => recoverPreview(capturedPhoto)} style={{ filter: CAMERA_FILTERS[editMode ? editFilter : 'natural'].css, transform: `rotate(${editRotation}deg)` }} />
              </div>
              {recentGallery.length > 1 && (
                <div className="memoriya-camera-review-gallery" aria-label="All captured photos">
                  {recentGallery.map((photo, index) => (
                    <button
                      type="button"
                      key={photo.queueId}
                      className={capturedPhoto.queueId === photo.queueId ? 'is-active' : ''}
                      onClick={() => selectGalleryPhoto(photo)}
                      aria-label={`Open captured photo ${index + 1 + olderGalleryCount}`}
                    >
                      <img src={photo.url} alt={`Captured memory ${index + 1 + olderGalleryCount}`} onError={() => recoverPreview(photo)} />
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
            </div>
            <div className="memoriya-camera-review-footer">
              <p>{uploadedFile ? 'Saved to Drive. Your story is up to date.' : 'Upload is paused while you review this photo.'}</p>
              <button type="button" className="memoriya-camera-review-done" onClick={closeReview}>{uploadedFile ? 'Done' : 'Resume upload'}</button>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </section>
    </div>
  );
};

export default DriveCameraCapture;
