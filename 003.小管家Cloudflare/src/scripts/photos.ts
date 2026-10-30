/* 图片压缩（移植自 002 app.js）：canvas 压缩 → Blob，上传 R2（不再是 dataURL 入库）
 * 最长边 1280px，先降质量再缩尺寸，目标单张 ≤200KB
 */
const PHOTO_MAX_EDGE = 1280;
const PHOTO_TARGET_BYTES = 200 * 1024;

export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      void (async () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          let scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(w, h));
          let q = 0.72;
          let out: Blob | null = null;

          const draw = (cw: number, ch: number, quality: number): Promise<Blob | null> =>
            new Promise((res) => {
              const canvas = document.createElement('canvas');
              canvas.width = cw; canvas.height = ch;
              canvas.getContext('2d')!.drawImage(img, 0, 0, cw, ch);
              canvas.toBlob((b) => res(b), 'image/jpeg', quality);
            });

          for (let i = 0; i < 8; i++) {           // 先降质量，再缩尺寸
            const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
            out = await draw(cw, ch, q);
            if (out && out.size <= PHOTO_TARGET_BYTES) break;
            if (q > 0.5) q -= 0.12; else scale *= 0.8;
          }
          if (!out) reject(new Error('compress fail'));
          else resolve(out);
        } catch (e) { reject(e); }
      })();
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load fail')); };
    img.src = url;
  });
}

export function showLightbox(src: string): void {
  const box = document.createElement('div');
  box.className = 'lightbox';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '图片预览';
  box.appendChild(img);
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}
