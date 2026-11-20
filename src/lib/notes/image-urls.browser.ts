import { useEffect, useState } from "react";

import { loadImage } from "./storage.browser";

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export function getImageUrl(id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    p = loadImage(id).then((blob) => {
      pending.delete(id);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      cache.set(id, url);
      return url;
    });
    pending.set(id, p);
  }
  return p;
}

export function primeImageUrl(id: string, blob: Blob) {
  if (!cache.has(id)) cache.set(id, URL.createObjectURL(blob));
}

export function useImageUrl(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() => (id ? (cache.get(id) ?? null) : null));
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    getImageUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}
