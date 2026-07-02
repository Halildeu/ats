import { useCallback, useRef, useState } from "react";

/* ------------------------------------------------------------------ */
/*  useDownloadWithProgress                                            */
/*                                                                     */
/*  Replaces window.open() for file downloads with:                    */
/*  - fetch() + ReadableStream progress tracking                       */
/*  - In-app notification via callback (works in both shell & MF)      */
/*  - AbortController for cancellation                                 */
/*  - Automatic Blob → hidden anchor download                          */
/*                                                                     */
/*  NOTE: This hook is toast-context-agnostic. It dispatches progress   */
/*  updates via a CustomEvent on window, which the shell's             */
/*  DownloadProgressListener picks up and renders as a toast.          */
/* ------------------------------------------------------------------ */

export interface DownloadWithProgressOptions {
  /** Downloaded file name (e.g. "kullanicilar.xlsx"). */
  filename?: string;
  /** Toast title shown during download. */
  title?: string;
  /** Extra fetch options (headers, credentials, etc.). */
  fetchOptions?: RequestInit;
}

/** Event detail shape dispatched during download lifecycle. */
export interface DownloadProgressEvent {
  /** Unique ID for this download session. */
  downloadId: string;
  /** Current phase of the download. */
  phase: "start" | "progress" | "success" | "error" | "cancelled";
  /** File name being downloaded. */
  filename: string;
  /** Title for the notification. */
  title: string;
  /** Human-readable status message. */
  message: string;
  /** Download percentage (0-100), undefined if indeterminate. */
  percent?: number;
  /** Bytes received so far. */
  receivedBytes: number;
  /** Total bytes (if known from Content-Length). */
  totalBytes?: number;
  /** Abort function to cancel the download. */
  abort?: () => void;
}

/* ---- Helpers ---- */

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function resolveFilename(
  explicit: string | undefined,
  headers: Headers,
  url: string,
): string {
  if (explicit) return explicit;

  // Try Content-Disposition header
  const disposition = headers.get("content-disposition");
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1].replace(/"/g, ""));
  }

  // Fallback: derive from URL path
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    const lastSegment = pathname.split("/").pop();
    if (lastSegment && lastSegment.includes(".")) return lastSegment;
  } catch {
    // ignore
  }

  return "download";
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  requestAnimationFrame(() => {
    URL.revokeObjectURL(url);
    anchor.remove();
  });
}

let downloadCounter = 0;

/** Dispatch a download progress event for the shell listener to render. */
function dispatchDownloadEvent(detail: DownloadProgressEvent): void {
  window.dispatchEvent(
    new CustomEvent("app:download-progress", { detail }),
  );
}

/* ---- Hook ---- */

export function useDownloadWithProgress() {
  const [isDownloading, setIsDownloading] = useState(false);
  const mountedRef = useRef(true);

  const downloadWithProgress = useCallback(
    async (url: string, options?: DownloadWithProgressOptions): Promise<void> => {
      const { filename: explicitFilename, title: titleOpt, fetchOptions } = options ?? {};
      const controller = new AbortController();
      const downloadId = `dl-${++downloadCounter}-${Date.now()}`;
      const title = titleOpt ?? "Dosya indiriliyor";

      setIsDownloading(true);

      // Notify: start
      dispatchDownloadEvent({
        downloadId,
        phase: "start",
        filename: explicitFilename ?? "...",
        title,
        message: "İndirme başlatılıyor...",
        receivedBytes: 0,
        abort: () => controller.abort(),
      });

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: "same-origin",
          ...fetchOptions,
        });

        if (!response.ok) {
          const msg =
            response.status === 429
              ? "Çok fazla istek. Lütfen bir dakika bekleyin."
              : `İndirme başarısız (HTTP ${response.status})`;
          dispatchDownloadEvent({
            downloadId,
            phase: "error",
            filename: explicitFilename ?? "download",
            title: "İndirme başarısız",
            message: msg,
            receivedBytes: 0,
          });
          return;
        }

        const contentLength = response.headers.get("content-length");
        const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;
        const isDeterminate = totalBytes !== undefined && totalBytes > 0;
        const filename = resolveFilename(explicitFilename, response.headers, url);

        // Stream download with progress
        if (response.body) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let receivedBytes = 0;
          let lastUpdateTime = 0;

          const emitProgress = (force = false) => {
            const now = Date.now();
            if (!force && now - lastUpdateTime < 200) return;
            lastUpdateTime = now;

            const percent = isDeterminate
              ? Math.round((receivedBytes / totalBytes!) * 100)
              : undefined;

            const sizeText = isDeterminate
              ? `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes!)}`
              : formatBytes(receivedBytes);

            const progressText = percent !== undefined ? ` — ${percent}%` : "";

            dispatchDownloadEvent({
              downloadId,
              phase: "progress",
              filename,
              title,
              message: `${filename} — ${sizeText}${progressText}`,
              percent,
              receivedBytes,
              totalBytes,
              abort: () => controller.abort(),
            });
          };

          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            receivedBytes += value.length;
            emitProgress();
          }

          emitProgress(true);

          const blob = new Blob(chunks as BlobPart[]);
          triggerBlobDownload(blob, filename);
        } else {
          // Fallback: no ReadableStream support
          const blob = await response.blob();
          triggerBlobDownload(blob, filename);
        }

        // Notify: success
        dispatchDownloadEvent({
          downloadId,
          phase: "success",
          filename,
          title: "İndirme tamamlandı",
          message: `${filename} indirildi`,
          receivedBytes: totalBytes ?? 0,
          totalBytes,
          percent: 100,
        });
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          dispatchDownloadEvent({
            downloadId,
            phase: "cancelled",
            filename: explicitFilename ?? "download",
            title: "İndirme iptal edildi",
            message: "İndirme iptal edildi",
            receivedBytes: 0,
          });
        } else {
          dispatchDownloadEvent({
            downloadId,
            phase: "error",
            filename: explicitFilename ?? "download",
            title: "İndirme başarısız",
            message: "Bağlantı hatası. Lütfen tekrar deneyin.",
            receivedBytes: 0,
          });
        }
      } finally {
        if (mountedRef.current) {
          setIsDownloading(false);
        }
      }
    },
    [],
  );

  return { downloadWithProgress, isDownloading };
}
