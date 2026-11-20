export interface StatusThemeOption {
  id: string;
  name: string;
  backgroundStyle: string;
  textColor: string;
  accentBg: string;
}

export const DEFAULT_STATUS_THEME_ID = 'forest';

export const STATUS_THEMES: StatusThemeOption[] = [
  {
    id: 'forest',
    name: 'Deep Forest',
    backgroundStyle: 'linear-gradient(155deg, #14532D 0%, #166534 55%, #0F3D24 100%)',
    textColor: '#FFFFFF',
    accentBg: '#166534',
  },
  {
    id: 'sage',
    name: 'Meadow Sage',
    backgroundStyle: 'linear-gradient(155deg, #D9ECE0 0%, #ECF5EF 55%, #C5DFCF 100%)',
    textColor: '#0F291A',
    accentBg: '#D9ECE0',
  },
  {
    id: 'moss',
    name: 'River Moss',
    backgroundStyle: 'linear-gradient(155deg, #365314 0%, #4D7C0F 60%, #273E0D 100%)',
    textColor: '#FFFFFF',
    accentBg: '#3F6212',
  },
  {
    id: 'teal',
    name: 'Bamboo Mist',
    backgroundStyle: 'linear-gradient(155deg, #0F766E 0%, #115E59 60%, #134E4A 100%)',
    textColor: '#FFFFFF',
    accentBg: '#0F766E',
  },
  {
    id: 'dawn',
    name: 'Morning Dew',
    backgroundStyle: 'linear-gradient(155deg, #E6F4EA 0%, #F4F9F5 52%, #DCFCE7 100%)',
    textColor: '#14532D',
    accentBg: '#DCFCE7',
  },
];

export function getStatusThemeById(id: string | null | undefined): StatusThemeOption {
  return STATUS_THEMES.find((t) => t.id === id) ?? STATUS_THEMES[0];
}

const MAX_IMAGE_DATA_URL_LENGTH = 450_000;
const MAX_VIDEO_DATA_URL_LENGTH = 720_000;

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read selected media file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read media file.'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode selected image.'));
    img.src = src;
  });
}

export async function compressStatusImage(file: Blob): Promise<string> {
  const rawUrl = await readBlobAsDataUrl(file);
  const img = await loadImageElement(rawUrl);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas image processing is unavailable in this browser.');
  }

  const maxSizes = [1080, 840, 640];
  const qualities = [0.82, 0.72, 0.58, 0.45];

  for (const maxSide of maxSizes) {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.clearRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    for (const quality of qualities) {
      const webpUrl = canvas.toDataURL('image/webp', quality);
      if (webpUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
        return webpUrl;
      }
      const jpegUrl = canvas.toDataURL('image/jpeg', quality);
      if (jpegUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
        return jpegUrl;
      }
    }
  }

  throw new Error('Selected picture is too large even after compression. Try another image.');
}

export async function captureCameraPhoto(videoEl: HTMLVideoElement): Promise<string> {
  if (!videoEl.videoWidth || !videoEl.videoHeight) {
    throw new Error('Camera feed is not ready yet.');
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas capture is unavailable in this browser.');
  }

  const scale = Math.min(1, 1080 / Math.max(videoEl.videoWidth, videoEl.videoHeight));
  canvas.width = Math.max(1, Math.round(videoEl.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(videoEl.videoHeight * scale));
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.84, 0.72, 0.58]) {
    const jpegUrl = canvas.toDataURL('image/jpeg', quality);
    if (jpegUrl.length <= MAX_IMAGE_DATA_URL_LENGTH) {
      return jpegUrl;
    }
  }

  return canvas.toDataURL('image/jpeg', 0.48);
}

function pickSupportedRecorderMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

export async function prepareStatusVideo(file: Blob): Promise<string> {
  // Fast path: already compact enough to fit directly inside a Firestore status doc
  if (file.size <= 520_000) {
    const directUrl = await readBlobAsDataUrl(file);
    if (directUrl.length <= MAX_VIDEO_DATA_URL_LENGTH) {
      return directUrl;
    }
  }

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Video is too large (max ~500 KB) and browser video compression is unavailable.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode selected video file.'));
    });

    const maxSide = 480;
    const vw = video.videoWidth || 480;
    const vh = video.videoHeight || 360;
    const scale = Math.min(1, maxSide / Math.max(vw, vh));
    const width = Math.max(160, Math.round((vw * scale) / 2) * 2);
    const height = Math.max(120, Math.round((vh * scale) / 2) * 2);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas video compression is unavailable.');
    }

    const canvasStream = canvas.captureStream(18);
    const mimeType = pickSupportedRecorderMime();
    const recorder = new MediaRecorder(canvasStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 300_000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data);
      }
    };

    const maxDurationMs = Math.min(10_000, Math.max(1500, (video.duration || 10) * 1000));

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      let rafId = 0;
      let stopped = false;

      const finish = () => {
        if (stopped) return;
        stopped = true;
        cancelAnimationFrame(rafId);
        video.pause();
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      recorder.onstop = () => {
        const outType = mimeType || 'video/webm';
        resolve(new Blob(chunks, { type: outType }));
      };
      recorder.onerror = () => {
        reject(new Error('Failed to compress video for status.'));
      };

      const drawLoop = () => {
        if (stopped) return;
        if (video.ended || video.paused) {
          finish();
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        rafId = requestAnimationFrame(drawLoop);
      };

      recorder.start(250);
      void video
        .play()
        .then(() => {
          rafId = requestAnimationFrame(drawLoop);
          window.setTimeout(finish, maxDurationMs);
        })
        .catch(() => {
          reject(new Error('Could not play selected video for processing.'));
        });
    });

    const dataUrl = await readBlobAsDataUrl(compressedBlob);
    if (dataUrl.length > MAX_VIDEO_DATA_URL_LENGTH) {
      throw new Error('Video clip is still too large. Try a shorter clip under 10 seconds.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
