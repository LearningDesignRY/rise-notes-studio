import coverLogoUrl from "@/assets/brand/cover-logo.png";
import headerMarkUrl from "@/assets/brand/header-amp.png";
import { docxFileName } from "@/lib/notes/normalize";
import { loadImage } from "@/lib/notes/storage.client";
import type { Marker, Project } from "@/lib/notes/types";

import { buildDocx, type BrandAssets, type DocImage } from "./build";

const iconUrls = import.meta.glob("../../assets/brand/icons/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

async function toDocImage(blob: Blob): Promise<DocImage> {
  const img = await blobToImage(blob);
  return {
    data: new Uint8Array(await blob.arrayBuffer()),
    width: img.naturalWidth,
    height: img.naturalHeight,
    type: blob.type === "image/png" ? "png" : "jpg",
  };
}

async function urlToDocImage(url: string): Promise<DocImage> {
  const blob = await (await fetch(url)).blob();
  return toDocImage(blob);
}

/** Draw numbered brand-red pins on a hotspot picture. */
export async function drawMarkers(blob: Blob, markers: Marker[]): Promise<Blob> {
  const img = await blobToImage(blob);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const r = Math.max(14, Math.round(Math.min(c.width, c.height) * 0.045));
  markers.forEach((m, i) => {
    const x = m.x * c.width;
    const y = m.y * c.height;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ed1c24";
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.18);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(r * 1.1)}px "Plus Jakarta Sans", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), x, y + r * 0.05);
  });
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/png"),
  );
}

async function loadBrand(): Promise<BrandAssets> {
  const icons: Record<string, DocImage> = {};
  await Promise.all(
    Object.entries(iconUrls).map(async ([path, url]) => {
      const key = path.split("/").pop()!.replace(".png", "");
      icons[key] = await urlToDocImage(url);
    }),
  );
  const [coverLogo, headerMark] = await Promise.all([urlToDocImage(coverLogoUrl), urlToDocImage(headerMarkUrl)]);
  return { coverLogo, headerMark, icons };
}

export async function exportDocx(project: Project): Promise<void> {
  const brand = await loadBrand();
  const blob = await buildDocx(project, {
    brand,
    getImage: async (id, withMarkers) => {
      const stored = await loadImage(id);
      if (!stored) return null;
      const markers = project.images[id]?.markers ?? [];
      const finalBlob = withMarkers && markers.length ? await drawMarkers(stored, markers) : stored;
      return toDocImage(finalBlob);
    },
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = docxFileName(project);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
