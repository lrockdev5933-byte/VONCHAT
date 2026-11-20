import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  AlertCircle,
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Loader2,
  Pause,
  Play,
  Square,
  Sticker,
  Trash2,
  Type,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {
  createStatus,
  deleteStatus,
  fetchStatusViews,
  formatSupabaseError,
  markStatusViewed,
} from '../lib/chatService';
import {
  captureCameraPhoto,
  compressStatusImage,
  DEFAULT_STATUS_THEME_ID,
  getStatusThemeById,
  prepareStatusVideo,
  STATUS_THEMES,
} from '../lib/statusMedia';
import { getStickerById, VONCHAT_STICKERS } from '../data/stickers';
import { StickerArt } from './StickerArt';
import type { StatusItem, StatusMediaType, StatusViewRecord } from '../types/chat';

interface StatusComposerModalProps {
  isOpen: boolean;
  userId: string;
  authorName: string;
  authorAvatarColor: string;
  visibleToUids: string[];
  onClose: () => void;
  onStatusCreated: (status: StatusItem) => void;
}

function formatSecondsTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function StatusComposerModal({
  isOpen,
  userId,
  authorName,
  authorAvatarColor,
  visibleToUids,
  onClose,
  onStatusCreated,
}: StatusComposerModalProps) {
  const [mediaType, setMediaType] = useState<StatusMediaType>('image');
  const [caption, setCaption] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');
  const [selectedStickerId, setSelectedStickerId] = useState(
    VONCHAT_STICKERS[0]?.id ?? 'crown_hi'
  );
  const [themeId, setThemeId] = useState(DEFAULT_STATUS_THEME_ID);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [processingMedia, setProcessingMedia] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const discardRecordingRef = useRef(false);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);

  const stopCameraAndRecording = useCallback((discardRecording = true) => {
    discardRecordingRef.current = discardRecording;

    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // Ignore stop errors if stream already ended
      }
    }
    mediaRecorderRef.current = null;

    const stream = mediaStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }

    setRecording(false);
    setRecordSeconds(0);
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCameraAndRecording(true);
      setError(null);
      setProcessingMedia(false);
      setSubmitting(false);
      setCaption('');
      setImagePreviewUrl('');
      setVideoPreviewUrl('');
      setMediaType('image');
      setThemeId(DEFAULT_STATUS_THEME_ID);
    }
  }, [isOpen, stopCameraAndRecording]);

  useEffect(() => {
    return () => {
      stopCameraAndRecording(true);
    };
  }, [stopCameraAndRecording]);

  useEffect(() => {
    if (cameraActive && cameraVideoRef.current && mediaStreamRef.current) {
      cameraVideoRef.current.srcObject = mediaStreamRef.current;
      void cameraVideoRef.current.play().catch(() => {});
    }
  }, [cameraActive]);

  if (!isOpen) return null;

  const activeTheme = getStatusThemeById(themeId);
  const selectedSticker = getStickerById(selectedStickerId) ?? VONCHAT_STICKERS[0];

  const handleTabChange = (nextType: StatusMediaType) => {
    stopCameraAndRecording(true);
    setError(null);
    setMediaType(nextType);
  };

  const handleImageFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WebP, or GIF).');
      return;
    }

    stopCameraAndRecording(true);
    setError(null);
    setProcessingMedia(true);
    try {
      const compressed = await compressStatusImage(file);
      setImagePreviewUrl(compressed);
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setProcessingMedia(false);
    }
  };

  const handleVideoFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('Please select a valid video file (MP4, WebM, or MOV).');
      return;
    }

    stopCameraAndRecording(true);
    setError(null);
    setProcessingMedia(true);
    try {
      const prepared = await prepareStatusVideo(file);
      setVideoPreviewUrl(prepared);
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setProcessingMedia(false);
    }
  };

  const startCamera = async (mode: 'photo' | 'video') => {
    stopCameraAndRecording(true);
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is not supported in this browser. You can upload a file instead.');
      return;
    }

    try {
      let stream: MediaStream;
      if (mode === 'video') {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1080 } },
        });
      }

      mediaStreamRef.current = stream;
      setCameraMode(mode);
      setCameraActive(true);
    } catch {
      setError('Could not access camera. Allow camera permission or choose a file instead.');
    }
  };

  const handleCapturePhoto = async () => {
    if (!cameraVideoRef.current) return;
    setError(null);
    setProcessingMedia(true);
    try {
      const captured = await captureCameraPhoto(cameraVideoRef.current);
      setImagePreviewUrl(captured);
      stopCameraAndRecording(true);
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setProcessingMedia(false);
    }
  };

  const handleStopRecording = () => {
    if (recordTimerRef.current !== null) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    discardRecordingRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const handleStartRecording = () => {
    const stream = mediaStreamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      setError('Video recording is unavailable in this browser. Upload a clip instead.');
      return;
    }

    setError(null);
    discardRecordingRef.current = false;
    recordChunksRef.current = [];

    const candidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));

    try {
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 320_000,
      });

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const shouldDiscard = discardRecordingRef.current;
        const recordedType = mimeType || 'video/webm';
        const blob = new Blob(recordChunksRef.current, { type: recordedType });
        recordChunksRef.current = [];

        const activeStream = mediaStreamRef.current;
        if (activeStream) {
          activeStream.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = null;
        }
        if (recordTimerRef.current !== null) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setRecording(false);
        setRecordSeconds(0);
        setCameraActive(false);

        if (shouldDiscard || blob.size === 0) return;

        setProcessingMedia(true);
        void prepareStatusVideo(blob)
          .then((preparedUrl) => {
            setVideoPreviewUrl(preparedUrl);
          })
          .catch((err) => {
            setError(formatSupabaseError(err));
          })
          .finally(() => {
            setProcessingMedia(false);
          });
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
      setRecordSeconds(0);

      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => {
          const next = prev + 1;
          if (next >= 12) {
            handleStopRecording();
            return 12;
          }
          return next;
        });
      }, 1000);
    } catch {
      setError('Could not start video recording in this browser.');
    }
  };

  const canSubmit = (() => {
    if (processingMedia || submitting || recording) return false;
    if (mediaType === 'image') return Boolean(imagePreviewUrl);
    if (mediaType === 'video') return Boolean(videoPreviewUrl);
    if (mediaType === 'text') return Boolean(caption.trim());
    if (mediaType === 'sticker') return Boolean(selectedStickerId);
    return false;
  })();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await createStatus({
        authorId: userId,
        authorName,
        authorAvatarColor,
        mediaType,
        caption,
        mediaUrl:
          mediaType === 'image'
            ? imagePreviewUrl
            : mediaType === 'video'
              ? videoPreviewUrl
              : '',
        stickerId: mediaType === 'sticker' ? selectedStickerId : '',
        backgroundTheme: themeId,
        visibleToUids,
      });
      onStatusCreated(created);
      onClose();
    } catch (err) {
      setError(formatSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0B1D13]/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-composer-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white border border-[#D4E3D9] shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-4 border-b border-[#E3EDE7] flex items-center justify-between shrink-0">
          <div>
            <h2 id="status-composer-title" className="text-base font-semibold text-[#0F291A]">
              Add to your status
            </h2>
            <p className="text-xs text-[#547260] mt-0.5">
              Visible to your chat contacts for 24 hours
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCameraAndRecording(true);
              onClose();
            }}
            aria-label="Close status composer"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#4B6856] hover:bg-[#EEF4F0] hover:text-[#0F291A] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Media type selector */}
          <div
            className="grid grid-cols-4 gap-1 p-1 bg-[#EEF4F0] rounded-xl"
            role="tablist"
            aria-label="Status media type"
          >
            {(
              [
                { id: 'image', label: 'Picture', Icon: ImageIcon },
                { id: 'video', label: 'Video', Icon: Video },
                { id: 'text', label: 'Text', Icon: Type },
                { id: 'sticker', label: 'Sticker', Icon: Sticker },
              ] as const
            ).map(({ id, label, Icon }) => {
              const selected = mediaType === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => handleTabChange(id)}
                  className={`min-h-[36px] px-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                    selected
                      ? 'bg-white text-[#0F291A] shadow-xs'
                      : 'text-[#4B6856] hover:text-[#0F291A]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Picture Mode */}
          {mediaType === 'image' && (
            <div className="space-y-3">
              <input
                ref={imageFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageFileSelect}
                className="hidden"
              />

              {cameraActive && cameraMode === 'photo' ? (
                <div className="rounded-2xl overflow-hidden border border-[#CFE0D5] bg-[#0B1D13] relative">
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-h-[280px] object-cover"
                  />
                  <div className="p-3 bg-[#0F291A]/90 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => stopCameraAndRecording(true)}
                      className="min-h-[38px] px-3 rounded-xl border border-white/20 text-white text-xs font-medium hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={processingMedia}
                      onClick={() => void handleCapturePhoto()}
                      className="min-h-[38px] px-4 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture photo</span>
                    </button>
                  </div>
                </div>
              ) : imagePreviewUrl ? (
                <div className="rounded-2xl overflow-hidden border border-[#CFE0D5] bg-[#F4F8F5] relative">
                  <img
                    src={imagePreviewUrl}
                    alt="Status picture preview"
                    className="w-full max-h-[280px] object-contain mx-auto bg-[#0F291A]/5"
                  />
                  <button
                    type="button"
                    onClick={() => setImagePreviewUrl('')}
                    aria-label="Remove selected picture"
                    className="absolute top-2.5 right-2.5 min-w-[34px] min-h-[34px] rounded-xl bg-[#0F291A]/75 hover:bg-[#0F291A] text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#BBD0C2] bg-[#F5F9F6] p-6 text-center space-y-3">
                  {processingMedia ? (
                    <div className="py-6 flex flex-col items-center gap-2 text-xs text-[#4B6856]">
                      <Loader2 className="w-5 h-5 animate-spin text-[#15803D]" />
                      <span>Optimizing picture...</span>
                    </div>
                  ) : (
                    <>
                      <div className="w-11 h-11 rounded-2xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto">
                        <ImageIcon className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#0F291A]">
                          Share a picture update
                        </p>
                        <p className="text-xs text-[#547260]">
                          Upload a photo or take one with your camera.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => imageFileInputRef.current?.click()}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Choose picture</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void startCamera('photo')}
                          className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CFE0D5] bg-white hover:bg-[#EEF4F0] text-[#1F3A2A] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Take photo</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Video Mode */}
          {mediaType === 'video' && (
            <div className="space-y-3">
              <input
                ref={videoFileInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoFileSelect}
                className="hidden"
              />

              {cameraActive && cameraMode === 'video' ? (
                <div className="rounded-2xl overflow-hidden border border-[#CFE0D5] bg-[#0B1D13] relative">
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-h-[280px] object-cover"
                  />
                  {recording && (
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-[#0F291A]/85 text-white text-xs font-mono tabular-nums inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>{formatSecondsTimer(recordSeconds)} / 00:12</span>
                    </div>
                  )}
                  <div className="p-3 bg-[#0F291A]/90 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => stopCameraAndRecording(true)}
                      className="min-h-[38px] px-3 rounded-xl border border-white/20 text-white text-xs font-medium hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    {recording ? (
                      <button
                        type="button"
                        onClick={handleStopRecording}
                        className="min-h-[38px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop &amp; use clip</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartRecording}
                        className="min-h-[38px] px-4 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Video className="w-4 h-4" />
                        <span>Start recording</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : videoPreviewUrl ? (
                <div className="rounded-2xl overflow-hidden border border-[#CFE0D5] bg-[#0B1D13] relative">
                  <video
                    src={videoPreviewUrl}
                    controls
                    playsInline
                    className="w-full max-h-[280px] object-contain mx-auto"
                  />
                  <button
                    type="button"
                    onClick={() => setVideoPreviewUrl('')}
                    aria-label="Remove selected video"
                    className="absolute top-2.5 right-2.5 min-w-[34px] min-h-[34px] rounded-xl bg-[#0F291A]/75 hover:bg-[#0F291A] text-white flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#BBD0C2] bg-[#F5F9F6] p-6 text-center space-y-3">
                  {processingMedia ? (
                    <div className="py-6 flex flex-col items-center gap-2 text-xs text-[#4B6856]">
                      <Loader2 className="w-5 h-5 animate-spin text-[#15803D]" />
                      <span>Preparing video clip (up to 10s)...</span>
                    </div>
                  ) : (
                    <>
                      <div className="w-11 h-11 rounded-2xl bg-[#DCFCE7] text-[#15803D] flex items-center justify-center mx-auto">
                        <Video className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#0F291A]">
                          Share a short video update
                        </p>
                        <p className="text-xs text-[#547260]">
                          Upload a video clip or record up to 12 seconds live.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => videoFileInputRef.current?.click()}
                          className="min-h-[40px] px-4 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Choose video</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void startCamera('video')}
                          className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CFE0D5] bg-white hover:bg-[#EEF4F0] text-[#1F3A2A] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Record clip</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Text Mode */}
          {mediaType === 'text' && (
            <div className="space-y-3">
              <div
                className="rounded-2xl p-6 min-h-[190px] flex items-center justify-center text-center border border-[#CFE0D5] transition-all"
                style={{
                  background: activeTheme.backgroundStyle,
                  color: activeTheme.textColor,
                }}
              >
                <p className="text-lg font-semibold leading-snug whitespace-pre-wrap break-words max-w-full">
                  {caption.trim() || 'Share a calm thought or update...'}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#375242]">Backdrop</span>
                <div className="flex items-center gap-2">
                  {STATUS_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setThemeId(theme.id)}
                      aria-label={`${theme.name} backdrop`}
                      aria-pressed={themeId === theme.id}
                      className={`w-7 h-7 rounded-lg border transition-transform ${
                        themeId === theme.id
                          ? 'ring-2 ring-[#15803D] ring-offset-2 border-white scale-105'
                          : 'border-[#CFE0D5] hover:scale-105'
                      }`}
                      style={{ background: theme.backgroundStyle }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Sticker Mode */}
          {mediaType === 'sticker' && (
            <div className="space-y-3">
              <div
                className="rounded-2xl p-5 min-h-[175px] flex flex-col items-center justify-center text-center border border-[#CFE0D5] gap-2"
                style={{
                  background: activeTheme.backgroundStyle,
                  color: activeTheme.textColor,
                }}
              >
                {selectedSticker && (
                  <StickerArt stickerId={selectedSticker.id} className="w-24 h-24" />
                )}
                {caption.trim() ? (
                  <p className="text-sm font-medium max-w-xs break-words">{caption.trim()}</p>
                ) : (
                  <p className="text-xs font-medium opacity-85">{selectedSticker?.label}</p>
                )}
              </div>

              <div className="grid grid-cols-4 gap-2">
                {VONCHAT_STICKERS.map((sticker) => {
                  const selected = sticker.id === selectedStickerId;
                  return (
                    <button
                      key={sticker.id}
                      type="button"
                      onClick={() => setSelectedStickerId(sticker.id)}
                      className={`p-2 rounded-xl border flex flex-col items-center gap-1 transition-colors ${
                        selected
                          ? 'bg-[#DCFCE7] border-[#16A34A]'
                          : 'bg-[#F5F9F6] border-[#DCE8E0] hover:bg-[#EAF2EC]'
                      }`}
                    >
                      <StickerArt stickerId={sticker.id} className="w-11 h-11" />
                      <span className="text-[11px] font-medium text-[#1F3A2A] truncate w-full text-center">
                        {sticker.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#375242]">Backdrop</span>
                <div className="flex items-center gap-2">
                  {STATUS_THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setThemeId(theme.id)}
                      aria-label={`${theme.name} backdrop`}
                      aria-pressed={themeId === theme.id}
                      className={`w-7 h-7 rounded-lg border transition-transform ${
                        themeId === theme.id
                          ? 'ring-2 ring-[#15803D] ring-offset-2 border-white scale-105'
                          : 'border-[#CFE0D5] hover:scale-105'
                      }`}
                      style={{ background: theme.backgroundStyle }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Text / Caption Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="status-caption" className="text-xs font-medium text-[#1F3A2A]">
                {mediaType === 'text' ? 'Status text' : 'Caption (optional)'}
              </label>
              <span className="text-[11px] font-mono tabular-nums text-[#63806F]">
                {caption.length}/300
              </span>
            </div>
            <textarea
              id="status-caption"
              rows={mediaType === 'text' ? 3 : 2}
              maxLength={300}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={
                mediaType === 'text'
                  ? 'Write what you want to share...'
                  : 'Add a short caption...'
              }
              className="w-full px-3.5 py-2.5 text-sm bg-[#F5F9F6] border border-[#C5DACD] rounded-xl text-[#112419] placeholder:text-[#7B9685] resize-none focus:outline-none focus:ring-2 focus:ring-[#15803D]/25 focus:border-[#15803D]"
            />
          </div>

          <div className="pt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                stopCameraAndRecording(true);
                onClose();
              }}
              className="min-h-[42px] px-4 py-2 rounded-xl border border-[#C5DACD] text-[#375242] text-sm font-medium hover:bg-[#F3F8F5] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="min-h-[42px] px-5 py-2 rounded-xl bg-[#15803D] hover:bg-[#166534] disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{submitting ? 'Sharing...' : 'Share status'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface StatusViewerModalProps {
  isOpen: boolean;
  authorStatuses: StatusItem[];
  initialIndex?: number;
  currentUid: string;
  currentDisplayName: string;
  currentAvatarColor: string;
  onClose: () => void;
  onViewedStatus?: (statusId: string) => void;
  onDeletedStatus?: (statusId: string) => void;
}

function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function StatusViewerModal({
  isOpen,
  authorStatuses,
  initialIndex = 0,
  currentUid,
  currentDisplayName,
  currentAvatarColor,
  onClose,
  onViewedStatus,
  onDeletedStatus,
}: StatusViewerModalProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [views, setViews] = useState<StatusViewRecord[]>([]);
  const [loadingViews, setLoadingViews] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const safeIndex = useMemo(() => {
    if (authorStatuses.length === 0) return 0;
    return Math.min(Math.max(activeIndex, 0), authorStatuses.length - 1);
  }, [activeIndex, authorStatuses.length]);

  const currentStatus = authorStatuses[safeIndex] ?? null;
  const isOwner = currentStatus?.author_id === currentUid;

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(initialIndex);
      setPaused(false);
      setViewsOpen(false);
      setViewerError(null);
    }
  }, [isOpen, initialIndex]);

  useEffect(() => {
    if (!isOpen || authorStatuses.length === 0) return;
    if (!currentStatus) return;

    if (currentStatus.author_id !== currentUid) {
      onViewedStatus?.(currentStatus.id);
      void markStatusViewed(currentStatus.id, currentStatus.author_id, {
        uid: currentUid,
        displayName: currentDisplayName,
        avatarColor: currentAvatarColor,
      });
    } else {
      setLoadingViews(true);
      void fetchStatusViews(currentStatus.id, currentUid)
        .then((records) => setViews(records))
        .catch(() => setViews([]))
        .finally(() => setLoadingViews(false));
    }
  }, [
    isOpen,
    authorStatuses.length,
    currentStatus,
    currentUid,
    currentDisplayName,
    currentAvatarColor,
    onViewedStatus,
  ]);

  const handleNext = useCallback(() => {
    if (safeIndex + 1 < authorStatuses.length) {
      setActiveIndex(safeIndex + 1);
      setViewsOpen(false);
    } else {
      onClose();
    }
  }, [safeIndex, authorStatuses.length, onClose]);

  const handlePrev = useCallback(() => {
    if (safeIndex > 0) {
      setActiveIndex(safeIndex - 1);
      setViewsOpen(false);
    }
  }, [safeIndex]);

  useEffect(() => {
    if (!isOpen || !currentStatus) return;
    if (paused || viewsOpen || deleting) return;
    if (currentStatus.media_type === 'video') return;

    const timer = window.setTimeout(() => {
      handleNext();
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [isOpen, currentStatus, paused, viewsOpen, deleting, handleNext]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowRight') {
        handleNext();
      } else if (event.key === 'ArrowLeft') {
        handlePrev();
      } else if (event.key === ' ') {
        event.preventDefault();
        setPaused((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, handleNext, handlePrev]);

  if (!isOpen || !currentStatus) return null;

  const theme = getStatusThemeById(currentStatus.background_theme);
  const sticker =
    currentStatus.media_type === 'sticker'
      ? getStickerById(currentStatus.sticker_id)
      : undefined;
  const initials = (currentStatus.author_name || 'VC').slice(0, 2).toUpperCase();

  const handleDeleteCurrent = async () => {
    if (!isOwner || deleting) return;
    setDeleting(true);
    setViewerError(null);
    try {
      const deletedId = currentStatus.id;
      await deleteStatus(deletedId);
      onDeletedStatus?.(deletedId);
      if (authorStatuses.length <= 1) {
        onClose();
      } else if (safeIndex >= authorStatuses.length - 1) {
        setActiveIndex(Math.max(0, safeIndex - 1));
      }
    } catch (err) {
      setViewerError(formatSupabaseError(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#08150E]/92 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${currentStatus.author_name} status viewer`}
    >
      <div className="relative w-full max-w-md h-[86vh] max-h-[760px] rounded-2xl overflow-hidden bg-[#0F2418] border border-white/15 shadow-2xl flex flex-col">
        {/* Top segmented progress + author header */}
        <div className="absolute top-0 inset-x-0 z-20 p-3.5 bg-gradient-to-b from-black/70 via-black/35 to-transparent space-y-3">
          <div className="flex items-center gap-1.5">
            {authorStatuses.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                aria-label={`View status ${idx + 1} of ${authorStatuses.length}`}
                onClick={() => {
                  setActiveIndex(idx);
                  setViewsOpen(false);
                }}
                className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden"
              >
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    idx < safeIndex
                      ? 'w-full bg-white'
                      : idx === safeIndex
                        ? 'w-full bg-[#4ADE80]'
                        : 'w-0 bg-white'
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 text-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ring-2 ring-white/40"
                style={{
                  backgroundColor: currentStatus.author_avatar_color || '#166534',
                }}
              >
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {isOwner ? 'My status' : currentStatus.author_name}
                </p>
                <p className="text-[11px] text-white/75">
                  {formatRelativeTime(currentStatus.created_at)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {currentStatus.media_type !== 'video' && (
                <button
                  type="button"
                  onClick={() => setPaused((prev) => !prev)}
                  aria-label={paused ? 'Resume status timer' : 'Pause status timer'}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors"
                >
                  {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
              )}
              {isOwner && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void handleDeleteCurrent()}
                  aria-label="Delete this status"
                  title="Delete status"
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-white/85 hover:text-red-200 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close status viewer"
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-white/85 hover:text-white hover:bg-white/15 transition-colors"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Media Canvas */}
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          {currentStatus.media_type === 'image' && (
            <img
              src={currentStatus.media_url}
              alt={currentStatus.caption || `${currentStatus.author_name} status picture`}
              className="w-full h-full object-contain bg-[#08150E]"
            />
          )}

          {currentStatus.media_type === 'video' && (
            <video
              key={currentStatus.id}
              src={currentStatus.media_url}
              controls
              autoPlay
              playsInline
              onEnded={handleNext}
              className="w-full h-full object-contain bg-black"
            />
          )}

          {currentStatus.media_type === 'text' && (
            <div
              className="w-full h-full flex items-center justify-center p-8 text-center"
              style={{
                background: theme.backgroundStyle,
                color: theme.textColor,
              }}
            >
              <p className="text-xl sm:text-2xl font-semibold leading-relaxed whitespace-pre-wrap break-words max-w-sm">
                {currentStatus.caption}
              </p>
            </div>
          )}

          {currentStatus.media_type === 'sticker' && (
            <div
              className="w-full h-full flex flex-col items-center justify-center p-8 text-center gap-4"
              style={{
                background: theme.backgroundStyle,
                color: theme.textColor,
              }}
            >
              <StickerArt
                stickerId={sticker?.id ?? currentStatus.sticker_id}
                className="w-36 h-36 sm:w-44 sm:h-44 drop-shadow-md"
              />
              <p className="text-base font-semibold">
                {currentStatus.caption || sticker?.label || 'Sticker'}
              </p>
            </div>
          )}

          {/* Left / Right Navigation Buttons */}
          {safeIndex > 0 && (
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous status"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 min-w-[38px] min-h-[38px] rounded-full bg-black/40 hover:bg-black/65 text-white flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            aria-label={
              safeIndex + 1 < authorStatuses.length ? 'Next status' : 'Finish viewing statuses'
            }
            className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 min-w-[38px] min-h-[38px] rounded-full bg-black/40 hover:bg-black/65 text-white flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Bottom Caption & Owner Viewers Bar */}
        {(viewerError ||
          (currentStatus.caption &&
            (currentStatus.media_type === 'image' || currentStatus.media_type === 'video')) ||
          isOwner) && (
          <div className="z-20 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-4 py-3.5 text-white space-y-2.5">
            {viewerError && (
              <div className="rounded-xl bg-red-950/90 border border-red-400/40 px-3 py-2 text-xs text-red-100">
                {viewerError}
              </div>
            )}

            {currentStatus.caption &&
              (currentStatus.media_type === 'image' || currentStatus.media_type === 'video') && (
                <p className="text-sm text-white/95 text-center leading-snug break-words">
                  {currentStatus.caption}
                </p>
              )}

            {isOwner && (
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => setViewsOpen((prev) => !prev)}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>
                    {loadingViews
                      ? 'Checking views...'
                      : `Viewed by ${views.length} ${views.length === 1 ? 'person' : 'people'}`}
                  </span>
                </button>

                {viewsOpen && (
                  <div className="mt-2.5 w-full max-h-40 overflow-y-auto rounded-xl bg-[#10261A] border border-white/15 p-2 space-y-1">
                    {views.length === 0 ? (
                      <p className="text-xs text-white/70 text-center py-2">
                        No one has viewed this status yet.
                      </p>
                    ) : (
                      views.map((view) => (
                        <div
                          key={view.viewer_id}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                              style={{ backgroundColor: view.viewer_avatar_color }}
                            >
                              {view.viewer_name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-white truncate">
                              {view.viewer_name}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono tabular-nums text-white/65 shrink-0">
                            {formatRelativeTime(view.viewed_at)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
