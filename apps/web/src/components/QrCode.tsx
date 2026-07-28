"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Each location's QR encodes its stable qr_token UUID (docs/database/DATABASE.md
// §2) — reprinting never changes the encoded value, so old labels never break.
export function QrCode({ value, size = 160 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 1 }).then((url) => {
      if (!cancelled) setDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="animate-pulse rounded bg-gray-200 dark:bg-gray-800"
        style={{ width: size, height: size }}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element -- data: URL, not an optimizable remote asset
  return <img src={dataUrl} alt={`QR code for ${value}`} width={size} height={size} />;
}
