import { createStore, del, get, keys, set } from "idb-keyval";

import type { Project } from "./types";

const store = createStore("rise-notes", "kv");

export const loadProject = () => get<Project>("project", store);
export const saveProject = (p: Project) => set("project", p, store);
export const loadPdf = () => get<ArrayBuffer>("pdf", store);
export const savePdf = (data: ArrayBuffer) => set("pdf", data, store);
export const loadImage = (id: string) => get<Blob>(`img:${id}`, store);
export const saveImage = (id: string, blob: Blob) => set(`img:${id}`, blob, store);

export async function clearAll() {
  const all = await keys(store);
  await Promise.all(all.map((k) => del(k, store)));
}
